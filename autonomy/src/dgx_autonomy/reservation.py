#!/usr/bin/python3 -I
"""The inference reservation: hold the DGX's GPU for the environment, then let it go.

This file is two things. In the package it is importable (and unit-tested) as
`dgx_autonomy.reservation`. On the DGX the operator installs a root-owned copy as
`/usr/local/sbin/dgx-autonomy-reservation`, and a sudoers entry lets jim run exactly
`reserve`, `release` and `status` (host/sudoers-autonomy). So it imports nothing
but the standard library, takes no options, and runs isolated (`-I`).

The reservation is one file, `/var/lib/dgx-autonomy/reservation/record.json`. Keeper's
on-demand summary model (summary_proxy/, a jim user unit on 127.0.0.1:8091) watches
for it: while it exists the summary endpoint answers `503` and starts nothing, and a
summary model that is loaded when it appears is stopped after its in-flight requests
(at most the proxy's `reservation_grace_seconds`). Keeper's queue retries a `503`.

`reserve` writes the record first (state `reserving`), so the proxy stops loading at
once, then polls `GET /proxy/status` until the proxy reports `idle` (nothing loaded;
a refused connection means the proxy is not running, so nothing is loaded either).
Then the record says `held`, with whether a summary model was loaded and how long it
took to go. If it does not go within YIELD_TIMEOUT_S, `reserve` fails and keeps the
record: the proxy still answers `503`, and `reserve` (to wait again) or `release`
(to give up) finish it.

`release` archives the record under `released/` and removes it. It is never refused:
there is nothing to restore, and queued summaries resume on Keeper's next retry.

Output is one JSON object on stdout. Exit 0: done (or nothing to do); 2: usage;
1: failed (for `reserve`, the record stays; run `reserve` or `release` again).
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field, fields
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RECORD_DIR = Path("/var/lib/dgx-autonomy/reservation")
RECORD_NAME = "record.json"
# Keeper's summary endpoint (summary_proxy/keeper_summary_proxy.py), loopback only.
PROXY_STATUS_URL = "http://127.0.0.1:8091/proxy/status"
# The proxy gives in-flight requests up to 180 s (reservation_grace_seconds), then
# stops the model's process group (up to term_timeout_seconds more).
YIELD_TIMEOUT_S = 240.0
POLL_S = 2.0

EXIT_OK, EXIT_FAILED, EXIT_USAGE = 0, 1, 2
GIB = 1024**3


class ReservationError(RuntimeError):
    """A step failed; the record (if any) says where things stand."""


# --- the host, as far as this helper touches it ------------------------------------


ProxyStatus = Callable[[], dict[str, Any] | None]


def _meminfo() -> dict[str, int]:
    out: dict[str, int] = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, _, rest = line.partition(":")
        parts = rest.split()
        if parts and parts[0].isdigit():
            out[key] = int(parts[0]) * (1024 if parts[1:] == ["kB"] else 1)
    return out


def fetch_proxy_status(url: str = PROXY_STATUS_URL, timeout: float = 5.0) -> dict[str, Any] | None:
    """The summary proxy's /proxy/status, or None when nothing listens (nothing loaded).

    Anything else that is not a JSON object (a timeout, an HTTP error) raises OSError:
    the proxy is there but cannot say whether a model is loaded.
    """
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            raw = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise OSError(f"{url}: HTTP {exc.code}") from None
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, ConnectionRefusedError):
            return None
        raise OSError(f"{url}: {exc.reason}") from None
    except ConnectionRefusedError:
        return None
    except ValueError as exc:
        raise OSError(f"{url}: not JSON ({exc})") from None
    if not isinstance(raw, dict):
        raise OSError(f"{url}: not a JSON object")
    return raw


@dataclass
class Host:
    """Everything that touches the machine. Tests swap in a tmp root and a fake proxy."""

    root: Path = Path("/")
    proxy_status: ProxyStatus = fetch_proxy_status
    meminfo: Callable[[], Mapping[str, int]] = _meminfo
    sleep: Callable[[float], None] = time.sleep
    monotonic: Callable[[], float] = time.monotonic
    now: Callable[[], datetime] = field(default=lambda: datetime.now(UTC))

    def path(self, p: Path) -> Path:
        return self.root / p.relative_to("/")

    def mem_available(self) -> int:
        return int(self.meminfo().get("MemAvailable", 0))


def _write(path: Path, text: str, mode: int = 0o644) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


# --- the record ----------------------------------------------------------------------


@dataclass
class Record:
    """The reservation. Its existence is what the summary proxy obeys."""

    state: str  # reserving | held
    held_since: str
    # Filled in when the reservation is held: was a summary model loaded when reserve
    # began, which one, and how long until the proxy reported it gone.
    summary_model_loaded: bool | None = None
    summary_model: str | None = None
    summary_wait_seconds: float | None = None
    notes: list[str] = field(default_factory=list)

    @classmethod
    def from_json(cls, text: str) -> Record:
        """Tolerates records written by older helpers (claude-qwen's prior_* fields)."""
        raw = json.loads(text)
        if not isinstance(raw, dict):
            raise ReservationError("reservation record is not a JSON object")
        known = {f.name for f in fields(cls)}
        kept = {k: v for k, v in raw.items() if k in known}
        kept.setdefault("state", "held")
        kept.setdefault("held_since", "")
        if not isinstance(kept.get("notes"), list):
            kept["notes"] = []
        return cls(**kept)


class Reservation:
    def __init__(self, host: Host | None = None) -> None:
        self.host = host or Host()

    @property
    def record_dir(self) -> Path:
        return self.host.path(RECORD_DIR)

    @property
    def record_path(self) -> Path:
        return self.record_dir / RECORD_NAME

    def read_record(self) -> Record | None:
        try:
            return Record.from_json(self.record_path.read_text())
        except FileNotFoundError:
            return None

    def _save(self, record: Record) -> None:
        self.record_dir.mkdir(mode=0o755, parents=True, exist_ok=True)
        _write(self.record_path, json.dumps(asdict(record), indent=2) + "\n")

    def _proxy(self) -> dict[str, Any] | str:
        """The proxy's status, "not running", or why it could not be read."""
        try:
            status = self.host.proxy_status()
        except OSError as exc:
            return f"unreadable: {exc}"
        return "not running" if status is None else status

    # --- reserve -------------------------------------------------------------------------

    def reserve(self) -> dict[str, Any]:
        existing = self.read_record()
        if existing is not None and existing.state == "held":
            return {"reservation": "held", "already": True, "record": asdict(existing)}
        # A record from a reserve that timed out (or an older helper's half-done one)
        # is kept: the proxy has obeyed it since then, and held_since stays.
        now = self.host.now().isoformat(timespec="seconds")
        record = existing or Record(state="reserving", held_since=now)
        record.state = "reserving"
        # Written before anything else: from here on the proxy starts nothing.
        self._save(record)

        started = self.host.monotonic()
        loaded = False
        model: str | None = None
        last: dict[str, Any] | str = "not read"
        while True:
            last = self._proxy()
            if last == "not running":
                break
            if isinstance(last, dict):
                if last.get("state") == "idle":
                    break
                loaded = True
                model = str(last.get("model")) if last.get("model") else model
            waited = self.host.monotonic() - started
            if waited > YIELD_TIMEOUT_S:
                state = last.get("state") if isinstance(last, dict) else last
                record.notes.append(
                    f"{now}: the summary model had not stopped after {waited:.0f}s (last: {state})"
                )
                self._save(record)
                raise ReservationError(
                    f"the summary model did not stop within {YIELD_TIMEOUT_S:.0f}s"
                    f" (last: {state}). The record stays, so nothing new loads; run"
                    " `reserve` again to keep waiting, or `release` to give up."
                )
            self.host.sleep(POLL_S)

        record.state = "held"
        record.summary_model_loaded = loaded
        record.summary_model = model if loaded else None
        record.summary_wait_seconds = round(self.host.monotonic() - started, 1)
        if isinstance(last, dict) and last.get("reserved") is False:
            record.notes.append(
                f"the summary proxy does not see {RECORD_DIR / RECORD_NAME}; check its"
                " reservation_paths"
            )
        self._save(record)
        return {"reservation": "held", "already": False, "record": asdict(record)}

    # --- release -------------------------------------------------------------------------

    def release(self) -> dict[str, Any]:
        try:
            text = self.record_path.read_text()
        except FileNotFoundError:
            return {"reservation": "none", "already": True}
        try:
            held_since: str | None = Record.from_json(text).held_since
        except (ReservationError, ValueError, TypeError):
            held_since = None  # unreadable: archived as it is, removed all the same
        released = self.record_dir / "released"
        released.mkdir(mode=0o755, exist_ok=True)
        stamp = self.host.now().strftime("%Y%m%dT%H%M%SZ")
        archived = released / f"{stamp}.json"
        _write(archived, text)
        self.record_path.unlink()
        return {
            "reservation": "released",
            "already": False,
            "held_since": held_since,
            "archived": str(RECORD_DIR / "released" / archived.name),
        }

    # --- status --------------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        record = self.read_record()
        return {
            "reservation": record.state if record else "none",
            "record": asdict(record) if record else None,
            "summary_proxy": self._proxy(),
            "mem_available_gib": round(self.host.mem_available() / GIB, 1),
        }


def main(argv: Sequence[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1 or args[0] not in ("reserve", "release", "status"):
        print("usage: dgx-autonomy-reservation reserve|release|status", file=sys.stderr)
        return EXIT_USAGE
    reservation = Reservation()
    try:
        out = getattr(reservation, args[0])()
        code = EXIT_OK
    except (ReservationError, OSError, ValueError) as exc:
        out, code = {"error": f"{type(exc).__name__}: {exc}"}, EXIT_FAILED
    print(json.dumps(out, indent=2, default=str))
    return code


if __name__ == "__main__":
    sys.exit(main())
