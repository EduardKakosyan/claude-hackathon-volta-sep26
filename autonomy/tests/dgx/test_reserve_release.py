"""Reserve stops Keeper's summary model and keeps it stopped; release lets it serve again.

This loads the summary model, stops it, and holds the reservation for a few minutes
(Keeper's summaries answer 503 meanwhile and resume on their next retry), so it only
runs when asked to:

    DGX_AUTONOMY_RESERVATION_TEST=1 ~/.local/bin/uv run pytest -m dgx \
        tests/dgx/test_reserve_release.py -s

It needs the updated host/install.sh installed (sudo helper), the keeper-summary user
unit running (summary_proxy/install.sh), and no active run or plan.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from dgx_autonomy.cli import reservation_helper

from dgx_helpers import wait_for

pytestmark = [
    pytest.mark.dgx,
    pytest.mark.skipif(
        os.environ.get("DGX_AUTONOMY_RESERVATION_TEST") != "1",
        reason="stops Keeper's summary model; set DGX_AUTONOMY_RESERVATION_TEST=1 to run",
    ),
]

PROXY = "http://127.0.0.1:8091"
KEY_FILE = Path.home() / ".config/keeper-summary/api-key"
PROMPT = {"messages": [{"role": "user", "content": "Reply with: ok"}], "max_tokens": 8}


def _request(path: str, body: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if path.startswith("/v1/") or path == "/proxy/unload":
        headers["Authorization"] = f"Bearer {KEY_FILE.read_text().strip()}"
    req = urllib.request.Request(f"{PROXY}{path}", data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return int(resp.status), json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return int(exc.code), json.loads(exc.read() or b"{}")
    except OSError as exc:
        return 0, {"error": str(exc)}


def _status() -> dict[str, Any]:
    return _request("/proxy/status")[1]


def _summary() -> tuple[int, dict[str, Any]]:
    return _request("/v1/chat/completions", PROMPT)


def _error_type(answer: tuple[int, dict[str, Any]]) -> str | None:
    error = answer[1].get("error")
    return error.get("type") if isinstance(error, dict) else None


def test_reserve_stops_the_summary_model_and_release_lets_it_serve(
    control: Callable[..., Any],
) -> None:
    assert reservation_helper("status")["reservation"] == "none"
    assert _status()["state"] in ("idle", "starting", "ready")

    # A loaded summary model: the first request starts it (503 loading), then it serves.
    wait_for(_summary, lambda a: a[0] == 200, timeout_s=900, every_s=5)
    assert _status()["state"] == "ready"

    held = reservation_helper("reserve")
    try:
        assert held["reservation"] == "held", held
        record = held["record"]
        assert record["summary_model_loaded"] is True
        assert record["summary_wait_seconds"] <= 240
        assert control("inference.status")["reservation"] == "held"

        status = _status()
        assert status["state"] == "idle" and status["reserved"] is True
        assert status["pid"] is None and status["last_stop_reason"] == "reservation"
        # While held: 503 reserved, and nothing starts.
        loads = status["loads"]
        answer = _summary()
        assert answer[0] == 503 and _error_type(answer) == "reserved", answer
        assert _status()["loads"] == loads and _status()["state"] == "idle"
        assert reservation_helper("status")["summary_proxy"]["reserved"] is True
    finally:
        released = reservation_helper("release")

    assert released["reservation"] == "released", released
    assert reservation_helper("status")["reservation"] == "none"
    # Summaries resume: a cold start answers 503 loading, then a completion.
    wait_for(_summary, lambda a: a[0] == 200, timeout_s=900, every_s=5)


def test_reserve_with_nothing_loaded_records_that(control: Callable[..., Any]) -> None:
    assert reservation_helper("status")["reservation"] == "none"
    _request("/proxy/unload", {})
    wait_for(_status, lambda s: s.get("state") == "idle", timeout_s=300, every_s=2)

    held = reservation_helper("reserve")
    try:
        assert held["reservation"] == "held", held
        assert held["record"]["summary_model_loaded"] is False
        assert held["record"]["summary_wait_seconds"] < 10
        answer = _summary()
        assert answer[0] == 503 and _error_type(answer) == "reserved", answer
    finally:
        assert reservation_helper("release")["reservation"] == "released"
