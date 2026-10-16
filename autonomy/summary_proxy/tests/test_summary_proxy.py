"""The on-demand summary endpoint, end to end, with a stub model process.

Each test runs the real proxy on a free localhost port and the real stub_model.py as the
model server it starts and stops, so start, load, proxying, idle stop and the
reservation are exercised through processes and sockets, not mocks.
"""

from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import keeper_summary_proxy as ksp  # noqa: E402

KEY = "test-key-0123456789abcdef"
GIB_KB = 1024 * 1024


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # A zombie still answers kill(0); it has no memory left, which is what matters.
    try:
        with open(f"/proc/{pid}/status") as fh:
            return "zombie" not in fh.read()
    except FileNotFoundError:
        return True  # no /proc (macOS): kill(0) succeeded


@dataclass
class Proxy:
    url: str
    sup: ksp.Supervisor
    reservation: Path
    meminfo: Path
    pid_file: Path
    server: ksp.Server

    def request(
        self, path: str, body: dict[str, Any] | None = None, key: str | None = KEY
    ) -> tuple[int, dict[str, str], dict[str, Any]]:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            self.url + path, data=data, method="POST" if body is not None else "GET"
        )
        req.add_header("Content-Type", "application/json")
        if key is not None:
            req.add_header("Authorization", f"Bearer {key}")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, dict(resp.headers), json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            return exc.code, dict(exc.headers), json.loads(exc.read() or b"{}")

    def chat(self, **extra: Any) -> tuple[int, dict[str, str], dict[str, Any]]:
        body = {"model": "summary", "messages": [{"role": "user", "content": "hi"}], **extra}
        return self.request("/v1/chat/completions", body)

    def until_ready(self, timeout: float = 15.0) -> dict[str, Any]:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            status, _, body = self.chat()
            if status == 200:
                return body
            assert status == 503, body
            time.sleep(0.1)
        raise AssertionError("the model never became ready")

    def model_pid(self) -> int:
        return int(self.pid_file.read_text())

    def set_mem_gib(self, gib: float) -> None:
        self.meminfo.write_text(
            f"MemTotal: {128 * GIB_KB} kB\nMemAvailable: {int(gib * GIB_KB)} kB\n"
        )


def make_proxy(tmp_path: Path, **overrides: Any) -> Iterator[Proxy]:
    key_file = tmp_path / "api-key"
    key_file.write_text(KEY + "\n")
    key_file.chmod(0o600)
    meminfo = tmp_path / "meminfo"
    reservation = tmp_path / "reservation" / "record.json"
    reservation.parent.mkdir()
    pid_file = tmp_path / "stub.pid"
    load_seconds = overrides.pop("load_seconds", 0.6)
    raw = {
        "listen": f"127.0.0.1:{free_port()}",
        "backend_port": free_port(),
        "api_key_file": str(key_file),
        "state_dir": str(tmp_path / "state"),
        "reservation_paths": [str(reservation)],
        "meminfo_path": str(meminfo),
        "idle_seconds": 1.5,
        "poll_seconds": 0.1,
        "health_poll_seconds": 0.1,
        "reservation_grace_seconds": 3.0,
        "term_timeout_seconds": 5.0,
        "headroom_gib": 10,
        "failed_cooldown_seconds": 1.0,
        "model": "stub",
        "models": {
            "stub": {
                "argv": [
                    sys.executable, str(HERE / "stub_model.py"),
                    "--port", "{port}", "--api-key-file", "{backend_key_file}",
                    "--load-seconds", str(load_seconds), "--pid-file", str(pid_file),
                ],
                "need_gib": 20,
                "load_timeout_seconds": overrides.pop("load_timeout_seconds", 20),
            }
        },
    }  # fmt: skip
    raw.update(overrides)
    config = ksp.Config.from_dict(raw)
    server, sup = ksp.build(config)
    proxy = Proxy(
        url=f"http://127.0.0.1:{config.listen_port}",
        sup=sup,
        reservation=reservation,
        meminfo=meminfo,
        pid_file=pid_file,
        server=server,
    )
    proxy.set_mem_gib(100)
    threading.Thread(
        target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True
    ).start()
    threading.Thread(target=sup.monitor, daemon=True).start()
    try:
        yield proxy
    finally:
        server.shutdown()
        sup.close()
        server.server_close()


@pytest.fixture
def proxy(tmp_path: Path) -> Iterator[Proxy]:
    yield from make_proxy(tmp_path)


# --- start and load -----------------------------------------------------------------


def test_nothing_is_loaded_until_a_request_arrives(proxy: Proxy) -> None:
    time.sleep(0.5)
    assert proxy.sup.status()["state"] == "idle"
    assert not proxy.pid_file.exists()


def test_a_cold_request_answers_503_with_retry_after_and_starts_the_model(proxy: Proxy) -> None:
    status, headers, body = proxy.chat()
    assert status == 503
    assert int(headers["Retry-After"]) > 0
    assert body["error"]["type"] == "loading"
    assert proxy.sup.status()["state"] == "starting"


def test_requests_during_the_load_answer_503_and_start_nothing_more(tmp_path: Path) -> None:
    for p in make_proxy(tmp_path, load_seconds=1.5):
        assert p.chat()[0] == 503
        time.sleep(0.3)
        status, _, body = p.chat()
        assert status == 503 and body["error"]["type"] == "loading"
        assert p.sup.generation == 1


def test_once_healthy_a_request_gets_the_model_completion(proxy: Proxy) -> None:
    body = proxy.until_ready()
    content = json.loads(body["choices"][0]["message"]["content"])
    assert content["action_items"][0]["text"] == "Do the thing"
    st = proxy.sup.status()
    assert st["state"] == "ready" and st["loads"] == 1 and st["last_load_seconds"] is not None


def test_v1_models_also_starts_the_model_and_is_proxied_when_ready(proxy: Proxy) -> None:
    status, _, _ = proxy.request("/v1/models")
    assert status == 503
    assert proxy.sup.wait_state("ready", 10)
    status, _, body = proxy.request("/v1/models")
    assert status == 200 and body["data"][0]["id"] == "stub"


# --- the key --------------------------------------------------------------------------


def test_a_missing_or_wrong_key_is_401_and_starts_nothing(proxy: Proxy) -> None:
    assert proxy.request("/v1/chat/completions", {"messages": []}, key=None)[0] == 401
    assert (
        proxy.request("/v1/chat/completions", {"messages": []}, key="wrong-key-000000000")[0] == 401
    )
    assert proxy.sup.status()["state"] == "idle"


def test_status_is_content_free_and_needs_no_key(proxy: Proxy) -> None:
    status, _, body = proxy.request("/proxy/status", key=None)
    assert status == 200 and body["state"] == "idle" and body["model"] == "stub"


def test_unknown_paths_are_404_and_never_reach_the_model(proxy: Proxy) -> None:
    assert proxy.request("/slots")[0] == 404
    assert proxy.request("/v1/embeddings", {"input": "x"})[0] == 404
    assert proxy.sup.status()["state"] == "idle"


def test_a_key_file_others_can_read_is_refused(tmp_path: Path) -> None:
    f = tmp_path / "k"
    f.write_text(KEY)
    f.chmod(0o644)
    with pytest.raises(PermissionError):
        ksp.read_key(f)


def test_the_model_server_needs_the_private_backend_key(proxy: Proxy) -> None:
    proxy.until_ready()
    port = proxy.sup.cfg.backend_port
    req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/models")
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req, timeout=5)
    assert exc.value.code == 401
    assert (proxy.sup.backend_key_file.stat().st_mode & 0o777) == 0o600


# --- idle stop ----------------------------------------------------------------------


def test_after_the_idle_period_the_model_process_exits(proxy: Proxy) -> None:
    proxy.until_ready()
    pid = proxy.model_pid()
    assert pid_alive(pid)
    assert proxy.sup.wait_state("idle", 10)
    time.sleep(0.2)
    assert not pid_alive(pid)
    assert proxy.sup.status()["last_stop_reason"] == "idle"


def test_requests_keep_the_model_loaded(proxy: Proxy) -> None:
    proxy.until_ready()
    for _ in range(6):  # 6 x 0.5 s = longer than the 1.5 s idle period
        time.sleep(0.5)
        assert proxy.chat()[0] == 200
    assert proxy.sup.status()["state"] == "ready"


def test_a_long_request_is_not_cut_by_the_idle_timer(proxy: Proxy) -> None:
    proxy.until_ready()
    status, _, _ = proxy.chat(stub_delay=2.5)  # longer than idle_seconds
    assert status == 200


def test_after_an_idle_stop_the_next_request_loads_it_again(proxy: Proxy) -> None:
    proxy.until_ready()
    assert proxy.sup.wait_state("idle", 10)
    assert proxy.chat()[0] == 503
    proxy.until_ready()
    assert proxy.sup.status()["loads"] == 2


# --- the turned-away hold (Keeper's backoff) --------------------------------------------
#
# Keeper's backoff is per job: one that has waited comes back every 10-30 minutes, longer
# than the idle period. The model it woke must still be there when it returns.


def test_a_client_turned_away_keeps_the_model_past_the_idle_period_until_it_returns(
    tmp_path: Path,
) -> None:
    for p in make_proxy(tmp_path, turned_away_hold_seconds=6.0):
        status, _, _ = p.chat(job="slow-backoff")  # the cold start: 503, and remembered
        assert status == 503
        assert p.sup.wait_state("ready", 10)
        assert p.chat(job="other")[0] == 200  # someone else is served meanwhile
        time.sleep(2.5)  # past idle_seconds (1.5 s)
        st = p.sup.status()
        assert st["state"] == "ready" and st["turned_away_waiting"] == 1
        assert p.chat(job="slow-backoff")[0] == 200  # it came back and found the model
        assert p.sup.status()["turned_away_waiting"] == 0
        started = time.monotonic()
        assert p.sup.wait_state("idle", 10)  # then the ordinary idle stop
        assert time.monotonic() - started < 4.0
        assert p.sup.status()["last_stop_reason"] == "idle"


def test_the_hold_for_a_client_that_never_returns_is_bounded(tmp_path: Path) -> None:
    for p in make_proxy(tmp_path, turned_away_hold_seconds=3.0):
        assert p.chat(job="gone")[0] == 503
        assert p.sup.wait_state("ready", 10)
        assert p.sup.status()["state"] == "ready"
        assert p.sup.wait_state("idle", 10)
        assert p.sup.status()["last_stop_reason"] == "idle"


def test_a_reservation_does_not_wait_for_turned_away_clients(tmp_path: Path) -> None:
    for p in make_proxy(tmp_path, turned_away_hold_seconds=60.0):
        assert p.chat(job="waiting")[0] == 503
        assert p.sup.wait_state("ready", 10)
        p.reservation.write_text("{}")
        assert p.sup.wait_state("idle", 5)
        assert p.sup.status()["last_stop_reason"] == "reservation"


def test_a_request_cut_off_by_a_reservation_is_waited_for_after_the_release(
    tmp_path: Path,
) -> None:
    for p in make_proxy(tmp_path, turned_away_hold_seconds=30.0):
        p.until_ready()
        result: dict[str, Any] = {}

        def cut(p: Proxy = p, result: dict[str, Any] = result) -> None:
            result["r"] = p.chat(job="cut", stub_delay=20)

        t = threading.Thread(target=cut)
        t.start()
        time.sleep(0.4)
        p.reservation.write_text("{}")
        t.join(15)
        assert result["r"][0] == 503
        assert p.sup.status()["turned_away_waiting"] == 1
        p.reservation.unlink()


def test_a_zero_hold_restores_the_plain_idle_stop(tmp_path: Path) -> None:
    for p in make_proxy(tmp_path, turned_away_hold_seconds=0):
        assert p.chat(job="never-back")[0] == 503
        assert p.sup.wait_state("ready", 10)
        started = time.monotonic()
        assert p.sup.wait_state("idle", 10)
        assert time.monotonic() - started < 3.5


def test_turned_away_requests_are_remembered_by_digest_only(proxy: Proxy) -> None:
    secret = "a sentence from a client meeting"
    proxy.request("/v1/chat/completions", {"messages": [{"role": "user", "content": secret}]})
    keys = list(proxy.sup.turned_away)
    assert len(keys) == 1 and len(keys[0]) == 64 and secret not in keys[0]
    assert secret not in json.dumps(proxy.sup.status())


# --- the reservation ------------------------------------------------------------------


def test_while_reserved_requests_answer_503_and_nothing_starts(proxy: Proxy) -> None:
    proxy.reservation.write_text('{"state": "held"}')
    status, headers, body = proxy.chat()
    assert status == 503 and body["error"]["type"] == "reserved"
    assert "Retry-After" in headers
    time.sleep(0.5)
    assert proxy.sup.status()["state"] == "idle"
    assert not proxy.pid_file.exists()


def test_a_reservation_stops_a_loaded_model(proxy: Proxy) -> None:
    proxy.until_ready()
    pid = proxy.model_pid()
    proxy.reservation.write_text('{"state": "reserving"}')
    assert proxy.sup.wait_state("idle", 10)
    time.sleep(0.2)
    assert not pid_alive(pid)
    assert proxy.sup.status()["last_stop_reason"] == "reservation"
    assert proxy.chat()[0] == 503


def test_a_reservation_lets_the_request_in_flight_finish(proxy: Proxy) -> None:
    proxy.until_ready()
    result: dict[str, Any] = {}

    def slow() -> None:
        result["r"] = proxy.chat(stub_delay=1.5)

    t = threading.Thread(target=slow)
    t.start()
    time.sleep(0.4)
    proxy.reservation.write_text('{"state": "reserving"}')
    time.sleep(0.3)
    assert proxy.sup.status()["state"] == "stopping"
    assert proxy.chat()[0] == 503  # nothing new while it drains
    t.join(10)
    assert result["r"][0] == 200  # the in-flight one finished
    assert proxy.sup.wait_state("idle", 10)


def test_the_wait_for_an_in_flight_request_is_bounded(proxy: Proxy) -> None:
    proxy.until_ready()
    result: dict[str, Any] = {}
    t = threading.Thread(target=lambda: result.update(r=proxy.chat(stub_delay=20)))
    t.start()
    time.sleep(0.4)
    started = time.monotonic()
    proxy.reservation.write_text('{"state": "reserving"}')
    assert proxy.sup.wait_state("idle", 15)
    assert time.monotonic() - started < 3.0 + 5.0 + 2.0  # grace + term + slack
    t.join(10)
    status, _, body = result["r"]
    assert status == 503 and body["error"]["type"] == "reserved"  # Keeper retries a 503


def test_a_reservation_during_the_load_stops_it(tmp_path: Path) -> None:
    for p in make_proxy(tmp_path, load_seconds=3):
        assert p.chat()[0] == 503
        time.sleep(0.3)
        p.reservation.write_text("{}")
        assert p.sup.wait_state("idle", 10)
        assert p.sup.status()["last_stop_reason"] == "reservation"


def test_releasing_the_reservation_lets_summaries_resume(proxy: Proxy) -> None:
    proxy.reservation.write_text("{}")
    assert proxy.chat()[0] == 503
    proxy.reservation.unlink()
    proxy.until_ready()


# --- memory and failures --------------------------------------------------------------


def test_too_little_free_memory_answers_503_and_starts_nothing(proxy: Proxy) -> None:
    proxy.set_mem_gib(25)  # needs 20 + 10 headroom
    status, _, body = proxy.chat()
    assert status == 503 and body["error"]["type"] == "busy"
    assert proxy.sup.status()["state"] == "idle"
    assert "memory" in (proxy.sup.status()["last_refusal"] or "")
    proxy.set_mem_gib(31)
    assert proxy.chat()[0] == 503
    assert proxy.sup.status()["state"] == "starting"


def test_a_model_that_dies_is_started_again_by_the_next_request(proxy: Proxy) -> None:
    proxy.until_ready()
    pid = proxy.model_pid()
    os.kill(pid, 9)
    deadline = time.monotonic() + 5
    while proxy.sup.status()["state"] != "idle" and time.monotonic() < deadline:
        time.sleep(0.1)
    assert proxy.sup.status()["state"] == "idle"
    proxy.until_ready()
    assert proxy.model_pid() != pid


def test_a_model_that_never_gets_healthy_is_stopped_and_cooled_down(tmp_path: Path) -> None:
    for p in make_proxy(tmp_path, load_seconds=60, load_timeout_seconds=1):
        assert p.chat()[0] == 503
        assert p.sup.wait_state("idle", 10)
        status, _, body = p.chat()
        assert status == 503 and body["error"]["type"] == "failed"
        time.sleep(1.2)  # cooldown over: the next request tries again
        p.chat()
        assert p.sup.status()["state"] == "starting"


def test_operator_unload_stops_the_model(proxy: Proxy) -> None:
    proxy.until_ready()
    status, _, _ = proxy.request("/proxy/unload", {})
    assert status == 202
    assert proxy.sup.wait_state("idle", 10)


def test_proxy_shutdown_stops_the_model(tmp_path: Path) -> None:
    gen = make_proxy(tmp_path)
    p = next(gen)
    p.until_ready()
    pid = p.model_pid()
    with pytest.raises(StopIteration):
        next(gen)  # runs the teardown: server shutdown and Supervisor.close()
    time.sleep(0.2)
    assert not pid_alive(pid)


def test_config_resolves_the_shipped_example() -> None:
    cfg = ksp.Config.load(HERE.parent / "config.example.json")
    assert cfg.listen_host == "127.0.0.1" and cfg.listen_port == 8091
    assert cfg.idle_seconds == 600
    assert str(cfg.reservation_paths[0]) == ksp.DEFAULT_RESERVATION
    assert "{port}" in cfg.model.argv and "{backend_key_file}" in cfg.model.argv
    assert cfg.turned_away_hold_seconds == 1860
