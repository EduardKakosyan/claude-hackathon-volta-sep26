"""Summary-model bake-off, run on the DGX: what Keeper would actually get from each model.

    python bakeoff.py --model qwen3.6-35b-a3b --meetings meetings.json --keeper-src DIR --out DIR

For one model it starts a private instance of the on-demand proxy (port 8092, model server
on 18092, so the deployed endpoint on 8091 is untouched) with the model's entry from the
proxy config, and measures:

- cold load: first request to the first 200, through the proxy (it answers 503 meanwhile);
- peak memory: the drop in MemAvailable from before the start to its lowest point while
  the model is loaded and working, sampled every 0.5 s, plus the model process's peak RSS
  and what nvidia-smi attributes to it;
- each meeting through Keeper's own ``keeper.llm.summarise`` (its prompt, chunking at the
  default 60 000 characters, merge, ``response_format: json_object``, temperature 0.2,
  the 600 s timeout), the wall time, per-request prompt/decode tokens per second from
  llama-server's ``timings``, whether every reply parsed as strict JSON, whether Keeper's
  validator accepted the result, and the action items it found.

Meeting content stays on the DGX: the results file is written 0600 next to the inputs.
Only the operator copies it to their Mac. Nothing here talks to any other host.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import keeper_summary_proxy as ksp  # noqa: E402

GIB = 1024**3


class Sampler(threading.Thread):
    def __init__(self, sup: ksp.Supervisor) -> None:
        super().__init__(daemon=True)
        self.sup = sup
        self.min_available = ksp.mem_available_bytes(Path("/proc/meminfo"))
        self.peak_rss = 0
        self.peak_gpu_mib = 0
        self.stop = threading.Event()
        self._n = 0

    def run(self) -> None:
        while not self.stop.wait(0.5):
            self.min_available = min(
                self.min_available, ksp.mem_available_bytes(Path("/proc/meminfo"))
            )
            proc = self.sup.proc
            if proc is None:
                continue
            try:
                for line in Path(f"/proc/{proc.pid}/status").read_text().splitlines():
                    if line.startswith("VmRSS:"):
                        self.peak_rss = max(self.peak_rss, int(line.split()[1]) * 1024)
            except OSError:
                pass
            self._n += 1
            if self._n % 4 == 0:
                try:
                    out = subprocess.run(
                        [
                            "nvidia-smi",
                            "--query-compute-apps=pid,used_memory",
                            "--format=csv,noheader,nounits",
                        ],
                        capture_output=True,
                        text=True,
                        timeout=10,
                    ).stdout
                    for row in out.splitlines():
                        pid, _, mib = row.partition(",")
                        if pid.strip() == str(proc.pid) and mib.strip().isdigit():
                            self.peak_gpu_mib = max(self.peak_gpu_mib, int(mib))
                except (OSError, subprocess.SubprocessError):
                    pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--config", default=str(Path.home() / "keeper-summary/config.json"))
    ap.add_argument("--meetings", required=True)
    ap.add_argument("--keeper-src", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    sys.path.insert(0, args.keeper_src)
    import httpx
    from keeper import llm  # Keeper's own summarizer: prompt, chunking, merge, validator

    raw = json.loads(Path(args.config).read_text())
    raw.update(
        {
            "model": args.model,
            "listen": "127.0.0.1:8092",
            "backend_port": 18092,
            "state_dir": str(Path.home() / ".local/state/keeper-summary-bakeoff"),
            "idle_seconds": 3600,
        }
    )
    cfg = ksp.Config.from_dict(raw)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    result: dict[str, Any] = {
        "model": args.model,
        "argv": list(cfg.model.argv),
        "keeper_context_chars": 60_000,
    }
    baseline = ksp.mem_available_bytes(Path("/proc/meminfo"))
    result["mem_available_before_gib"] = round(baseline / GIB, 1)
    need = cfg.model.need_gib + cfg.headroom_gib
    if baseline < need * GIB:
        result["skipped"] = (
            f"{baseline / GIB:.1f} GiB available; the model needs {need:.0f} GiB with headroom"
        )
        print(json.dumps(result, indent=2))
        _write(out_dir / f"result-{args.model}.json", result)
        return 2

    server, sup = ksp.build(cfg)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Thread(target=sup.monitor, daemon=True).start()
    sampler = Sampler(sup)
    sampler.start()
    key = ksp.read_key(cfg.api_key_file)
    base = "http://127.0.0.1:8092/v1"
    try:
        t0 = time.monotonic()
        first = httpx.get(base + "/models", headers={"Authorization": f"Bearer {key}"}, timeout=30)
        result["first_status"] = first.status_code
        while True:
            r = httpx.get(base + "/models", headers={"Authorization": f"Bearer {key}"}, timeout=30)
            if r.status_code == 200:
                break
            if sup.status()["state"] == "idle":
                result["load_error"] = sup.status()["last_error"] or sup.status()["last_refusal"]
                raise RuntimeError(f"the model did not load: {result['load_error']}")
            time.sleep(1.0)
        result["cold_load_seconds"] = round(time.monotonic() - t0, 1)
        result["mem_after_load_gib"] = round(
            (baseline - ksp.mem_available_bytes(Path("/proc/meminfo"))) / GIB, 1
        )

        endpoint = llm.LLMEndpoint(base_url=base, model=args.model, api_key=key)
        meetings = json.loads(Path(args.meetings).read_text())
        result["meetings"] = []
        for m in meetings:
            calls: list[dict[str, Any]] = []

            def post(url: str, calls: list[dict[str, Any]] = calls, **kw: Any) -> httpx.Response:
                started = time.monotonic()
                resp = httpx.post(url, **kw)
                rec: dict[str, Any] = {
                    "status": resp.status_code,
                    "seconds": round(time.monotonic() - started, 1),
                }
                try:
                    body = resp.json()
                    content = body["choices"][0]["message"]["content"]
                    rec["raw"] = content
                    try:
                        json.loads(content)
                        rec["strict_json"] = True
                    except (json.JSONDecodeError, TypeError):
                        rec["strict_json"] = False
                    rec["finish_reason"] = body["choices"][0].get("finish_reason")
                    t = body.get("timings") or {}
                    u = body.get("usage") or {}
                    rec.update(
                        prompt_tokens=u.get("prompt_tokens") or t.get("prompt_n"),
                        completion_tokens=u.get("completion_tokens") or t.get("predicted_n"),
                        prompt_tps=round(t.get("prompt_per_second") or 0, 1),
                        decode_tps=round(t.get("predicted_per_second") or 0, 1),
                    )
                except (ValueError, KeyError, IndexError, TypeError):
                    pass
                calls.append(rec)
                return resp

            entry: dict[str, Any] = {"key": m["key"], "segments": len(m["segments"])}
            lines = llm.transcript_text(m["segments"]).splitlines()
            entry["transcript_chars"] = sum(len(x) + 1 for x in lines)
            entry["chunks"] = len(llm.chunk_transcript(lines, 60_000))
            started = time.monotonic()
            try:
                summary = llm.summarise(
                    endpoint,
                    m["segments"],
                    title=m.get("title") or "",
                    started_at=m.get("started_at"),
                    max_chars=60_000,
                    post=post,
                )
                entry["keeper_valid"] = True
                entry["summary"] = summary
                entry["action_items"] = len(summary.get("action_items") or [])
                entry["owned_action_items"] = sum(
                    1 for i in summary.get("action_items") or [] if i.get("owner")
                )
                entry["timestamped_action_items"] = sum(
                    1
                    for i in summary.get("action_items") or []
                    if i.get("timestamp_seconds") is not None
                )
                entry["topics"] = len(summary.get("topics") or [])
                entry["decisions"] = len(summary.get("decisions") or [])
                entry["keywords"] = len(summary.get("keywords") or [])
            except llm.LLMError as exc:
                entry["keeper_valid"] = False
                entry["error"] = str(exc)
            entry["seconds"] = round(time.monotonic() - started, 1)
            entry["calls"] = calls
            result["meetings"].append(entry)
            print(
                f"{args.model} {m['key']}: {entry['seconds']}s valid={entry['keeper_valid']}"
                f" items={entry.get('action_items')} chunks={entry['chunks']}",
                flush=True,
            )
    except Exception as exc:  # record what happened, then clean up
        result["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        sampler.stop.set()
        sampler.join(5)
        result["peak_mem_drop_gib"] = round((baseline - sampler.min_available) / GIB, 1)
        result["min_available_gib"] = round(sampler.min_available / GIB, 1)
        result["peak_rss_gib"] = round(sampler.peak_rss / GIB, 1)
        result["peak_nvidia_smi_gib"] = round(sampler.peak_gpu_mib / 1024, 1)
        sup.close()
        server.shutdown()
        server.server_close()
        time.sleep(5)
        result["mem_available_after_stop_gib"] = round(
            ksp.mem_available_bytes(Path("/proc/meminfo")) / GIB, 1
        )
        _write(out_dir / f"result-{args.model}.json", result)
    summary = {k: v for k, v in result.items() if k not in ("meetings", "argv")}
    print(json.dumps(summary, indent=2))
    return 0 if "error" not in result else 1


def _write(path: Path, obj: Any) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(obj, fh, indent=1)


if __name__ == "__main__":
    sys.exit(main())
