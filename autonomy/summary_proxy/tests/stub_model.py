"""A stand-in model server for the proxy's tests: llama-server's shape, no model.

`/health` answers 503 for --load-seconds, then 200. `/v1/chat/completions` answers a
fixed Keeper-shaped JSON reply after --reply-seconds. Every route but /health needs
`Authorization: Bearer <key from --api-key-file>`, as llama-server does. It records its
pid in --pid-file so a test can tell the process really went away.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPLY = {
    "overview": "Stub overview.",
    "notes": "Stub notes.",
    "action_items": [{"owner": "A", "text": "Do the thing", "timestamp_seconds": 3}],
    "keywords": ["stub"],
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--api-key-file", required=True)
    ap.add_argument("--load-seconds", type=float, default=0.5)
    ap.add_argument("--reply-seconds", type=float, default=0.0)
    ap.add_argument("--pid-file")
    ap.add_argument("--alias", default="stub")
    args = ap.parse_args()
    key = Path(args.api_key_file).read_text().strip()
    started = time.monotonic()
    if args.pid_file:
        Path(args.pid_file).write_text(str(os.getpid()))

    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a: object) -> None:
            return

        def _send(self, status: int, obj: object) -> None:
            body = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _ok(self) -> bool:
            if self.headers.get("Authorization") != f"Bearer {key}":
                self._send(401, {"error": "bad key"})
                return False
            return True

        def do_GET(self) -> None:
            if self.path == "/health":
                loaded = time.monotonic() - started >= args.load_seconds
                self._send(200 if loaded else 503, {"status": "ok" if loaded else "loading"})
            elif self.path == "/v1/models" and self._ok():
                self._send(200, {"object": "list", "data": [{"id": args.alias}]})

        def do_POST(self) -> None:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
            if self.path != "/v1/chat/completions" or not self._ok():
                return
            delay = float(req.get("stub_delay", args.reply_seconds))
            time.sleep(delay)
            self._send(
                200,
                {
                    "object": "chat.completion",
                    "model": args.alias,
                    "choices": [
                        {"index": 0, "message": {"role": "assistant", "content": json.dumps(REPLY)}}
                    ],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 20},
                },
            )

    ThreadingHTTPServer(("127.0.0.1", args.port), H).serve_forever()


if __name__ == "__main__":
    main()
