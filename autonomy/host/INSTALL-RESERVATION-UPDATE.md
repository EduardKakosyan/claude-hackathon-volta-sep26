# One-time update: the reservation without claude-qwen (#12)

The reservation helper no longer stops and restores `claude-qwen`. It writes the
reservation record, waits for Keeper's on-demand summary model to stop (`GET
http://127.0.0.1:8091/proxy/status` reports `idle`), and holds the GPU. Release removes
the record and is never refused. The busy-notice unit is no longer needed. This page
lists the privileged steps to move hugo-dgx1 over, once. Nothing in this repository
runs them for you.

What hugo-dgx1 had when this was written (read-only inspection, 2026-10-16): no
reservation held, `claude-qwen.service` active and enabled on 127.0.0.1:8090,
`dgx-autonomy-busy-notice.service` enabled and inactive, `keeper-summary` (the jim
user unit) running and idle, and the tailnet route `https://dgx1.tail31115a.ts.net/`
pointing at 127.0.0.1:8090.

## 0. Before you start (as jim, no sudo)

```bash
dgx-autonomy runs                          # no run may be active (none `running`)
dgx-autonomy plans                         # and no plan open
dgx-autonomy reservation                   # must show: reservation  none
systemctl --user is-active keeper-summary  # active
curl -s http://127.0.0.1:8091/proxy/status; echo
```

If a reservation is held, release it with the old helper first (`dgx-autonomy
release`, still the old version at this point), so `claude-qwen`'s drop-in is removed
the old way.

Then deploy the code from the laptop (no sudo; rsync plus `uv sync`):

```bash
autonomy/scripts/deploy.sh
```

The controller's own code changed only in comments and messages, so its image does
not need a rebuild for this.

## 1. Install the helper and remove the busy notice (sudo, on the DGX)

```bash
sudo install -m 0755 -o root -g root ~jim/dgx-autonomy/src/dgx_autonomy/reservation.py /usr/local/sbin/dgx-autonomy-reservation
sudo systemctl disable --now dgx-autonomy-busy-notice.service
sudo rm -f /etc/systemd/system/dgx-autonomy-busy-notice.service /usr/local/lib/dgx-autonomy/busy_notice.py /var/lib/dgx-autonomy/reservation/notice.env
sudo rmdir --ignore-fail-on-non-empty /usr/local/lib/dgx-autonomy
sudo systemctl daemon-reload
sudo systemctl reset-failed dgx-autonomy-busy-notice.service 2>/dev/null || true
```

The sudoers entry is unchanged (`reserve`, `release`, `status`), so it is not
reinstalled. `sudo ~jim/dgx-autonomy/host/install.sh` does the same as the commands
above. It also re-checks and reinstalls the sudoers entry and the egress policy, and
restarts `dgx-autonomy-egress.service`, which re-applies the rules.

`/var/lib/dgx-autonomy/reservation/prior/` (the old helper's copy of claude-qwen's
unit) and `released/` (earlier records) are only history. The new helper does not
read them. Keep or delete them as you like.

## 2. Retire claude-qwen (sudo, on the DGX; approved in #12)

```bash
sudo systemctl disable --now claude-qwen.service
```

The unit file stays in `/etc/systemd/system/`, so `sudo systemctl enable --now
claude-qwen.service` brings it back if ever needed. While it ran it held about 37 GB.
The new helper does not stop it, so a run with the default model would not fit next
to it.

The tailnet route still points at its port (`tailscale serve status` shows `/ proxy
http://127.0.0.1:8090`). It is the only serve entry, so remove it with:

```bash
sudo tailscale serve reset
```

To repoint it at Keeper's summary endpoint instead (only if a Keeper off the DGX needs
it; the endpoint asks for its own API key):

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:8091
```

## 3. Verify (as jim)

```bash
cmp ~/dgx-autonomy/src/dgx_autonomy/reservation.py /usr/local/sbin/dgx-autonomy-reservation && echo "helper up to date"
systemctl cat dgx-autonomy-busy-notice.service 2>&1 | head -1   # "No files found for dgx-autonomy-busy-notice.service."
systemctl is-enabled claude-qwen.service; systemctl is-active claude-qwen.service   # disabled, inactive
dgx-autonomy reservation    # reservation  none; summary_proxy  {"state": "idle", ...}
```

Then hold and release the reservation once. The summary model stops if it is
loaded, and summaries wait for a minute:

```bash
dgx-autonomy reserve --no-inference
#   reserved: no summary model was loaded; summaries wait until `dgx-autonomy release`
#   (or: the summary model <name> stopped after <n>s; ...)
curl -s -H "Authorization: Bearer $(cat ~/.config/keeper-summary/api-key)" \
     -H 'Content-Type: application/json' \
     -d '{"messages":[{"role":"user","content":"Reply with: ok"}],"max_tokens":8}' \
     http://127.0.0.1:8091/v1/chat/completions; echo
#   {"error": {"message": "reserved: an autonomy run holds the DGX inference", "type": "reserved", "code": 503}}
dgx-autonomy release
#   owned llama-server was not running
#   released (held since <time>): summaries resume on Keeper's next retry
dgx-autonomy reservation    # reservation  none, again
```

The full end-to-end check loads the summary model, reserves, checks the `503`,
releases, and checks that summaries are served again. It takes a few minutes:

```bash
cd ~/dgx-autonomy && DGX_AUTONOMY_RESERVATION_TEST=1 ~/.local/bin/uv run pytest -m dgx tests/dgx/test_reserve_release.py -s
```

## Rolling back

The previous helper is `autonomy/src/dgx_autonomy/reservation.py` at commit
`6a14e89`. Install that copy the same way as in step 1, and run
`sudo systemctl enable --now claude-qwen.service`. The busy notice
(`autonomy/host/busy_notice.py` and `autonomy/host/dgx-autonomy-busy-notice.service`
at `6a14e89`) comes back with `sudo host/install.sh` from that checkout.
