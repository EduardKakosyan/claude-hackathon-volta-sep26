#!/usr/bin/env bash
# Install the Phase 3 host pieces on the DGX. Run by the operator, with sudo, after
# reviewing every file in this directory:
#
#   sudo ~jim/dgx-autonomy/host/install.sh
#
# What it does (idempotent; it starts or stops no inference service):
#   /etc/dgx-autonomy/nftables-autonomy.nft          the egress policy
#   /usr/local/sbin/dgx-autonomy-egress              loads/unloads it, writes the marker
#   /etc/systemd/system/dgx-autonomy-egress.service  enabled and started now
#   /usr/local/sbin/dgx-autonomy-reservation         reserve/release/status helper
#   /etc/sudoers.d/dgx-autonomy                      checked with visudo first
#
# It also removes what earlier versions installed for claude-qwen's displacement:
# dgx-autonomy-busy-notice.service (disabled, stopped, deleted) and busy_notice.py.
# Keeper's summary model (summary_proxy/) is a jim user unit and is not installed here.
#
# Every installed file is root-owned and not writable by jim: sudo runs the
# reservation helper as root, so jim must not be able to change it.
set -euo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "run with sudo" >&2
  exit 1
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkg="$here/../src/dgx_autonomy"

echo "==> checking the sudoers entry"
visudo -cf "$here/sudoers-autonomy"

echo "==> checking the egress rules (nft -c)"
nft -c -f "$here/nftables-autonomy.nft"

echo "==> installing files"
install -d -m 0755 -o root -g root /etc/dgx-autonomy
install -m 0644 -o root -g root "$here/nftables-autonomy.nft" /etc/dgx-autonomy/nftables-autonomy.nft
install -m 0755 -o root -g root "$here/dgx-autonomy-egress" /usr/local/sbin/dgx-autonomy-egress
install -m 0755 -o root -g root "$pkg/reservation.py" /usr/local/sbin/dgx-autonomy-reservation
install -m 0644 -o root -g root "$here/dgx-autonomy-egress.service" /etc/systemd/system/
install -m 0440 -o root -g root "$here/sudoers-autonomy" /etc/sudoers.d/dgx-autonomy

echo "==> removing the busy notice (claude-qwen is retired; nothing to answer for)"
notice=dgx-autonomy-busy-notice.service
if [[ -e "/etc/systemd/system/$notice" ]]; then
  systemctl disable --now "$notice" || true
  rm -f "/etc/systemd/system/$notice"
fi
rm -f /usr/local/lib/dgx-autonomy/busy_notice.py /var/lib/dgx-autonomy/reservation/notice.env
rmdir --ignore-fail-on-non-empty /usr/local/lib/dgx-autonomy 2>/dev/null || true

echo "==> enabling units"
systemctl daemon-reload
systemctl reset-failed "$notice" 2>/dev/null || true
systemctl enable dgx-autonomy-egress.service
# restart, not start: re-applies changed rules and refreshes the marker.
systemctl restart dgx-autonomy-egress.service

echo "==> loaded:"
nft list table inet dgx_autonomy | sed 's/^/    /'
cat /var/lib/dgx-autonomy/policy/egress.json
sudo -u jim sudo -n -l /usr/local/sbin/dgx-autonomy-reservation status > /dev/null \
  && echo "jim may run: dgx-autonomy-reservation reserve|release|status"

cat <<'EOF'

==> The egress rules match the bridges by name (dgx-egress, dgx-internal). If the
    compose networks predate those names, recreate them (README, operator setup step 6):

      cd ~jim/dgx-autonomy/containers
      sudo docker ps -a --filter label=dgx-autonomy.role --format '{{.Names}}'  # review
      sudo docker rm -f $(sudo docker ps -aq --filter label=dgx-autonomy.role)
      sudo docker compose down
      sudo docker compose --profile images build controller
      sudo docker compose up -d controller
EOF
