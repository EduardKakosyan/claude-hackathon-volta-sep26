#!/bin/sh
# Deploy the on-demand summary endpoint to the DGX as jim (no sudo), from this directory.
#   ./install.sh [ssh-host]        default: hugo-dgx1
# Copies the proxy to ~/keeper-summary/, keeps an existing config.json (writes the example
# only on a first install), creates the API key once (0600), installs and enables the user
# unit, and restarts it. A restart stops a loaded summary model; nothing is loaded after it.
set -eu
HOST="${1:-hugo-dgx1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ssh "$HOST" 'mkdir -p ~/keeper-summary ~/.config/systemd/user && install -d -m 700 ~/.config/keeper-summary'
scp -q "$HERE/keeper_summary_proxy.py" "$HERE/config.example.json" "$HERE/keeper-summary.service" "$HOST":keeper-summary/
ssh "$HOST" 'set -eu
cd ~/keeper-summary
[ -f config.json ] || cp config.example.json config.json
KEY=~/.config/keeper-summary/api-key
if [ ! -s "$KEY" ]; then
  (umask 077; python3 -c "import secrets; print(secrets.token_urlsafe(32))" > "$KEY")
fi
chmod 600 "$KEY"
python3 -I keeper_summary_proxy.py check-config --config config.json >/dev/null
cp keeper-summary.service ~/.config/systemd/user/keeper-summary.service
systemctl --user daemon-reload
systemctl --user enable keeper-summary.service >/dev/null
systemctl --user restart keeper-summary.service
sleep 1
systemctl --user --no-pager --lines=3 status keeper-summary.service | head -12
curl -s http://127.0.0.1:8091/proxy/status; echo'
