# Keeper's summary model, on demand

One OpenAI-compatible endpoint on the DGX for Keeper's summaries (hackathon issue #12,
Keeper issue #24). It replaces `claude-qwen`: nothing is loaded until Keeper asks, the
model goes away after it has been idle, and an autonomy run always wins the GPU.

```
Keeper ──Bearer key──▶ 127.0.0.1:8091  keeper_summary_proxy.py (systemd --user, jim)
                                │  starts / stops, private backend key
                                ▼
                       127.0.0.1:18091 llama-server (the configured model)
```

## What it does

| Situation | Answer |
|---|---|
| No model loaded, `POST /v1/chat/completions` or `GET /v1/models` | starts the model, `503` + `Retry-After: 10`, `error.type: loading` |
| Model loading | `503` `loading`, nothing more is started |
| Model healthy | proxied (streaming too) |
| Idle `idle_seconds` (600) with nothing in flight | model process group stopped, memory freed |
| `/var/lib/dgx-autonomy/reservation/record.json` exists | `503` `reserved`, nothing started |
| The record appears while a model is loaded | no new requests; in-flight ones get up to `reservation_grace_seconds` (180), then the model is stopped; a request cut off answers `503` |
| `MemAvailable` < model `need_gib` + `headroom_gib` (10) | `503` `busy`, nothing started |
| Model fails to load / dies | `503` `failed` for `failed_cooldown_seconds`, then the next request tries again |
| Missing or wrong key | `401`, nothing started |
| Any other path | `404`, never reaches the model |

**Keeper's backoff and the turned-away hold.** Keeper retries a `503` per job with
5 s doubling to 30 min (40 attempts). A job that has already waited comes back every 10,
20, then 30 minutes, longer than the 10-minute idle stop, so on its own each retry would
wake the model, be told `503`, and find it stopped again next time, until the job fails
for good. So a request answered `503` is remembered by a SHA-256 of method, path and body
(never the body), and a loaded model is not stopped for idleness until each remembered
request has been served again or `turned_away_hold_seconds` (1860) has passed since it was
turned away. Ordinary uploads are served on Keeper's 5-15 s retry and change nothing; the
reservation never waits for the hold. `0` turns it off.

`GET /proxy/status` (no key, content-free) shows state, model, reservation, in-flight
count, idle time left, loads, last load time, last stop reason and refusals.
`POST /proxy/unload` (with the key) stops the model now.

Logs carry one line per request (method, path, status, ms, bytes), never a body. The
model's own log is `~/.local/state/keeper-summary/model.log` (llama-server does not log
prompts at its default verbosity).

## Files

- `keeper_summary_proxy.py`: the proxy; standard library only, runs under `/usr/bin/python3 -I`.
- `config.example.json`: the deployed `config.json` starts from it; `model` picks one of `models`.
- `keeper-summary.service`: the user unit (`WantedBy=default.target`; jim lingers, so it starts at boot and loads nothing).
- `install.sh [ssh-host]`: copies the proxy and unit to `~/keeper-summary/` as jim, keeps an existing `config.json`, creates `~/.config/keeper-summary/api-key` (0600) once, enables and restarts the unit.
- `tests/`: end to end against `tests/stub_model.py`, a llama-server-shaped stub (`uv run pytest summary_proxy/tests` from `autonomy/`).
- `bakeoff/bakeoff.py`: the model comparison; it runs a private proxy on 8092/18092 and Keeper's own `keeper.llm.summarise`.

## Operating it (on the DGX, as jim)

```sh
systemctl --user status keeper-summary            # running = listening; no model until a request
systemctl --user restart keeper-summary           # stops a loaded model; loads nothing
systemctl --user stop keeper-summary              # endpoint gone; Keeper sees "unreachable" and backs off
journalctl --user -u keeper-summary -f
curl -s http://127.0.0.1:8091/proxy/status
curl -s -XPOST -H "Authorization: Bearer $(cat ~/.config/keeper-summary/api-key)" \
     http://127.0.0.1:8091/proxy/unload
```

Changing the model: edit `model` in `~/keeper-summary/config.json`, then restart the unit.

## Keeper's configuration

```
KEEPER_LLM_BASE_URL=http://127.0.0.1:8091/v1
KEEPER_LLM_MODEL=<the config's model name>   # llama-server serves one model and ignores the name
KEEPER_LLM_API_KEY=<contents of /home/jim/.config/keeper-summary/api-key>
```

The endpoint listens on loopback only, so Keeper reaches it when it runs on the DGX.
A Keeper elsewhere needs a tailnet route to 8091 (operator, with sudo).
