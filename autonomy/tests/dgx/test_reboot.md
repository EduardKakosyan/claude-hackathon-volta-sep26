# DGX restart checklist (manual)

A real reboot of hugo-dgx1 cannot be automated from the operator account, so this is a script to follow. It checks three things. A run resumes after the DGX restarts, with nobody connected. A deadline that passes while the DGX is off ends the run as `expired`, and the demo is kept. Keeper's summary endpoint comes back after a reboot without loading a model, and a reservation held before the reboot still keeps it from loading one.

Coordinate the reboot first: it restarts everything on the DGX, Keeper's summary endpoint (`keeper-summary`, a jim user unit) included. Keeper's queued summaries back off while the endpoint is down and resume on their next retry. A run holds the inference reservation (`dgx-autonomy reservation`); its record is a file under `/var/lib/dgx-autonomy/reservation/`, so it survives the reboot and the summary model stays unloaded until `dgx-autonomy release`, as intended.

## Part 1: the run resumes

1. Launch a run that works for a while and serves a demo:

   ```bash
   cat > /tmp/reboot-brief.md <<'EOF'
   Do these steps in order. Each is required.
   1. Create index.html in the project directory whose body is exactly: reboot demo ok
   2. Call start_demo with command `python3 -m http.server 3000 --bind 0.0.0.0` and port 3000.
   3. Run `sleep 300` in the terminal with the timeout set to 360 seconds, and wait for it.
   4. Create after-reboot.txt containing: done
   5. Run `sleep 120` the same way, then finish.
   EOF
   dgx-autonomy launch --brief /tmp/reboot-brief.md --budget-hours 1
   ```

2. Wait until `dgx-autonomy status RUN` shows the demo `running` and `dgx-autonomy logs RUN` shows the `sleep 300` action. Note the `conversation_id`, the `deadline_at` and the agent container id under `container`.
3. Disconnect the laptop. On the DGX, as the operator: `sudo reboot`.
4. Reconnect after the DGX is back (do not run anything else first), then wait 5 minutes.
5. `dgx-autonomy status RUN`. Expect:
   - [ ] `phase` is `running` or `finished`, with the same `conversation_id` and `deadline_at`
   - [ ] one `recovery #1 done`, caused by `llama-server is exited …; the agent sandbox is exited …`, with `conversation resumed from error`
   - [ ] one agent container, with the same id as before
   - [ ] the demo `running` again (`relaunched from the recorded spec…` in its history), and `curl -s 127.0.0.1:<host_port>/index.html` returns `reboot demo ok`
6. `dgx-autonomy logs RUN`. Expect exactly two user messages: the brief, then the recovery notice ("Your sandbox was restarted…").
7. Wait for `finished`, then check that `after-reboot.txt` exists in the `workspace_dir`.
8. `sudo docker compose -f ~jim/dgx-autonomy/containers/compose.yaml logs controller | grep -E "writer lock|startup reconciliation|recover"`. It shows `the DGX restarted since`, and then the recovery.

## Part 2: the deadline passes while the DGX is off

1. Launch the same brief with `--budget-hours 0.1` (6 minutes). Wait for the demo to be `running`.
2. `sudo poweroff`, and leave the DGX off until at least 10 minutes after the launch. Then power it on. Without physical access, use `sudo systemctl reboot` about 30 s before the `deadline_at` instead: the DGX takes about a minute to come back, so the deadline passes while it is down.
3. Reconnect and run `dgx-autonomy status RUN`. Expect:
   - [ ] `phase` `stopped`, `outcome` `expired`, and the same `deadline_at`
   - [ ] no recoveries, and exactly one user message in `logs`
   - [ ] stop evidence `verified`, `container_running: false`, demo `relaunched: true`
   - [ ] `dgx-autonomy ps RUN` shows only the supervisor and the demo, with no Agent Server
   - [ ] the demo answers on `127.0.0.1:<host_port>`

## Part 3: the summary endpoint after a reboot

Run this after Part 1 (the reservation is held by the run's launch) and again after `dgx-autonomy release`.

1. With the reservation held, after the DGX is back:
   - [ ] `dgx-autonomy reservation` shows `held`, the same `held_since` as before the reboot
   - [ ] `systemctl --user is-active keeper-summary` is `active`
   - [ ] `curl -s 127.0.0.1:8091/proxy/status` shows `"state": "idle"`, `"reserved": true`, `"pid": null`, `"loads": 0`
   - [ ] `ss -ltnp | grep 18091` shows nothing (no model server is listening)
   - [ ] a summary request answers `503` with `error.type` `reserved`, and `loads` stays `0`:
     `curl -s -H "Authorization: Bearer $(cat ~/.config/keeper-summary/api-key)" -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"Reply with: ok"}],"max_tokens":8}' 127.0.0.1:8091/v1/chat/completions`
2. `dgx-autonomy release` (once the run has ended), then:
   - [ ] `/proxy/status` shows `"reserved": false`, still `"state": "idle"` and `"loads": 0`: releasing loads nothing by itself
   - [ ] the same request answers `503` `loading` once, then a completion within the model's load time; `loads` is `1`
   - [ ] 10 minutes (`idle_seconds`) after the last request, `/proxy/status` is `idle` again with `last_stop_reason` `idle`, and port 18091 is free
3. Without a reservation held, reboot once more: `/proxy/status` shows `idle` and `loads` `0` until the first request.

Record the results (times, the recovery's cause and steps, anything unexpected) in the Phase 4 section of the structure outline.
