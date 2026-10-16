"""Render the bake-off results as one local HTML page: a content-free scorecard, then the
summaries side by side.

    ssh hugo-dgx1 'python3 ~/keeper-summary/bakeoff/render.py --dump DATA_DIR' \
      | python3 -I render.py --out ~/keeper-diagnostics/summary-bakeoff.html [--reference ref.json]

``--dump`` (on the DGX) prints the result files as one JSON list on stdout; the default
mode reads that list on stdin and writes the page 0600. The results travel over ssh into
this process and are written only to ``--out``: the page holds client meeting content,
so it belongs in a local, unsynced directory.

``--reference`` is an optional JSON object ``{"M1": {"url": ..., "action_items": n}}``:
the meeting's original in Fireflies and how many action items Fireflies itself listed.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from pathlib import Path
from typing import Any

ORDER = ["qwen3.8-27b", "qwen3.6-35b-a3b", "qwen3.8-flash-next", "deepseek-v4-flash"]


def dump(directory: Path) -> int:
    out = [json.loads(p.read_text()) for p in sorted(directory.glob("result-*.json"))]
    json.dump(out, sys.stdout)
    return 0


def _tps(calls: list[dict[str, Any]], tokens: str, rate: str) -> float | None:
    """Token-weighted rate across calls: total tokens over total seconds."""
    n = secs = 0.0
    for c in calls:
        t, r = c.get(tokens) or 0, c.get(rate) or 0
        if t and r:
            n += t
            secs += t / r
    return round(n / secs, 1) if secs else None


def scorecard(results: list[dict[str, Any]], ref: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for r in results:
        ms = r.get("meetings") or []
        calls = [c for m in ms for c in m.get("calls", [])]
        rows.append(
            {
                "model": r["model"],
                "ran": "skipped" not in r and "error" not in r,
                "note": r.get("skipped") or r.get("error") or "",
                "cold_load_s": r.get("cold_load_seconds"),
                "mem_loaded_gib": r.get("mem_after_load_gib"),
                "peak_mem_gib": r.get("peak_mem_drop_gib"),
                "gpu_gib": r.get("peak_nvidia_smi_gib"),
                "prompt_tps": _tps(calls, "prompt_tokens", "prompt_tps"),
                "decode_tps": _tps(calls, "completion_tokens", "decode_tps"),
                "per_meeting_s": [m.get("seconds") for m in ms],
                "total_s": round(sum(m.get("seconds") or 0 for m in ms), 1) if ms else None,
                "strict_json": f"{sum(1 for c in calls if c.get('strict_json'))}/{len(calls)}"
                if calls
                else "",
                "keeper_valid": f"{sum(1 for m in ms if m.get('keeper_valid'))}/{len(ms)}"
                if ms
                else "",
                "action_items": [m.get("action_items") for m in ms],
                "owned_items": [m.get("owned_action_items") for m in ms],
                "timestamped_items": [m.get("timestamped_action_items") for m in ms],
                "hit_limit": sum(1 for c in calls if c.get("finish_reason") == "length"),
                "freed_after_stop": r.get("mem_available_after_stop_gib"),
            }
        )
    return rows


def _e(v: Any) -> str:
    return html.escape("" if v is None else str(v))


def _list(xs: Any) -> str:
    return " / ".join("-" if x is None else str(x) for x in xs or [])


def _summary_html(m: dict[str, Any]) -> str:
    if not m.get("keeper_valid"):
        return f"<p class=bad>Keeper rejected it: {_e(m.get('error'))}</p>"
    s = m.get("summary") or {}
    parts = [f"<p class=meta>{_e(m.get('seconds'))} s, {_e(m.get('chunks'))} chunk(s)</p>"]
    if s.get("title"):
        parts.append(f"<h4>{_e(s['title'])}</h4>")
    parts.append(f"<p>{_e(s.get('overview'))}</p>")
    items = s.get("action_items") or []
    parts.append(f"<h5>Action items ({len(items)})</h5><ol>")
    for i in items:
        ts = i.get("timestamp_seconds")
        stamp = f" <span class=meta>[{int(ts) // 60:02d}:{int(ts) % 60:02d}]</span>" if ts else ""
        parts.append(
            f"<li><b>{_e(i.get('owner') or 'unowned')}</b>: {_e(i.get('text'))}{stamp}</li>"
        )
    parts.append("</ol>")
    decisions = s.get("decisions") or []
    if decisions:
        parts.append(f"<h5>Decisions ({len(decisions)})</h5><ul>")
        parts += [f"<li>{_e(d)}</li>" for d in decisions]
        parts.append("</ul>")
    for t in s.get("topics") or []:
        parts.append(f"<h5>{_e(t.get('topic'))}</h5><ul>")
        parts += [f"<li>{_e(b)}</li>" for b in t.get("bullets") or []]
        parts.append("</ul>")
    parts.append(f"<details><summary>Notes</summary><pre>{_e(s.get('notes'))}</pre></details>")
    parts.append(f"<p class=meta>Keywords: {_e(', '.join(s.get('keywords') or []))}</p>")
    return "\n".join(parts)


def render(results: list[dict[str, Any]], ref: dict[str, Any]) -> str:
    results = sorted(results, key=lambda r: ORDER.index(r["model"]) if r["model"] in ORDER else 99)
    rows = scorecard(results, ref)
    keys = [
        m["key"]
        for m in (next((r for r in results if r.get("meetings")), {}).get("meetings") or [])
    ]
    ref_items = " / ".join(str((ref.get(k) or {}).get("action_items", "-")) for k in keys)
    out = [
        "<!doctype html><meta charset=utf-8><title>Keeper summary bake-off</title>",
        "<style>body{font:14px/1.45 -apple-system,sans-serif;margin:24px;color:#222}"
        "table{border-collapse:collapse;margin:8px 0 24px}"
        "td,th{border:1px solid #ccc;padding:4px 8px;"
        "vertical-align:top;text-align:left}th{background:#f3f3f3}.meta{color:#777;font-size:12px}"
        ".bad{color:#b00}.grid{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(320px,1fr);"
        "gap:12px;overflow-x:auto}.col{border:1px solid #ddd;border-radius:6px;padding:8px 12px}"
        "pre{white-space:pre-wrap;font:12px/1.4 ui-monospace,monospace}h4{margin:4px 0}</style>",
        "<h1>Keeper summary model bake-off</h1>",
        "<p class=meta>Local file: contains client meeting content. Do not sync, share or upload."
        " Every model ran on the DGX through the on-demand proxy and Keeper's own"
        " <code>keeper.llm.summarise</code> (its prompt, 60 000-character chunks, merge,"
        " JSON mode, temperature 0.2, 600 s timeout).</p>",
        "<h2>Scorecard</h2><table><tr><th>Model</th><th>Cold load (s)</th>"
        "<th>Memory loaded / peak (GiB)</th><th>Prompt tok/s</th><th>Decode tok/s</th>"
        "<th>Time per meeting (s)</th><th>Total (s)</th><th>Strict JSON replies</th>"
        "<th>Keeper accepted</th><th>Action items (owned / timestamped)</th><th>Note</th></tr>",
    ]
    for r in rows:
        items = " / ".join(
            "-" if n is None else f"{n} <span class=meta>({o} owned, {t} timed)</span>"
            for n, o, t in zip(
                r["action_items"], r["owned_items"], r["timestamped_items"], strict=True
            )
        )
        out.append(
            f"<tr><td><b>{_e(r['model'])}</b></td><td>{_e(r['cold_load_s'])}</td>"
            f"<td>{_e(r['mem_loaded_gib'])} / {_e(r['peak_mem_gib'])}</td>"
            f"<td>{_e(r['prompt_tps'])}</td><td>{_e(r['decode_tps'])}</td>"
            f"<td>{_e(_list(r['per_meeting_s']))}</td><td>{_e(r['total_s'])}</td>"
            f"<td>{_e(r['strict_json'])}</td><td>{_e(r['keeper_valid'])}</td><td>{items}</td>"
            f"<td>{_e(r['note'])}{' hit the token limit' if r['hit_limit'] else ''}</td></tr>"
        )
    out.append(
        f"<tr><td class=meta>Fireflies' own summary</td><td colspan=8></td>"
        f"<td class=meta>{_e(ref_items)}</td><td></td></tr></table>"
    )
    for k in keys:
        link = (ref.get(k) or {}).get("url")
        anchor = f' <a href="{_e(link)}">original in Fireflies</a>' if link else ""
        out.append(f"<h2>{_e(k)}{anchor}</h2><div class=grid>")
        for r in results:
            m = next((x for x in r.get("meetings") or [] if x["key"] == k), None)
            if m is None:
                continue
            out.append(f"<div class=col><h3>{_e(r['model'])}</h3>{_summary_html(m)}</div>")
        out.append("</div>")
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", help="(on the DGX) print the result files in this directory")
    ap.add_argument("--out", help="the HTML file to write (0600)")
    ap.add_argument("--reference", help="JSON: per meeting key, Fireflies url and item count")
    args = ap.parse_args()
    if args.dump:
        return dump(Path(args.dump).expanduser())
    results = json.load(sys.stdin)
    ref = json.loads(Path(args.reference).read_text()) if args.reference else {}
    out = Path(args.out).expanduser()
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(render(results, ref))
    os.chmod(out, 0o600)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
