"""The reservation helper against a tmp root filesystem and a fake summary proxy."""

from __future__ import annotations

import json
import socket
import threading
from collections.abc import Iterator
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest

from dgx_autonomy import reservation as rs
from dgx_autonomy.reservation import Host, Reservation, ReservationError

GIB = 1024**3
RECORD = "var/lib/dgx-autonomy/reservation/record.json"


class FakeProxy:
    """`GET /proxy/status` of keeper_summary_proxy.py, driven by the record it obeys.

    `stops_after` polls after the record appears, a loaded model reports `idle`
    (the proxy waited for its in-flight request, then stopped it). None: never.
    """

    def __init__(self, root: Path, *, state: str = "idle", stops_after: int | None = 2) -> None:
        self.root = root
        self.state = state
        self.stops_after = stops_after
        self.running = True
        self.polls = 0
        self.record_seen_first = True  # the record existed at every poll
        self.reserved_flag: bool | None = None  # None: report what the proxy would see

    def reserved(self) -> bool:
        return (self.root / RECORD).exists()

    def __call__(self) -> dict[str, Any] | None:
        self.polls += 1
        if not self.reserved():
            self.record_seen_first = False
        if not self.running:
            return None
        if self.state != "idle" and self.reserved():
            if self.stops_after is not None and self.polls > self.stops_after:
                self.state = "idle"
            elif self.state in ("starting", "ready"):
                self.state = "stopping"
        reserved = self.reserved() if self.reserved_flag is None else self.reserved_flag
        return {"state": self.state, "model": "qwen3.6-35b-a3b", "reserved": reserved}


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def monotonic(self) -> float:
        return self.t

    def sleep(self, s: float) -> None:
        self.t += s


@pytest.fixture
def root(tmp_path: Path) -> Path:
    return tmp_path / "root"


def _reservation(root: Path, proxy: Any, clock: Clock | None = None) -> Reservation:
    clock = clock or Clock()
    host = Host(
        root=root,
        proxy_status=proxy,
        meminfo=lambda: {"MemAvailable": 100 * GIB},
        sleep=clock.sleep,
        monotonic=clock.monotonic,
        now=lambda: datetime(2026, 10, 16, 12, 0, tzinfo=UTC),
    )
    return Reservation(host)


def test_reserve_writes_the_record_before_it_asks_the_proxy(root: Path) -> None:
    proxy = FakeProxy(root, state="idle")
    out = _reservation(root, proxy).reserve()

    assert out["reservation"] == "held" and out["already"] is False
    assert proxy.polls == 1 and proxy.record_seen_first
    rec = json.loads((root / RECORD).read_text())
    assert rec["state"] == "held"
    assert rec["held_since"] == "2026-10-16T12:00:00+00:00"
    assert rec["summary_model_loaded"] is False and rec["summary_model"] is None
    assert rec["summary_wait_seconds"] == 0.0
    assert rec["notes"] == []


def test_reserve_waits_for_a_loaded_summary_model_to_stop(root: Path) -> None:
    proxy = FakeProxy(root, state="ready", stops_after=3)
    clock = Clock()
    rec = _reservation(root, proxy, clock).reserve()["record"]

    assert proxy.state == "idle" and proxy.record_seen_first
    assert rec["state"] == "held"
    assert rec["summary_model_loaded"] is True
    assert rec["summary_model"] == "qwen3.6-35b-a3b"
    assert rec["summary_wait_seconds"] == 3 * rs.POLL_S


def test_a_proxy_that_is_not_running_means_nothing_is_loaded(root: Path) -> None:
    proxy = FakeProxy(root)
    proxy.running = False
    rec = _reservation(root, proxy).reserve()["record"]
    assert rec["state"] == "held" and rec["summary_model_loaded"] is False


def test_an_unreadable_proxy_is_polled_until_it_answers(root: Path) -> None:
    answers: list[Any] = [OSError("timed out"), OSError("HTTP 500"), {"state": "idle"}]

    def proxy() -> dict[str, Any] | None:
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer  # type: ignore[no-any-return]

    rec = _reservation(root, proxy).reserve()["record"]
    assert rec["state"] == "held" and rec["summary_model_loaded"] is False
    assert rec["summary_wait_seconds"] == 2 * rs.POLL_S


def test_a_model_that_does_not_stop_fails_the_reserve_and_keeps_the_record(root: Path) -> None:
    proxy = FakeProxy(root, state="ready", stops_after=None)
    clock = Clock()
    r = _reservation(root, proxy, clock)

    with pytest.raises(ReservationError, match="did not stop within 240s"):
        r.reserve()
    assert rs.YIELD_TIMEOUT_S < clock.t <= rs.YIELD_TIMEOUT_S + rs.POLL_S
    record = r.read_record()
    assert record is not None and record.state == "reserving"
    assert "had not stopped" in record.notes[0]

    # The proxy has obeyed the record all along; a second reserve finishes the wait.
    proxy.stops_after = 0
    rec = r.reserve()["record"]
    assert rec["state"] == "held" and rec["held_since"] == "2026-10-16T12:00:00+00:00"


def test_the_helper_exits_1_on_a_timeout(
    root: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    proxy = FakeProxy(root, state="ready", stops_after=None)
    clock = Clock()
    monkeypatch.setattr(rs, "Reservation", lambda: _reservation(root, proxy, clock))
    assert rs.main(["reserve"]) == rs.EXIT_FAILED
    assert "did not stop" in json.loads(capsys.readouterr().out)["error"]
    assert (root / RECORD).exists()


def test_reserve_twice_is_a_no_op(root: Path) -> None:
    proxy = FakeProxy(root, state="ready")
    r = _reservation(root, proxy)
    first = r.reserve()
    polls = proxy.polls
    again = r.reserve()
    assert again["already"] is True and again["record"] == first["record"]
    assert proxy.polls == polls


def test_a_proxy_that_does_not_see_the_record_is_noted(root: Path) -> None:
    proxy = FakeProxy(root, state="idle")
    proxy.reserved_flag = False
    rec = _reservation(root, proxy).reserve()["record"]
    assert rec["state"] == "held"
    assert any("reservation_paths" in n for n in rec["notes"])


def test_release_archives_and_removes_the_record_unconditionally(root: Path) -> None:
    proxy = FakeProxy(root, state="ready")
    r = _reservation(root, proxy)
    r.reserve()
    held = (root / RECORD).read_text()
    polls = proxy.polls

    out = r.release()
    assert out == {
        "reservation": "released",
        "already": False,
        "held_since": "2026-10-16T12:00:00+00:00",
        "archived": "/var/lib/dgx-autonomy/reservation/released/20261016T120000Z.json",
    }
    assert not (root / RECORD).exists()
    archived = root / "var/lib/dgx-autonomy/reservation/released/20261016T120000Z.json"
    assert archived.read_text() == held
    assert proxy.polls == polls  # release asks nobody; summaries resume on their own


def test_release_lets_go_of_a_reserve_that_timed_out(root: Path) -> None:
    r = _reservation(root, FakeProxy(root, state="ready", stops_after=None))
    with pytest.raises(ReservationError):
        r.reserve()
    assert r.release()["reservation"] == "released"
    assert r.read_record() is None


def test_release_without_a_reservation_does_nothing(root: Path) -> None:
    assert _reservation(root, FakeProxy(root)).release() == {
        "reservation": "none",
        "already": True,
    }


def test_release_removes_an_unreadable_record_too(root: Path) -> None:
    (root / RECORD).parent.mkdir(parents=True)
    (root / RECORD).write_text("{not json")
    out = _reservation(root, FakeProxy(root)).release()
    assert out["reservation"] == "released" and out["held_since"] is None
    assert not (root / RECORD).exists()


def test_a_record_from_the_claude_qwen_helper_is_still_read_and_released(root: Path) -> None:
    old = {
        "state": "held",
        "held_since": "2026-10-13T11:25:00+00:00",
        "service": "claude-qwen.service",
        "prior_unit_path": "/etc/systemd/system/claude-qwen.service",
        "prior_unit_sha": "ab",
        "prior_dropins": {},
        "prior_dropin_dir_existed": False,
        "prior_effective_sha": "cd",
        "prior_enabled": "enabled",
        "prior_active": True,
        "notice_host": "127.0.0.1",
        "notice_port": 8090,
        "freed_bytes": 37 * GIB,
        "required_available_bytes": 45 * GIB,
        "notes": [],
    }
    (root / RECORD).parent.mkdir(parents=True)
    (root / RECORD).write_text(json.dumps(old))
    r = _reservation(root, FakeProxy(root))

    record = r.read_record()
    assert record is not None and record.state == "held"
    assert record.held_since == "2026-10-13T11:25:00+00:00"
    assert r.status()["reservation"] == "held"
    assert r.reserve()["already"] is True
    assert r.release()["held_since"] == "2026-10-13T11:25:00+00:00"


def test_status_includes_the_summary_proxy(root: Path) -> None:
    proxy = FakeProxy(root, state="idle")
    r = _reservation(root, proxy)
    out = r.status()
    assert out["reservation"] == "none" and out["record"] is None
    assert out["summary_proxy"]["state"] == "idle"
    assert out["mem_available_gib"] == 100.0

    r.reserve()
    out = r.status()
    assert out["reservation"] == "held" and out["summary_proxy"]["reserved"] is True

    proxy.running = False
    assert r.status()["summary_proxy"] == "not running"


class _Status(BaseHTTPRequestHandler):
    body = b'{"state": "ready", "model": "m"}'

    def do_GET(self) -> None:
        self.send_response(200 if self.path == "/proxy/status" else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, format: str, *args: Any) -> None:
        pass


@pytest.fixture
def status_server() -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Status)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def test_fetch_proxy_status_reads_the_json(status_server: str) -> None:
    assert rs.fetch_proxy_status(f"{status_server}/proxy/status") == {
        "state": "ready",
        "model": "m",
    }
    with pytest.raises(OSError, match="HTTP 404"):
        rs.fetch_proxy_status(f"{status_server}/elsewhere")


def test_a_refused_connection_means_no_proxy() -> None:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    # Bound but not listening: the connection is refused.
    assert rs.fetch_proxy_status(f"http://127.0.0.1:{port}/proxy/status") is None


def test_the_helper_takes_exactly_one_known_action(capsys: pytest.CaptureFixture[str]) -> None:
    assert rs.main([]) == rs.EXIT_USAGE
    assert rs.main(["reserve", "--force"]) == rs.EXIT_USAGE
    assert rs.main(["rm"]) == rs.EXIT_USAGE
    assert "usage" in capsys.readouterr().err


def test_the_helper_imports_only_the_standard_library() -> None:
    """It runs as root from /usr/local/sbin with `python3 -I`, outside any venv."""
    source = Path(rs.__file__).read_text()
    assert source.startswith("#!/usr/bin/python3 -I\n")
    imports = [
        line.split()[1]
        for line in source.splitlines()
        if line.startswith(("import ", "from ")) and not line.startswith("from __future__")
    ]
    assert imports and all(not m.startswith((".", "dgx_autonomy")) for m in imports)
    assert "yaml" not in imports and "httpx" not in imports
    assert "subprocess" not in imports  # it starts and stops nothing
