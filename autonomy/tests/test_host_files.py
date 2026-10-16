"""The host pieces agree with each other and with the controller's settings.

They are installed by hand (host/install.sh), so nothing else would notice a bridge
renamed in one place, a range missing from the rules, or a sudoers entry that
grants more than the three helper actions.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
import urllib.parse
from pathlib import Path
from types import ModuleType

import pytest
import yaml

from dgx_autonomy import reservation
from dgx_autonomy.config import Settings

ROOT = Path(__file__).resolve().parents[1]
HOST = ROOT / "host"
SUMMARY = ROOT / "summary_proxy"


def _load(name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses look their module up while it loads
    spec.loader.exec_module(module)
    return module


def test_bridge_names_agree_between_compose_rules_and_settings() -> None:
    settings = Settings.from_env({})
    compose = yaml.safe_load((ROOT / "containers" / "compose.yaml").read_text())
    nets = compose["networks"]
    named = {n["name"]: n["driver_opts"]["com.docker.network.bridge.name"] for n in nets.values()}
    assert named == {
        settings.egress_network: settings.egress_bridge,
        settings.internal_network: settings.internal_bridge,
    }
    rules = (HOST / "nftables-autonomy.nft").read_text()
    assert f'"{settings.egress_bridge}", "{settings.internal_bridge}"' in rules


@pytest.mark.parametrize(
    "cidr",
    [
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",  # the DGX's LAN, 192.168.50.0/24
        "100.64.0.0/10",  # Tailscale, including 100.100.100.100
        "169.254.0.0/16",
        "127.0.0.0/8",
        "fc00::/7",  # the LAN's fd21:… and Tailscale's fd7a:…
        "fe80::/10",
        "::ffff:0.0.0.0/96",
    ],
)
def test_the_rules_block_private_and_tailnet_ranges(cidr: str) -> None:
    rules = (HOST / "nftables-autonomy.nft").read_text()
    assert re.search(rf"^\s*{re.escape(cidr)}\s*,?\s*(#.*)?$", rules, re.M) or f"{cidr}," in rules


def test_the_rules_reject_everything_to_the_host_itself() -> None:
    rules = (HOST / "nftables-autonomy.nft").read_text()
    chain = rules.split("chain input", 1)[1].split("}", 1)[0]
    assert "iifname != @agent_bridges accept" in chain
    assert "ct state established,related accept" in chain
    assert chain.strip().splitlines()[-1].strip() == "counter reject with icmpx admin-prohibited"


def test_sudoers_grants_exactly_the_three_helper_actions() -> None:
    lines = [
        line
        for line in (HOST / "sudoers-autonomy").read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert len(lines) == 1
    user, grant = lines[0].split(" ALL=(root) NOPASSWD: ")
    assert user == "jim"
    commands = [c.strip() for c in grant.split(",")]
    assert commands == [
        f"/usr/local/sbin/dgx-autonomy-reservation {a}" for a in ("reserve", "release", "status")
    ]


def test_the_helper_the_proxy_and_the_controller_agree_on_the_reservation() -> None:
    record = reservation.RECORD_DIR / reservation.RECORD_NAME
    assert Settings.from_env({}).reservation_record == record
    proxy = _load("keeper_summary_proxy", SUMMARY / "keeper_summary_proxy.py")
    assert Path(proxy.DEFAULT_RESERVATION) == record
    example = json.loads((SUMMARY / "config.example.json").read_text())
    assert example["reservation_paths"] == [str(record)]
    # reserve polls the proxy where it listens, and waits longer than the proxy's grace.
    status = urllib.parse.urlsplit(reservation.PROXY_STATUS_URL)
    assert f"{status.hostname}:{status.port}" == example["listen"]
    assert status.path == "/proxy/status"
    assert example["reservation_grace_seconds"] < reservation.YIELD_TIMEOUT_S
    egress = (HOST / "dgx-autonomy-egress").read_text()
    assert 'MARKER="$MARKER_DIR/egress.json"' in egress
    assert Settings.from_env({}).egress_marker == Path("/var/lib/dgx-autonomy/policy/egress.json")


def test_the_busy_notice_is_gone_and_install_removes_it() -> None:
    assert not (HOST / "busy_notice.py").exists()
    assert not (HOST / "dgx-autonomy-busy-notice.service").exists()
    install = (HOST / "install.sh").read_text()
    commands = [line for line in install.splitlines() if not line.lstrip().startswith("#")]
    assert not any("install " in c and "busy" in c for c in commands)
    assert 'systemctl disable --now "$notice"' in install
    assert 'rm -f "/etc/systemd/system/$notice"' in install
    assert re.search(r"^systemctl enable dgx-autonomy-egress\.service$", install, re.M)
