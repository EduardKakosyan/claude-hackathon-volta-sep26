"""Every run and plan takes the inference reservation before a model is loaded.

The CLI runs as jim on the DGX and the controller (in its container) cannot run the
sudo helper, so `launch`, `plan`, `reserve` and `qualify --reserve` take it first:
Keeper's summary model stops, and loads nothing until `release`.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import pytest

from dgx_autonomy import cli, plan_repl

HELD = {
    "reservation": "held",
    "already": False,
    "record": {
        "state": "held",
        "held_since": "2026-10-16T12:00:00+00:00",
        "summary_model_loaded": True,
        "summary_model": "qwen3.6-35b-a3b",
        "summary_wait_seconds": 6.0,
    },
}


class Recorder:
    def __init__(self) -> None:
        self.events: list[str] = []

    def helper(self, action: str, runner: Any = None) -> dict[str, Any]:
        self.events.append(f"helper {action}")
        return HELD

    def call(self, _socket: Path, op: str, args: Any = None, **_: Any) -> Any:
        self.events.append(op)
        if op == "plan.start":
            return {"plan_id": "p1"}
        if op in ("qualify.start", "qualify.status"):
            return {"status": "qualified", "model_key": "m", "step": "done"}
        return {"container": "running", "health": "ready"}


@pytest.fixture
def rec(monkeypatch: pytest.MonkeyPatch) -> Recorder:
    r = Recorder()
    monkeypatch.setattr(cli, "reservation_helper", r.helper)
    monkeypatch.setattr(cli, "call", r.call)
    return r


def test_the_reservation_line_says_what_happened_to_the_summary_model() -> None:
    assert cli.reservation_line(HELD) == (
        "reserved: the summary model qwen3.6-35b-a3b stopped after 6.0s;"
        " summaries wait until `dgx-autonomy release`"
    )
    idle = {"already": False, "record": {"summary_model_loaded": False}}
    assert cli.reservation_line(idle).startswith("reserved: no summary model was loaded")
    again = {"already": True, "record": {"held_since": "t0"}}
    assert cli.reservation_line(again) == "the reservation is held (since t0)"
    for out in (HELD, idle, again):
        assert "claude-qwen" not in cli.reservation_line(out)


def test_a_plan_takes_the_reservation_before_it_starts(
    rec: Recorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Session:
        def __init__(self, *_a: Any, **_k: Any) -> None:
            rec.events.append("session")

        def run(self) -> int:
            return 0

    monkeypatch.setattr(plan_repl, "PlanSession", Session)
    args = cli.build_parser().parse_args(["plan", "--request", "a page"])
    assert cli.cmd_plan(args) == 0
    assert rec.events == ["helper reserve", "plan.start", "session"]


def test_closing_a_plan_takes_nothing(rec: Recorder) -> None:
    assert cli.cmd_plan(cli.build_parser().parse_args(["plan", "--close", "p1"])) == 0
    assert rec.events == ["plan.close"]


def test_a_failed_reserve_stops_the_launch_before_the_controller_is_asked(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    called: list[str] = []

    def failing(action: str, runner: Any = None) -> dict[str, Any]:
        raise cli.HelperError("the summary model did not stop within 240s")

    monkeypatch.setattr(cli, "reservation_helper", failing)
    monkeypatch.setattr(cli, "call", lambda _s, op, *_a, **_k: called.append(op))
    brief = tmp_path / "brief.md"
    brief.write_text("Build a page.\n")
    assert cli.main(["launch", "--brief", str(brief)]) == 1
    assert called == []
    assert "did not stop within 240s" in capsys.readouterr().err


def test_qualify_takes_the_reservation_only_with_reserve(rec: Recorder) -> None:
    parser = cli.build_parser()
    assert cli.cmd_qualify(parser.parse_args(["qualify", "m", "--reserve", "--no-follow"])) == 0
    assert rec.events[:2] == ["helper reserve", "qualify.start"]
    rec.events.clear()
    assert cli.cmd_qualify(parser.parse_args(["qualify", "m", "--no-follow"])) == 0
    assert "helper reserve" not in rec.events


def test_reserve_holds_it_then_starts_the_owned_server(
    rec: Recorder, capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.cmd_reserve(cli.build_parser().parse_args(["reserve"])) == 0
    assert rec.events == ["helper reserve", "inference.ensure"]
    out = capsys.readouterr().out
    assert "summary model qwen3.6-35b-a3b stopped" in out
    assert "owned llama-server: running, ready" in out
    rec.events.clear()
    assert cli.cmd_reserve(cli.build_parser().parse_args(["reserve", "--no-inference"])) == 0
    assert rec.events == ["helper reserve"]


def test_no_reservation_help_mentions_claude_qwen() -> None:
    parser = cli.build_parser()
    text = parser.format_help()
    sub = next(a for a in parser._actions if isinstance(a, argparse._SubParsersAction))
    for name in ("reserve", "release", "reservation", "qualify", "readiness"):
        text += sub.choices[name].format_help()
    assert "claude-qwen" not in text
    assert "--reserve" in text
