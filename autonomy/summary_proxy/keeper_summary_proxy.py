#!/usr/bin/python3 -I
"""Keeper's summary model, served on demand, yielding the GPU to autonomy runs.

One OpenAI-compatible endpoint (default 127.0.0.1:8091) with its own API key. Nothing
is loaded until a request arrives:

- The first ``POST /v1/chat/completions`` (or ``GET /v1/models``) with no model loaded
  starts the configured model server on a private port and answers ``503`` with
  ``Retry-After`` until the server's ``/health`` says it can serve. Then requests are
  proxied to it.
- After ``idle_seconds`` (default 600) with no request and nothing in flight, the model
  process is stopped and its memory is free again -- unless a client this endpoint turned
  away with a ``503`` has not come back yet (see below).
- While an inference reservation is held (any of ``reservation_paths`` exists; the
  dgx-autonomy helper writes ``/var/lib/dgx-autonomy/reservation/record.json`` before it
  changes anything), every request answers ``503`` and nothing is started. A reservation
  that appears while a model is loaded stops it: requests in flight may finish, for at
  most ``reservation_grace_seconds``, then the process group is terminated.
- A model is never started while ``MemAvailable`` is below the model's ``need_gib`` plus
  ``headroom_gib``: something else (retained demos, a model loaded without the reservation)
  holds the memory, and Keeper's queue waits on the ``503`` instead.

Keeper's summary queue retries any failure with a doubling backoff (5 s up to 30 min, 40
attempts), so every "not now" here is a ``503``; a request cut off by a reservation stop
is a ``503`` too, never a half answer.

That backoff is per job, so a job that has already waited (through a reservation, or a
busy DGX) comes back only every 10, 20, then 30 minutes. If the idle stop ran on its own,
such a job would start the model with its 503, the model would idle out before the job's
next attempt, and the next attempt would find it cold again -- for all 40 attempts. So
every request answered ``503`` is remembered by a SHA-256 of its method, path and body
(never the body itself), and a loaded model is not stopped for idleness while one of
those has not been served again, for at most ``turned_away_hold_seconds`` (default 1860,
Keeper's 30-minute ceiling plus a minute) after it was turned away. The reservation still
stops the model at once; the hold only defers the idle stop.

Content stays out of the logs: one line per request (method, path, status, duration,
bytes), never a body. ``GET /proxy/status`` is unauthenticated and content-free, for the
reservation helper and the operator. ``POST /proxy/unload`` (with the key) stops the model
now.

Standard library only, like reservation.py, so it runs from the system python3 under a
systemd user unit (see keeper-summary.service).
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import hmac
import http.client
import json
import os
import secrets
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

GIB = 1024**3
DEFAULT_RESERVATION = "/var/lib/dgx-autonomy/reservation/record.json"
HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "content-length",
        "server",
        "date",
    }
)
# What the endpoint serves; everything else is a 404 and never reaches the model.
ROUTES: Mapping[str, frozenset[str]] = {
    "GET": frozenset({"/v1/models"}),
    "POST": frozenset({"/v1/chat/completions"}),
}
MAX_BODY_BYTES = 32 * 1024 * 1024
# Turned-away requests remembered at once (digests only); the oldest go first beyond it.
MAX_TURNED_AWAY = 4096


# --- configuration ------------------------------------------------------------------


@dataclass(frozen=True)
class ModelSpec:
    """How to run one model server. ``argv`` may use {port}, {backend_key_file}, {host}."""

    name: str
    argv: tuple[str, ...]
    need_gib: float
    health_path: str = "/health"
    load_timeout_seconds: float = 900.0
    env: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Config:
    model: ModelSpec
    api_key_file: Path
    listen_host: str = "127.0.0.1"
    listen_port: int = 8091
    backend_host: str = "127.0.0.1"
    backend_port: int = 18091
    state_dir: Path = Path.home() / ".local/state/keeper-summary"
    idle_seconds: float = 600.0
    reservation_paths: tuple[Path, ...] = (Path(DEFAULT_RESERVATION),)
    reservation_grace_seconds: float = 180.0
    headroom_gib: float = 10.0
    request_timeout_seconds: float = 900.0
    term_timeout_seconds: float = 30.0
    poll_seconds: float = 2.0
    health_poll_seconds: float = 1.0
    retry_after_loading: int = 10
    retry_after_busy: int = 60
    retry_after_failed: int = 60
    failed_cooldown_seconds: float = 60.0
    turned_away_hold_seconds: float = 1860.0
    meminfo_path: Path = Path("/proc/meminfo")

    @classmethod
    def load(cls, path: Path) -> Config:
        raw = json.loads(path.read_text())
        return cls.from_dict(raw, base=path.parent)

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any], base: Path | None = None) -> Config:
        models = raw["models"]
        name = raw["model"]
        if name not in models:
            raise ValueError(f"model {name!r} is not in models: {sorted(models)}")
        m = models[name]
        spec = ModelSpec(
            name=name,
            argv=tuple(str(a) for a in m["argv"]),
            need_gib=float(m["need_gib"]),
            health_path=m.get("health_path", "/health"),
            load_timeout_seconds=float(m.get("load_timeout_seconds", 900)),
            env={str(k): str(v) for k, v in (m.get("env") or {}).items()},
        )

        def p(value: str) -> Path:
            out = Path(os.path.expanduser(value))
            return out if out.is_absolute() or base is None else base / out

        host, _, port = str(raw.get("listen", "127.0.0.1:8091")).rpartition(":")
        known = set(cls.__dataclass_fields__)
        simple = {
            k: raw[k]
            for k in (
                "idle_seconds",
                "reservation_grace_seconds",
                "headroom_gib",
                "request_timeout_seconds",
                "term_timeout_seconds",
                "poll_seconds",
                "health_poll_seconds",
                "retry_after_loading",
                "retry_after_busy",
                "retry_after_failed",
                "failed_cooldown_seconds",
                "turned_away_hold_seconds",
                "backend_port",
                "backend_host",
            )
            if k in raw and k in known
        }
        return cls(
            model=spec,
            api_key_file=p(raw.get("api_key_file", "~/.config/keeper-summary/api-key")),
            listen_host=host or "127.0.0.1",
            listen_port=int(port),
            state_dir=p(raw.get("state_dir", "~/.local/state/keeper-summary")),
            reservation_paths=tuple(
                p(x) for x in raw.get("reservation_paths", [DEFAULT_RESERVATION])
            ),
            meminfo_path=p(raw.get("meminfo_path", "/proc/meminfo")),
            **simple,
        )


def read_key(path: Path) -> str:
    """The endpoint's key. Refused unless only the owner can read it."""
    mode = path.stat().st_mode & 0o777
    if mode & 0o077:
        raise PermissionError(f"{path} is mode {mode:o}; it must be 0600")
    key = path.read_text().strip()
    if len(key) < 16:
        raise ValueError(f"{path} holds no usable key")
    return key


def mem_available_bytes(meminfo: Path) -> int:
    for line in meminfo.read_text().splitlines():
        if line.startswith("MemAvailable:"):
            parts = line.split()
            return int(parts[1]) * (1024 if parts[2:] == ["kB"] else 1)
    return 0


def request_digest(method: str, path: str, body: bytes) -> str:
    """Who to wait for, without keeping what they sent: a retry sends the same bytes."""
    h = hashlib.sha256()
    h.update(f"{method} {path}\n".encode())
    h.update(body)
    return h.hexdigest()


def log(msg: str) -> None:
    print(f"keeper-summary: {msg}", file=sys.stderr, flush=True)


# --- the model process ----------------------------------------------------------------


def _http_status(url: str, timeout: float = 3.0) -> int:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return int(resp.status)
    except urllib.error.HTTPError as exc:
        return int(exc.code)
    except (OSError, ValueError):
        return 0


class Supervisor:
    """The state machine: idle -> starting -> ready -> stopping -> idle.

    One lock guards everything; the request threads, the health poller and the monitor
    only change state through it.
    """

    def __init__(
        self,
        config: Config,
        *,
        clock: Callable[[], float] = time.monotonic,
        http_status: Callable[[str], int] = _http_status,
    ) -> None:
        self.cfg = config
        self.clock = clock
        self.http_status = http_status
        self.lock = threading.Condition()
        self.state = "idle"
        self.proc: subprocess.Popen[bytes] | None = None
        self.inflight = 0
        self.last_activity = clock()
        self.loaded_at: float | None = None
        self.start_requested_at: float | None = None
        self.failed_until = 0.0
        self.last_error: str | None = None
        self.last_stop_reason: str | None = None
        self.generation = 0  # bumps on every start; a request knows which process it used
        self.loads = 0
        self.last_load_seconds: float | None = None
        self.last_refusal: str | None = None
        # sha256(method, path, body) -> when it was last answered 503. Content-free.
        self.turned_away: dict[str, float] = {}
        self._stopping_thread: threading.Thread | None = None
        self._closed = threading.Event()
        self.backend_key = secrets.token_urlsafe(32)
        self.cfg.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.backend_key_file = self.cfg.state_dir / "backend-key"
        fd = os.open(self.backend_key_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as fh:
            fh.write(self.backend_key + "\n")
        os.chmod(self.backend_key_file, 0o600)

    # -- facts --------------------------------------------------------------------

    def reserved(self) -> bool:
        return any(p.exists() for p in self.cfg.reservation_paths)

    def mem_available(self) -> int:
        try:
            return mem_available_bytes(self.cfg.meminfo_path)
        except OSError:
            return 0

    # -- admission ----------------------------------------------------------------

    def admit(self, digest: str | None = None) -> tuple[str, Any]:
        """('proxy', generation) or ('busy', (reason, retry_after)). Counts as activity.

        A request turned away is remembered by ``digest`` until it is served (``done``).
        """
        with self.lock:
            verdict, value = self._admit_locked()
            if verdict == "busy" and digest is not None:
                self._remember_locked(digest)
            return verdict, value

    def _remember_locked(self, digest: str) -> None:
        self.turned_away.pop(digest, None)
        self.turned_away[digest] = self.clock()
        while len(self.turned_away) > MAX_TURNED_AWAY:
            self.turned_away.pop(next(iter(self.turned_away)))

    def _waiting_locked(self) -> int:
        """Turned-away requests still expected back; expired ones are forgotten."""
        horizon = self.clock() - self.cfg.turned_away_hold_seconds
        for d in [d for d, t in self.turned_away.items() if t <= horizon]:
            del self.turned_away[d]
        return len(self.turned_away)

    def _admit_locked(self) -> tuple[str, Any]:
        self.last_activity = self.clock()
        if self.reserved():
            if self.state in ("starting", "ready"):
                self._begin_stop_locked("reservation")
            return "busy", ("reserved: an autonomy run holds the DGX inference", 120)
        if self.state == "ready":
            if self.proc is not None and self.proc.poll() is None:
                self.inflight += 1
                return "proxy", self.generation
            self._exited_locked("the model process exited")
        if self.state == "starting":
            return "busy", (
                "loading: the summary model is starting",
                self.cfg.retry_after_loading,
            )
        if self.state == "stopping":
            return "busy", (
                "stopping: the summary model is unloading",
                self.cfg.retry_after_loading,
            )
        # idle
        now = self.clock()
        if now < self.failed_until:
            return "busy", (
                f"failed: the summary model did not start ({self.last_error})",
                self.cfg.retry_after_failed,
            )
        need = int((self.cfg.model.need_gib + self.cfg.headroom_gib) * GIB)
        available = self.mem_available()
        if available < need:
            self.last_refusal = (
                f"memory: {available / GIB:.1f} GiB available, {need / GIB:.1f} GiB needed"
            )
            return "busy", (
                "busy: not enough free memory on the DGX for the summary model",
                self.cfg.retry_after_busy,
            )
        self._start_locked()
        return "busy", ("loading: the summary model is starting", self.cfg.retry_after_loading)

    def done(self, generation: int, digest: str | None = None, status: int = 0) -> None:
        """A proxied request ended. Served: its client is no longer waited for. Cut off by
        a stop (503): it will be back, like any other turned-away request."""
        with self.lock:
            if digest is not None and status == 200:
                self.turned_away.pop(digest, None)
            elif digest is not None and status == 503:
                self._remember_locked(digest)
            self.inflight = max(0, self.inflight - 1)
            self.last_activity = self.clock()
            self.lock.notify_all()

    def cut_off(self, generation: int) -> bool:
        """Whether the process a request used has been stopped (or replaced) since."""
        with self.lock:
            return generation != self.generation or self.state in ("stopping", "idle")

    # -- start ------------------------------------------------------------------------

    def _argv(self) -> list[str]:
        values = {
            "port": str(self.cfg.backend_port),
            "host": self.cfg.backend_host,
            "backend_key_file": str(self.backend_key_file),
        }
        return [a.format(**values) for a in self.cfg.model.argv]

    def _start_locked(self) -> None:
        if _port_in_use(self.cfg.backend_host, self.cfg.backend_port):
            self.last_error = f"port {self.cfg.backend_port} is already in use"
            self.failed_until = self.clock() + self.cfg.failed_cooldown_seconds
            log(f"not starting {self.cfg.model.name}: {self.last_error}")
            return
        env = dict(os.environ)
        env.update(self.cfg.model.env)
        logf = open(self.cfg.state_dir / "model.log", "wb")  # noqa: SIM115 - child owns it
        try:
            self.proc = subprocess.Popen(
                self._argv(),
                stdin=subprocess.DEVNULL,
                stdout=logf,
                stderr=subprocess.STDOUT,
                env=env,
                start_new_session=True,  # its own process group, so a stop takes all of it
            )
        except OSError as exc:
            self.last_error = f"cannot start: {exc}"
            self.failed_until = self.clock() + self.cfg.failed_cooldown_seconds
            log(f"{self.cfg.model.name}: {self.last_error}")
            return
        finally:
            logf.close()
        self.generation += 1
        self.state = "starting"
        self.start_requested_at = self.clock()
        self.last_error = None
        log(f"starting {self.cfg.model.name} (pid {self.proc.pid}, port {self.cfg.backend_port})")
        threading.Thread(
            target=self._await_health, args=(self.generation,), daemon=True, name="health"
        ).start()

    def _await_health(self, generation: int) -> None:
        url = f"http://{self.cfg.backend_host}:{self.cfg.backend_port}{self.cfg.model.health_path}"
        deadline = self.clock() + self.cfg.model.load_timeout_seconds
        while not self._closed.is_set():
            with self.lock:
                if generation != self.generation or self.state != "starting":
                    return
                proc = self.proc
                if proc is None or proc.poll() is not None:
                    code = None if proc is None else proc.returncode
                    self._failed_locked(f"exited while loading (exit {code})")
                    return
            if self.http_status(url) == 200:
                with self.lock:
                    if generation != self.generation or self.state != "starting":
                        return
                    self.state = "ready"
                    self.loaded_at = self.clock()
                    # Idle counts from when the model could first answer, so a client
                    # backing off through the load still finds it there.
                    self.last_activity = self.loaded_at
                    self.loads += 1
                    assert self.start_requested_at is not None
                    self.last_load_seconds = self.loaded_at - self.start_requested_at
                    log(f"{self.cfg.model.name} ready after {self.last_load_seconds:.1f}s")
                    self.lock.notify_all()
                return
            if self.clock() > deadline:
                with self.lock:
                    if generation == self.generation and self.state == "starting":
                        self._failed_locked(
                            f"not healthy after {self.cfg.model.load_timeout_seconds:.0f}s"
                        )
                return
            time.sleep(self.cfg.health_poll_seconds)

    def _failed_locked(self, why: str) -> None:
        self.last_error = why
        self.failed_until = self.clock() + self.cfg.failed_cooldown_seconds
        log(f"{self.cfg.model.name} failed to start: {why}")
        self._begin_stop_locked("load failed", grace=0.0)

    def _exited_locked(self, why: str) -> None:
        log(f"{self.cfg.model.name}: {why} (exit {self.proc.returncode if self.proc else None})")
        self.proc = None
        self.state = "idle"
        self.loaded_at = None
        self.last_stop_reason = why
        self.lock.notify_all()

    # -- stop -------------------------------------------------------------------------

    def _begin_stop_locked(self, reason: str, grace: float | None = None) -> None:
        if self.state in ("stopping", "idle"):
            return
        self.state = "stopping"
        if grace is None:
            grace = self.cfg.reservation_grace_seconds if reason == "reservation" else 0.0
        log(f"stopping {self.cfg.model.name}: {reason} ({self.inflight} in flight)")
        t = threading.Thread(target=self._stop, args=(reason, grace), daemon=True, name="stop")
        self._stopping_thread = t
        t.start()

    def request_stop(self, reason: str, grace: float | None = None) -> None:
        with self.lock:
            self._begin_stop_locked(reason, grace)

    def _stop(self, reason: str, grace: float) -> None:
        with self.lock:
            deadline = self.clock() + grace
            while self.inflight > 0 and self.clock() < deadline:
                self.lock.wait(timeout=min(1.0, max(0.05, deadline - self.clock())))
            cut = self.inflight
            proc = self.proc
        if cut:
            log(f"{cut} request(s) still in flight after {grace:.0f}s; stopping anyway")
        if proc is not None:
            _terminate_group(proc, self.cfg.term_timeout_seconds)
        with self.lock:
            self.proc = None
            self.state = "idle"
            self.loaded_at = None
            self.last_stop_reason = reason
            self.lock.notify_all()
        log(f"{self.cfg.model.name} stopped ({reason})")

    # -- the monitor ----------------------------------------------------------------

    def tick(self) -> None:
        """One pass of the monitor: reservation, crash and idle checks."""
        with self.lock:
            if self.state in ("starting", "ready") and self.reserved():
                self._begin_stop_locked("reservation")
                return
            if self.state == "ready" and (self.proc is None or self.proc.poll() is not None):
                self._exited_locked("the model process exited")
                return
            if (
                self.state == "ready"
                and self.inflight == 0
                and self.clock() - self.last_activity >= self.cfg.idle_seconds
                and self._waiting_locked() == 0
            ):
                self._begin_stop_locked("idle")

    def monitor(self) -> None:
        while not self._closed.wait(self.cfg.poll_seconds):
            try:
                self.tick()
            except Exception as exc:
                log(f"monitor: {type(exc).__name__}: {exc}")

    def close(self) -> None:
        """Proxy shutdown: stop the model now, wait for it."""
        self._closed.set()
        with self.lock:
            self._begin_stop_locked("proxy shutdown", grace=0.0)
            t = self._stopping_thread
        if t is not None:
            t.join(timeout=self.cfg.term_timeout_seconds + 10)

    def wait_state(self, state: str, timeout: float) -> bool:
        end = time.monotonic() + timeout
        with self.lock:
            while self.state != state:
                left = end - time.monotonic()
                if left <= 0:
                    return False
                self.lock.wait(timeout=min(left, 0.2))
            return True

    def status(self) -> dict[str, Any]:
        with self.lock:
            now = self.clock()
            idle_left = None
            waiting = self._waiting_locked()
            if self.state == "ready" and self.inflight == 0:
                idle_left = max(0.0, self.cfg.idle_seconds - (now - self.last_activity))
                if waiting:  # the idle stop also waits for the last turned-away client
                    last = max(self.turned_away.values())
                    idle_left = max(idle_left, last + self.cfg.turned_away_hold_seconds - now)
            return {
                "state": self.state,
                "model": self.cfg.model.name,
                "reserved": self.reserved(),
                "inflight": self.inflight,
                "pid": self.proc.pid if self.proc is not None else None,
                "loaded_for_seconds": round(now - self.loaded_at, 1) if self.loaded_at else None,
                "idle_seconds_left": round(idle_left, 1) if idle_left is not None else None,
                "idle_seconds": self.cfg.idle_seconds,
                "loads": self.loads,
                "turned_away_waiting": waiting,
                "last_load_seconds": round(self.last_load_seconds, 1)
                if self.last_load_seconds is not None
                else None,
                "last_stop_reason": self.last_stop_reason,
                "last_error": self.last_error,
                "last_refusal": self.last_refusal,
                "need_gib": self.cfg.model.need_gib + self.cfg.headroom_gib,
                "mem_available_gib": round(self.mem_available() / GIB, 1),
            }


def _port_in_use(host: str, port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def _terminate_group(proc: subprocess.Popen[bytes], timeout: float) -> None:
    for sig, wait in ((signal.SIGTERM, timeout), (signal.SIGKILL, 10.0)):
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(proc.pid, sig)
        try:
            proc.wait(timeout=wait)
            return
        except subprocess.TimeoutExpired:
            continue


# --- the HTTP side ---------------------------------------------------------------------


def make_handler(sup: Supervisor, api_key: str) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "keeper-summary"
        sys_version = ""

        def log_message(self, format: str, *args: Any) -> None:
            return  # one content-free line per request is written by _done instead

        def _done(self, status: int, nbytes: int, started: float) -> None:
            path = self.path.split("?", 1)[0]
            ms = (time.monotonic() - started) * 1000
            log(f"{self.command} {path} {status} {ms:.0f}ms {nbytes}B")

        def _json(self, status: int, obj: Any, headers: Mapping[str, str] | None = None) -> int:
            body = (json.dumps(obj) + "\n").encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)
            return len(body)

        def _busy(self, reason: str, retry_after: int) -> int:
            kind = reason.split(":", 1)[0]
            return self._json(
                503,
                {"error": {"message": reason, "type": kind, "code": 503}},
                {"Retry-After": str(int(retry_after))},
            )

        def _authorized(self) -> bool:
            got = self.headers.get("Authorization", "")
            scheme, _, token = got.partition(" ")
            return scheme.lower() == "bearer" and hmac.compare_digest(
                token.strip().encode(), api_key.encode()
            )

        def _read_body(self) -> bytes | None:
            length = self.headers.get("Content-Length")
            if length is None:
                return b""
            n = int(length)
            if n < 0 or n > MAX_BODY_BYTES:
                return None
            return self.rfile.read(n)

        def do_GET(self) -> None:
            self._handle()

        def do_POST(self) -> None:
            self._handle()

        def _handle(self) -> None:
            started = time.monotonic()
            path = self.path.split("?", 1)[0]
            status, nbytes = 500, 0
            try:
                body = self._read_body() if self.command == "POST" else b""
                if body is None:
                    status, nbytes = 413, self._json(413, {"error": {"message": "body too large"}})
                elif self.command == "GET" and path == "/proxy/status":
                    status, nbytes = 200, self._json(200, sup.status())
                elif not self._authorized():
                    status, nbytes = (
                        401,
                        self._json(
                            401, {"error": {"message": "missing or wrong API key", "code": 401}}
                        ),
                    )
                elif self.command == "POST" and path == "/proxy/unload":
                    sup.request_stop("operator", grace=sup.cfg.reservation_grace_seconds)
                    status, nbytes = 202, self._json(202, sup.status())
                elif path not in ROUTES.get(self.command, ()):
                    status, nbytes = 404, self._json(404, {"error": {"message": "not found"}})
                else:
                    status, nbytes = self._forward(path, body)
            except (BrokenPipeError, ConnectionResetError):
                status = 499
                self.close_connection = True
            except Exception as exc:
                log(f"{self.command} {path}: {type(exc).__name__}")
                with contextlib.suppress(Exception):
                    nbytes = self._json(500, {"error": {"message": "proxy error"}})
            finally:
                self._done(status, nbytes, started)

        def _forward(self, path: str, body: bytes) -> tuple[int, int]:
            digest = request_digest(self.command, path, body)
            verdict, value = sup.admit(digest)
            if verdict == "busy":
                reason, retry_after = value
                return 503, self._busy(reason, retry_after)
            generation = value
            status = 0
            try:
                status, nbytes = self._relay(path, body, generation)
                return status, nbytes
            finally:
                sup.done(generation, digest, status)

        def _relay(self, path: str, body: bytes, generation: int) -> tuple[int, int]:
            conn = http.client.HTTPConnection(
                sup.cfg.backend_host, sup.cfg.backend_port, timeout=sup.cfg.request_timeout_seconds
            )
            headers = {
                "Authorization": f"Bearer {sup.backend_key}",
                "Content-Type": self.headers.get("Content-Type", "application/json"),
                "Accept": self.headers.get("Accept", "*/*"),
            }
            try:
                conn.request(self.command, path, body=body or None, headers=headers)
                resp = conn.getresponse()
                streamed = resp.getheader("Content-Length") is None
                if not streamed:
                    data = resp.read()
            except (OSError, http.client.HTTPException) as exc:
                conn.close()
                if sup.cut_off(generation) or sup.reserved():
                    return 503, self._busy(
                        "reserved: the summary model was stopped for an autonomy run", 120
                    )
                return 502, self._json(
                    502, {"error": {"message": f"model server: {type(exc).__name__}"}}
                )
            try:
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in HOP_BY_HOP:
                        self.send_header(k, v)
                if not streamed:
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return resp.status, len(data)
                # Streamed (SSE): relay as it comes, then close; no length is known.
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True
                total = 0
                while True:
                    chunk = resp.read1(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    total += len(chunk)
                return resp.status, total
            finally:
                conn.close()

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def build(config: Config) -> tuple[Server, Supervisor]:
    key = read_key(config.api_key_file)
    sup = Supervisor(config)
    server = Server((config.listen_host, config.listen_port), make_handler(sup, key))
    return server, sup


def serve(config: Config) -> int:
    server, sup = build(config)
    threading.Thread(target=sup.monitor, daemon=True, name="monitor").start()

    def shutdown(signum: int, frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    log(
        f"listening on {config.listen_host}:{config.listen_port}; model {config.model.name}"
        f" (needs {config.model.need_gib + config.headroom_gib:.0f} GiB available),"
        f" idle stop after {config.idle_seconds:.0f}s; nothing loaded"
    )
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        sup.close()
        server.server_close()
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="keeper-summary-proxy", description=__doc__.split("\n")[0])
    ap.add_argument("command", choices=("serve", "check-config"))
    ap.add_argument("--config", default="/home/jim/keeper-summary/config.json")
    args = ap.parse_args(argv)
    config = Config.load(Path(args.config))
    if args.command == "check-config":
        read_key(config.api_key_file)
        print(json.dumps({"model": config.model.name, "argv": list(config.model.argv)}, indent=2))
        return 0
    return serve(config)


if __name__ == "__main__":
    sys.exit(main())
