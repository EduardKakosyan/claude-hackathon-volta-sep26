"""`release --after RUN_ID`: the reservation goes when the run ends, not when someone
remembers (hugo-dgx1: the DGX stayed reserved for 12 hours after a run), so Keeper's
queued summaries resume on their next retry."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from typing import Any

import pytest

from dgx_autonomy import cli
from dgx_autonomy.control_api import ControlError


def _args(**kw: Any) -> argparse.Namespace:
    return argparse.Namespace(socket=None, json=False, after="r1", detach=False, **kw)


def test_it_waits_for_the_run_to_end_then_releases_and_retries_a_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    phases = iter(["running", "running", "stopping", "finished", "finished"])
    calls: list[str] = []
    stops = iter([ControlError("run r2 still uses the model"), {"removed": True}])

    def fake_call(_socket: Path, op: str, args: dict[str, Any] | None = None, **_: Any) -> Any:
        calls.append(op)
        if op == "status":
            phase = next(phases)
            if phase == "stopping" and "boom" not in calls:
                calls.append("boom")
                raise ControlError("controller restarting")
            return {"phase": phase}
        answer = next(stops)
        if isinstance(answer, Exception):
            raise answer
        return answer

    helped: list[str] = []

    def fake_helper(action: str, runner: Any = None) -> dict[str, Any]:
        helped.append(action)
        return {"reservation": "released", "already": False, "held_since": "t0"}

    slept: list[float] = []
    monkeypatch.setattr(cli, "call", fake_call)
    monkeypatch.setattr(cli, "reservation_helper", fake_helper)
    assert cli._release_after(_args(), sleep=slept.append) == 0
    # Nothing is released while the run is active or unreadable.
    assert calls[:4] == ["status", "status", "status", "boom"]
    assert calls.count("inference.stop") == 2  # another run used the model, then released
    assert helped == ["release"]  # the helper is never asked while the model is in use
    assert slept == [cli.RELEASE_POLL_S] * 3 + [cli.RELEASE_RETRY_S]


def test_release_is_never_refused_and_says_summaries_resume(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "call", lambda *_a, **_k: {"removed": False})
    answers = iter(
        [
            {"reservation": "released", "already": False, "held_since": "2026-10-16T12:00:00"},
            {"reservation": "none", "already": True},
        ]
    )
    monkeypatch.setattr(cli, "reservation_helper", lambda action, runner=None: next(answers))
    args = _args()
    args.after = None
    assert cli.cmd_release(args) == 0
    out = capsys.readouterr().out
    assert "released (held since 2026-10-16T12:00:00)" in out
    assert "summaries resume" in out and "claude-qwen" not in out
    assert cli.cmd_release(args) == 0
    assert "no reservation was held" in capsys.readouterr().out


def test_detach_installs_a_lingering_user_unit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(cli.Path, "home", lambda: tmp_path)
    ran: list[list[str]] = []

    def runner(argv: list[str]) -> subprocess.CompletedProcess[str]:
        ran.append(argv)
        return subprocess.CompletedProcess(argv, 0, "", "")

    assert cli._release_detached("r1", runner) == 0
    unit = (tmp_path / ".config/systemd/user" / cli.RELEASE_UNIT).read_text()
    assert "claude-qwen" not in unit and "release the inference reservation" in unit
    assert "ExecStart=%h/.local/bin/dgx-autonomy release --after %i" in unit
    assert "WantedBy=default.target" in unit  # a DGX restart starts the wait again
    assert ran[-1] == [
        "systemctl",
        "--user",
        "enable",
        "--now",
        "dgx-autonomy-release-after@r1.service",
    ]
