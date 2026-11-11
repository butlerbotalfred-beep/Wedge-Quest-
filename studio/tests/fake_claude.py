"""A stand-in for api.anthropic.com for trying the game without a key.

It answers POST /v1/messages (streaming) with made-up questions in the format the game
expects, one per topic named in the prompt. The questions are obviously fake. Use it with:

    python fake_claude.py 8790
    ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://127.0.0.1:8790 uv run --script ../server.py
"""
import json
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"
    count = 0

    def log_message(self, fmt, *args):
        sys.stderr.write("fake-claude: " + (fmt % args) + "\n")

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        prompt = body["messages"][0]["content"]
        topics = re.findall(r"^(c\d+) = (.+)$", prompt, re.M)
        per = int(re.search(r"write (\d+) question", prompt).group(1)) if topics else 0
        age = re.search(r"(\d+) years old", prompt).group(1) if topics else "?"
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        w = self.wfile.write
        w(sse("message_start", {"type": "message_start", "message": {"id": "msg_fake", "type": "message", "role": "assistant", "model": body["model"], "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 900, "output_tokens": 1}}}))
        w(sse("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}))
        time.sleep(0.8)  # pretend to think
        if not topics:  # the server's setup check: "reply with the word OK"
            w(sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "OK"}}))
        for k in range(per):
            for cid, name in topics:
                Handler.count += 1
                row = {"t": cid, "q": f"Fake AI question {Handler.count} about {name}, for a {age} year old: which answer is right?", "a": "The right answer", "w": ["A wrong answer", "Another wrong answer", "A third wrong answer"], "f": f"This fake fact is about {name}."}
                w(sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": json.dumps(row) + "\n"}}))
                self.wfile.flush()
                time.sleep(0.15)
        w(sse("content_block_stop", {"type": "content_block_stop", "index": 0}))
        w(sse("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 90 * per * len(topics)}}))
        w(sse("message_stop", {"type": "message_stop"}))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
