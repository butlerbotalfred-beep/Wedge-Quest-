"""Tests for the Wedge Quest Studio server.

Run from the studio folder:
    uv run --no-project --python 3.12 --with "anthropic>=2.3,<3" --with kokoro-onnx python -I -m unittest discover -s tests -v

The Claude calls go through the real Anthropic SDK to a fake API running on this machine, so the
streaming, error mapping and retry logic are exercised without a key or any network access. The
voice tests that need the real Kokoro model skip themselves when it is not downloaded.
"""
import hashlib
import http.client
import importlib.util
import json
import re
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STUDIO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("wqserver", STUDIO / "server.py")
srv = importlib.util.module_from_spec(spec)
sys.modules["wqserver"] = srv  # dataclasses needs the module registered
spec.loader.exec_module(srv)

import anthropic  # noqa: E402

QUIZ_PROMPT = srv.PROMPT_START + " of a family trivia board game. Write 2 questions.\nOUTPUT: one JSON object per line"
LINE = '{"t":"c0","q":"Which planet is known as the Red Planet?","a":"Mars","w":["Venus","Jupiter","Saturn"],"f":"Mars looks red."}\n'


# --- a stand-in for api.anthropic.com -------------------------------------------------------
def sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


class FakeAnthropic:
    """Speaks just enough of POST /v1/messages (streaming) for the SDK. Script one reply per request."""

    def __init__(self):
        self.requests = []
        self.script = []
        outer = self

        class H(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.0"

            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
                step = outer.script.pop(0) if outer.script else {}
                status = step.get("status", 200)
                if status != 200:
                    err = json.dumps({"type": "error", "error": {"type": step.get("type", "api_error"), "message": step.get("message", "boom")}}).encode()
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(err)))
                    self.end_headers()
                    self.wfile.write(err)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                w = self.wfile.write
                w(sse("message_start", {"type": "message_start", "message": {"id": "msg_test", "type": "message", "role": "assistant", "model": body["model"], "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 120, "output_tokens": 1}}}))
                w(sse("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}))
                for piece in step.get("deltas", [LINE]):
                    w(sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": piece}}))
                if step.get("midstream_error"):
                    w(sse("error", {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}))
                    return
                w(sse("content_block_stop", {"type": "content_block_stop", "index": 0}))
                w(sse("message_delta", {"type": "message_delta", "delta": {"stop_reason": step.get("stop", "end_turn"), "stop_sequence": None}, "usage": {"output_tokens": 60}}))
                w(sse("message_stop", {"type": "message_stop"}))

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.httpd.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class FakeVoice:
    default = "af_heart"
    state = "ready"
    voices = [{"id": "af_heart", "name": "Heart", "lang": "en-US", "label": "Heart · American, female"}]

    def __init__(self):
        self.calls = []

    def start(self, wait=False):
        pass

    def status(self):
        return {"engine": "kokoro", "state": self.state, "progress": 1.0, "message": "", "default": self.default, "voices": self.voices, "rate": 24000}

    def synth(self, text, voice, speed):
        if self.state != "ready":
            raise srv.VoiceNotReady(self.state)
        self.calls.append((text, voice, speed))
        import numpy as np

        return srv.wav_bytes(np.sin(np.linspace(0, 200, 4800)) * 0.3, 24000)


def start_studio(www, api_key="sk-test-secret-1234", fake=None, voice=None, **cfg_kw):
    srv.WWW = Path(www)
    cfg = srv.Config(host="127.0.0.1", port=0, api_key=api_key, models_dir=Path(www) / "m", **cfg_kw)
    log = lambda m: None  # noqa: E731
    client = None
    if fake is not None:
        client = anthropic.Anthropic(base_url=fake.url, api_key=api_key or "x", max_retries=0, timeout=10.0)
    quiz = srv.Quizmaster(cfg, log, client=client)
    if api_key is None and client is None:
        quiz.enabled = False
    app = srv.App(cfg, log, quiz=quiz, voice=voice or FakeVoice())
    httpd = srv.make_server(app, "127.0.0.1", 0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return app, httpd, httpd.server_address[1]


def request(port, method, path, body=None, headers=None, raw=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
    hdrs = {"Content-Type": "application/json"} if body is not None or raw is not None else {}
    hdrs.update(headers or {})
    payload = raw if raw is not None else (json.dumps(body) if body is not None else None)
    c.request(method, path, body=payload, headers=hdrs)
    r = c.getresponse()
    data = r.read()
    c.close()
    return r, data


def ndjson(data):
    return [json.loads(x) for x in data.decode().splitlines() if x.strip()]


class StudioCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.www = Path(self.tmp.name)
        (self.www / "index.html").write_text("<!doctype html><title>Game</title>")
        (self.www / "vendor").mkdir()
        (self.www / "vendor" / "lib.js").write_text("var x=1;")
        (self.www / "f.woff2").write_bytes(b"wOF2")
        self.fake = FakeAnthropic()
        self.addCleanup(self.fake.close)
        self.addCleanup(self.tmp.cleanup)

    def studio(self, **kw):
        kw.setdefault("fake", self.fake)
        app, httpd, port = start_studio(self.www, **kw)
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        return app, port


class GuardTests(unittest.TestCase):
    def test_host_check(self):
        ok = ["localhost:8777", "127.0.0.1:8777", "192.168.1.20:8777", "[::1]:8777", "mac-studio.local:8777", "mac-studio:8777", "10.0.0.5", "kids-ipad.lan"]
        bad = ["evil.example.com", "evil.example.com:8777", "127.0.0.1.evil.com:8777", "attacker.dev", "", None]
        for h in ok:
            self.assertTrue(srv.host_allowed(h), h)
        for h in bad:
            self.assertFalse(srv.host_allowed(h), h)
        self.assertTrue(srv.host_allowed("quiz.example.com", {"quiz.example.com"}), "explicitly allowed names pass")

    def test_origin_check(self):
        self.assertTrue(srv.origin_allowed(None, "x:1"))
        self.assertTrue(srv.origin_allowed("http://192.168.1.20:8777", "192.168.1.20:8777"))
        self.assertFalse(srv.origin_allowed("http://evil.example.com", "192.168.1.20:8777"))
        self.assertFalse(srv.origin_allowed("null", "192.168.1.20:8777"))

    def test_rate_limiter_is_per_key_and_rolling(self):
        r = srv.RateLimiter(3)
        self.assertEqual([r.allow("a", 0), r.allow("a", 1), r.allow("a", 2), r.allow("a", 3)], [True, True, True, False])
        self.assertTrue(r.allow("b", 3), "another caller is unaffected")
        self.assertTrue(r.allow("a", 61), "the window rolls")

    def test_daily_budget(self):
        b = srv.DailyBudget(2)
        self.assertEqual([b.take(), b.take(), b.take()], [True, True, False])
        b.record(100, 50)
        self.assertEqual((b.snapshot()["tokensIn"], b.snapshot()["tokensOut"]), (100, 50))
        self.assertTrue(srv.DailyBudget(0).take(), "0 means no limit")

    def test_cost_estimate(self):
        self.assertAlmostEqual(srv.estimate_cost("claude-opus-5-5", 1_000_000, 1_000_000), 24.0)
        self.assertIsNone(srv.estimate_cost("some-future-model", 10, 10))

    def test_env_file_never_overrides_real_environment(self):
        import os

        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / ".env"
            p.write_text("# comment\nWQ_T1=from-file\nWQ_T2 = 'quoted value'\nWQ_T3=\n\nnot a pair\n")
            os.environ["WQ_T1"] = "from-env"
            os.environ.pop("WQ_T2", None)
            os.environ["WQ_T3"] = ""
            self.addCleanup(lambda: [os.environ.pop(k, None) for k in ("WQ_T1", "WQ_T2", "WQ_T3")])
            srv.load_dotenv(p)
            self.assertEqual(os.environ["WQ_T1"], "from-env")
            self.assertEqual(os.environ["WQ_T2"], "quoted value")
            self.assertEqual(os.environ["WQ_T3"], "")


class WavTests(unittest.TestCase):
    def test_wav_is_valid_and_fades(self):
        import io
        import wave

        import numpy as np

        data = srv.wav_bytes(np.ones(24000, dtype=np.float32) * 0.5, 24000)
        with wave.open(io.BytesIO(data)) as w:
            self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()), (1, 2, 24000, 24000))
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
        self.assertEqual(pcm[0], 0, "starts at silence (no click)")
        self.assertEqual(pcm[-1], 0, "ends at silence (no click)")
        self.assertAlmostEqual(int(pcm[12000]), 16383, delta=2)

    def test_loud_input_is_clipped_not_wrapped(self):
        import io
        import wave

        import numpy as np

        data = srv.wav_bytes(np.ones(2400, dtype=np.float32) * 3.0, 24000)
        with wave.open(io.BytesIO(data)) as w:
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
        self.assertEqual(int(pcm[1200]), 32767)

    def test_voice_labels(self):
        self.assertEqual(srv.describe_voice("af_heart", "Heart")["label"], "Heart · American, female")
        self.assertEqual(srv.describe_voice("bm_george", "George")["lang"], "en-GB")


class StaticAndStatusTests(StudioCase):
    def test_status_has_no_secrets_and_reports_both_services(self):
        app, port = self.studio()
        r, data = request(port, "GET", "/api/status")
        self.assertEqual(r.status, 200)
        s = json.loads(data)
        self.assertEqual((s["app"], s["ai"]["enabled"], s["ai"]["model"]), ("wedge-quest-studio", True, "claude-opus-5-5"))
        self.assertEqual((s["tts"]["state"], s["tts"]["default"]), ("ready", "af_heart"))
        self.assertNotIn(b"sk-test-secret", data, "the API key must never appear in a response")

    def test_status_without_key_says_why(self):
        app, port = self.studio(api_key=None, fake=None)
        s = json.loads(request(port, "GET", "/api/status")[1])
        self.assertEqual((s["ai"]["enabled"], s["ai"]["reason"]), (False, "no_key"))

    def test_status_reports_the_build(self):
        app, port = self.studio()
        s = json.loads(request(port, "GET", "/api/status")[1])
        self.assertEqual(s["build"], srv.BUILD)
        self.assertEqual(s["version"], srv.BUILD["version"])
        self.assertEqual(sorted(srv.BUILD), ["commit", "date", "version"])

    def test_reads_the_build_stamped_into_the_page(self):
        srv.WWW = self.www
        self.assertIsNone(srv.page_build(), "a page with no stamp has no build")
        (self.www / "index.html").write_text('<script>\nwindow.WQ_BUILD = {"version":"9.9.9","date":"2030-01-02","commit":"abc1234"};\n</script>')
        self.assertEqual(srv.page_build(), {"version": "9.9.9", "date": "2030-01-02", "commit": "abc1234"})
        (self.www / "index.html").write_text("window.WQ_BUILD = {broken;")
        self.assertIsNone(srv.page_build())
        (self.www / "index.html").unlink()
        self.assertIsNone(srv.page_build())

    def test_the_banner_warns_when_page_and_server_builds_differ(self):
        app, port = self.studio()
        stamp = lambda b: (self.www / "index.html").write_text("window.WQ_BUILD = " + json.dumps(b) + ";")  # noqa: E731
        stamp(srv.BUILD)
        same = srv.banner(app.cfg, app)
        self.assertIn(f"Wedge Quest Studio {srv.BUILD['version']} ({srv.BUILD['date']}, {srv.BUILD['commit']})", same)
        self.assertNotIn("WARNING", same)
        stamp({**srv.BUILD, "version": "0.9.0"})
        differ = srv.banner(app.cfg, app)
        self.assertIn("WARNING", differ)
        self.assertIn("0.9.0", differ)
        (self.www / "index.html").write_text("<!doctype html><title>Game</title>")
        self.assertIn("WARNING", srv.banner(app.cfg, app), "a page with no stamp is from before 1.0.1")

    def test_the_shipped_page_and_the_server_are_the_same_build(self):
        # C0.5: what the game menu shows (the stamp in the page) is what /api/status returns.
        srv.WWW = Path(srv.__file__).resolve().parent / "www"
        app, port = self.studio()
        srv.WWW = Path(srv.__file__).resolve().parent / "www"  # studio() points it at the temp folder
        page = request(port, "GET", "/")[1].decode()
        m = re.search(r"window\.WQ_BUILD = (\{[^}]*\});", page)
        self.assertIsNotNone(m, "the shipped page carries a build stamp")
        self.assertEqual(json.loads(m.group(1)), json.loads(request(port, "GET", "/api/status")[1])["build"])

    def test_serves_game_files_with_headers(self):
        app, port = self.studio()
        r, data = request(port, "GET", "/")
        self.assertEqual((r.status, data), (200, b"<!doctype html><title>Game</title>"))
        self.assertEqual(r.getheader("Cache-Control"), "no-cache")
        self.assertIn("default-src 'self'", r.getheader("Content-Security-Policy"))
        self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")
        r, _ = request(port, "GET", "/vendor/lib.js")
        self.assertEqual((r.status, r.getheader("Content-Type").split(";")[0]), (200, "text/javascript"))
        r, _ = request(port, "GET", "/f.woff2")
        self.assertEqual(r.getheader("Content-Type"), "font/woff2")

    def test_cannot_read_outside_the_game_folder_or_list_directories(self):
        app, port = self.studio()
        for path in ("/../server.py", "/%2e%2e/server.py", "/..%2fserver.py", "/vendor/", "/vendor"):
            r, data = request(port, "GET", path)
            self.assertIn(r.status, (301, 404), path)
            self.assertNotIn(b"import", data, path)

    def test_foreign_host_header_is_refused(self):
        app, port = self.studio()
        r, _ = request(port, "GET", "/api/status", headers={"Host": "evil.example.com"})
        self.assertEqual(r.status, 421)
        r, _ = request(port, "GET", "/", headers={"Host": "evil.example.com"})
        self.assertEqual(r.status, 421)


class AskTests(StudioCase):
    def ask(self, port, prompt=QUIZ_PROMPT, tier="default", **kw):
        return request(port, "POST", "/api/ask", {"prompt": prompt, "tier": tier}, **kw)

    def test_streams_text_and_sends_the_right_request(self):
        app, port = self.studio()
        self.fake.script = [{"deltas": [LINE[:40], LINE[40:]]}]
        r, data = self.ask(port, tier="quick")
        self.assertEqual((r.status, r.getheader("Content-Type").split(";")[0]), (200, "application/x-ndjson"))
        events = ndjson(data)
        self.assertEqual("".join(e["x"] for e in events if e["t"] == "d"), LINE)
        self.assertEqual(events[-1]["t"], "end")
        self.assertEqual((events[-1]["stop"], events[-1]["in"], events[-1]["out"]), ("end_turn", 120, 60))
        sent = self.fake.requests[0]
        body = sent["body"]
        self.assertEqual(sent["headers"]["authorization"], "Bearer sk-test-secret-1234", "the SDK sends the server's own key")
        self.assertEqual((body["model"], body["stream"], body["output_config"], body["fallbacks"]), ("claude-opus-5-5", True, {"effort": "low"}, "default"))
        self.assertIn("server-side-fallback-2026-07-01", sent["headers"]["anthropic-beta"])
        self.assertTrue(body["system"].startswith("You write multiple-choice trivia questions"))
        self.assertEqual(body["messages"], [{"role": "user", "content": QUIZ_PROMPT}])
        for removed in ("temperature", "top_p", "top_k", "thinking"):
            self.assertNotIn(removed, body, f"{removed} is not accepted by current models")
        self.assertEqual(app.quiz.budget.snapshot()["used"], 1)

    def test_default_tier_uses_medium_effort(self):
        app, port = self.studio()
        self.ask(port, tier="default")
        self.assertEqual(self.fake.requests[0]["body"]["output_config"], {"effort": "medium"})
        self.ask(port, tier="surprise")
        self.assertEqual(self.fake.requests[1]["body"]["output_config"], {"effort": "medium"})

    def test_model_comes_from_config(self):
        app, port = self.studio(model="claude-haiku-5-5")
        self.ask(port)
        self.assertEqual(self.fake.requests[0]["body"]["model"], "claude-haiku-5-5")

    def test_rejects_requests_that_are_not_question_requests(self):
        app, port = self.studio()
        for bad in ("Tell me a joke", "", "x" * 20000, 12, None):
            r, data = self.ask(port, prompt=bad)
            self.assertEqual(r.status, 400, repr(bad)[:30])
            self.assertEqual(json.loads(data)["code"], "bad_prompt")
        self.assertEqual(self.fake.requests, [], "nothing reached Claude")

    def test_rejects_bad_requests(self):
        app, port = self.studio()
        r, _ = request(port, "POST", "/api/ask", raw="{not json")
        self.assertEqual(r.status, 400)
        r, _ = request(port, "POST", "/api/ask", raw="[1]")
        self.assertEqual(r.status, 400)
        r, _ = request(port, "POST", "/api/ask", raw="x" * 30000)
        self.assertEqual(r.status, 413)
        r, _ = request(port, "POST", "/api/ask", raw="{}", headers={"Content-Type": "text/plain"})
        self.assertEqual(r.status, 415)
        r, _ = self.ask(port, headers={"Origin": "http://evil.example.com"})
        self.assertEqual(r.status, 403)
        r, _ = self.ask(port, headers={"Host": "evil.example.com"})
        self.assertEqual(r.status, 421)
        r, _ = request(port, "OPTIONS", "/api/ask")
        self.assertEqual(r.status, 405)
        self.assertEqual(self.fake.requests, [])

    def test_no_key_is_reported_not_attempted(self):
        app, port = self.studio(api_key=None, fake=None)
        r, data = self.ask(port)
        self.assertEqual((r.status, json.loads(data)["code"]), (503, "no_key"))

    def test_api_errors_become_codes(self):
        app, port = self.studio()
        cases = [
            ({"status": 401, "type": "authentication_error"}, "bad_key"),
            ({"status": 403, "type": "permission_error"}, "bad_key"),
            ({"status": 404, "type": "not_found_error"}, "bad_model"),
            ({"status": 429, "type": "rate_limit_error"}, "rate_limited"),
            ({"status": 529, "type": "overloaded_error"}, "unavailable"),
            ({"status": 500, "type": "api_error"}, "unavailable"),
            ({"status": 400, "type": "invalid_request_error", "message": "Your credit balance is too low to access the Anthropic API."}, "billing"),
        ]
        for step, code in cases:
            self.fake.script = [step]
            r, data = self.ask(port)
            self.assertEqual(r.status, 502, code)
            j = json.loads(data)
            self.assertEqual(j["code"], code)
            self.assertNotIn("sk-test", j["msg"])
            self.assertLess(len(j["msg"]), 120, "short friendly message, not a stack trace")

    def test_unreachable_api_is_a_network_error(self):
        app, port = self.studio()
        self.fake.close()
        r, data = self.ask(port)
        self.assertEqual((r.status, json.loads(data)["code"]), (502, "network"))

    def test_drops_fallbacks_if_the_account_refuses_them(self):
        app, port = self.studio()
        self.fake.script = [{"status": 400, "type": "invalid_request_error", "message": "fallbacks: not enabled for this organization"}]
        r, data = self.ask(port)
        self.assertEqual(r.status, 200)
        self.assertEqual(ndjson(data)[-1]["t"], "end")
        self.assertIn("fallbacks", self.fake.requests[0]["body"])
        self.assertNotIn("fallbacks", self.fake.requests[1]["body"])
        self.assertFalse(app.quiz.use_fallbacks)
        self.ask(port)
        self.assertNotIn("fallbacks", self.fake.requests[2]["body"], "the choice is remembered")

    def test_drops_effort_for_models_without_it(self):
        app, port = self.studio()
        self.fake.script = [{"status": 400, "type": "invalid_request_error", "message": "output_config.effort: not supported for this model"}]
        r, _ = self.ask(port)
        self.assertEqual(r.status, 200)
        self.assertIn("output_config", self.fake.requests[0]["body"])
        self.assertNotIn("output_config", self.fake.requests[1]["body"])

    GENERIC_400 = {"status": 400, "type": "invalid_request_error", "message": "Extra inputs are not permitted"}

    def test_an_unexplained_400_tries_again_without_the_optional_features(self):
        app, port = self.studio()
        self.fake.script = [dict(self.GENERIC_400)]
        r, data = self.ask(port)
        self.assertEqual(r.status, 200)
        self.assertEqual(len(self.fake.requests), 2)
        retry = self.fake.requests[1]["body"]
        self.assertNotIn("fallbacks", retry, "the riskiest feature goes first")
        self.assertIn("output_config", retry)
        self.assertEqual((app.quiz.use_fallbacks, app.quiz.use_effort), (False, True), "remembered because the retry worked")

    def test_keeps_dropping_until_a_plain_request_works(self):
        app, port = self.studio()
        self.fake.script = [dict(self.GENERIC_400), dict(self.GENERIC_400)]
        r, _ = self.ask(port)
        self.assertEqual(r.status, 200)
        plain = self.fake.requests[2]["body"]
        self.assertNotIn("fallbacks", plain)
        self.assertNotIn("output_config", plain)
        self.assertEqual((app.quiz.use_fallbacks, app.quiz.use_effort), (False, False))

    def test_a_request_that_fails_even_when_plain_is_a_real_error_and_changes_nothing(self):
        app, port = self.studio()
        self.fake.script = [dict(self.GENERIC_400)] * 3
        r, data = self.ask(port)
        self.assertEqual((r.status, json.loads(data)["code"]), (502, "bad_request"))
        self.assertEqual(len(self.fake.requests), 3)
        self.assertEqual((app.quiz.use_fallbacks, app.quiz.use_effort), (True, True), "a bad prompt must not switch features off for good")

    def test_a_money_problem_is_not_retried(self):
        app, port = self.studio()
        self.fake.script = [{"status": 400, "type": "invalid_request_error", "message": "Your credit balance is too low to access the Anthropic API."}]
        r, data = self.ask(port)
        self.assertEqual(json.loads(data)["code"], "billing")
        self.assertEqual(len(self.fake.requests), 1)

    def test_other_failures_after_a_detour_do_not_make_it_permanent(self):
        app, port = self.studio()
        self.fake.script = [dict(self.GENERIC_400), {"status": 529, "type": "overloaded_error"}]
        r, data = self.ask(port)
        self.assertEqual(json.loads(data)["code"], "unavailable")
        self.assertEqual((app.quiz.use_fallbacks, app.quiz.use_effort), (True, True))

    def test_error_after_text_started_is_reported_in_the_stream(self):
        app, port = self.studio()
        self.fake.script = [{"deltas": [LINE], "midstream_error": True}]
        r, data = self.ask(port)
        self.assertEqual(r.status, 200)
        events = ndjson(data)
        self.assertEqual(events[0]["t"], "d")
        self.assertEqual((events[-1]["t"], events[-1]["code"]), ("err", "unavailable"))

    def test_refusal_is_reported_after_text(self):
        app, port = self.studio()
        self.fake.script = [{"deltas": [LINE], "stop": "refusal"}]
        r, data = self.ask(port)
        events = ndjson(data)
        self.assertEqual((events[-1]["t"], events[-1]["code"]), ("err", "refused"))

    def test_truncated_reply_is_still_delivered(self):
        app, port = self.studio()
        self.fake.script = [{"deltas": [LINE], "stop": "max_tokens"}]
        events = ndjson(self.ask(port)[1])
        self.assertEqual((events[-1]["t"], events[-1]["stop"]), ("end", "max_tokens"))

    def test_daily_limit_stops_further_calls(self):
        app, port = self.studio(daily_limit=2)
        codes = [self.ask(port)[0].status for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])
        r, data = self.ask(port)
        self.assertEqual(json.loads(data)["code"], "budget")
        self.assertEqual(len(self.fake.requests), 2)

    def test_per_minute_limit(self):
        app, port = self.studio(rate_per_min=2)
        codes = [self.ask(port)[0].status for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])
        self.assertEqual(json.loads(self.ask(port)[1])["code"], "rate_limited")


class TtsTests(StudioCase):
    def tts(self, port, **body):
        return request(port, "POST", "/api/tts", body)

    def test_returns_wav(self):
        voice = FakeVoice()
        app, port = self.studio(voice=voice)
        r, data = self.tts(port, text="Hello there.", voice="af_heart", speed=1.15)
        self.assertEqual((r.status, r.getheader("Content-Type")), (200, "audio/wav"))
        self.assertEqual((data[:4], data[8:12]), (b"RIFF", b"WAVE"))
        self.assertEqual(int(r.getheader("Content-Length")), len(data))
        self.assertEqual(voice.calls, [("Hello there.", "af_heart", 1.15)])

    def test_not_ready_and_bad_input(self):
        voice = FakeVoice()
        voice.state = "downloading"
        app, port = self.studio(voice=voice)
        r, data = self.tts(port, text="Hi")
        self.assertEqual((r.status, json.loads(data)["code"]), (503, "voice_not_ready"))
        voice.state = "ready"
        for bad in ({}, {"text": ""}, {"text": "  "}, {"text": 5}, {"text": "x" * 601}):
            self.assertEqual(self.tts(port, **bad)[0].status, 400, bad)

    def test_speech_has_far_more_room_than_question_requests(self):
        app, port = self.studio(rate_per_min=2)  # questions: 2 a minute, speech: 20 a minute
        codes = [self.tts(port, text=f"Clip {i}.")[0].status for i in range(21)]
        self.assertEqual(codes, [200] * 20 + [429])

    def test_garbled_request_line_gets_an_answer_and_the_server_carries_on(self):
        import socket

        crashes = []
        original = srv.Server.handle_error
        srv.Server.handle_error = lambda self, request, client_address: crashes.append(client_address)
        self.addCleanup(setattr, srv.Server, "handle_error", original)
        app, port = self.studio()
        for junk in (b"NOT A REQUEST\r\n\r\n", b"GET\r\n\r\n", b"\x00\x01\x02\r\n\r\n", b"GET / HTTP/9.9\r\n\r\n"):
            s = socket.create_connection(("127.0.0.1", port), timeout=5)
            s.sendall(junk)
            s.recv(4096)  # an error page, or nothing: either is fine
            s.close()
        r, _ = request(port, "GET", "/healthz")
        self.assertEqual(r.status, 200)
        self.assertEqual(crashes, [], "refusing a garbled request must not raise inside the server")

    def test_garbage_speed_and_voice_are_tolerated(self):
        voice = FakeVoice()
        app, port = self.studio(voice=voice)
        r, _ = self.tts(port, text="Hi", speed="fast", voice=7)
        self.assertEqual(r.status, 200)
        self.assertEqual(voice.calls[0], ("Hi", "af_heart", 1.0))


MODELS = STUDIO / "models"
HAVE_MODEL = all((MODELS / n).exists() for n in srv.MODEL_FILES)


@unittest.skipUnless(HAVE_MODEL, "voice model not downloaded")
class RealVoiceTests(unittest.TestCase):
    """Uses the real Kokoro model (downloaded by the first run, or by the setup check)."""

    @classmethod
    def setUpClass(cls):
        try:
            import kokoro_onnx  # noqa: F401
        except ImportError:
            raise unittest.SkipTest("kokoro-onnx is not installed in this environment")
        cfg = srv.Config(models_dir=MODELS)
        cls.engine = srv.VoiceEngine(cfg, lambda m: None)
        cls.engine.start(wait=True)

    def test_model_files_match_the_pinned_checksums(self):
        for name, meta in srv.MODEL_FILES.items():
            self.assertEqual((MODELS / name).stat().st_size, meta["size"], name)
            self.assertEqual(hashlib.sha256((MODELS / name).read_bytes()).hexdigest(), meta["sha256"], name)

    def test_boots_with_the_whole_catalogue(self):
        self.assertEqual(self.engine.state, self.engine.state and "ready", self.engine.message)
        self.assertEqual([v["id"] for v in self.engine.voices], [v for v, _ in srv.VOICE_CATALOG])
        self.assertEqual(self.engine.status()["voices"][0]["label"], "Heart · American, female")

    def _stats(self, wav):
        import io
        import wave

        import numpy as np

        with wave.open(io.BytesIO(wav)) as w:
            rate = w.getframerate()
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
        return rate, len(pcm) / rate, float(np.sqrt((pcm**2).mean())), float(np.abs(pcm).max())

    def test_speaks_a_question(self):
        wav = self.engine.synth("Which planet is known as the Red Planet?", "af_heart", 1.0)
        rate, seconds, rms, peak = self._stats(wav)
        self.assertEqual(rate, 24000)
        self.assertTrue(1.5 < seconds < 6, seconds)
        self.assertGreater(rms, 0.02, "audible")
        self.assertLess(peak, 1.0)

    def test_slower_speed_is_longer_and_cache_is_used(self):
        a = self._stats(self.engine.synth("The quick brown fox jumps over the lazy dog.", "bf_emma", 0.8))[1]
        b = self._stats(self.engine.synth("The quick brown fox jumps over the lazy dog.", "bf_emma", 1.3))[1]
        self.assertGreater(a, b * 1.3)
        before = len(self.engine._cache)
        self.engine.synth("The quick brown fox jumps over the lazy dog.", "bf_emma", 0.8)
        self.assertEqual(len(self.engine._cache), before)

    def test_unknown_voice_falls_back_to_default(self):
        self.assertGreater(len(self.engine.synth("Hello.", "zz_nobody", 1.0)), 1000)

    def test_not_ready_engine_refuses(self):
        e = srv.VoiceEngine(srv.Config(models_dir=MODELS), lambda m: None)
        with self.assertRaises(srv.VoiceNotReady):
            e.synth("Hi", "af_heart", 1.0)


class DownloadTests(unittest.TestCase):
    def test_bad_checksum_is_rejected_and_not_kept(self):
        with tempfile.TemporaryDirectory() as d:
            payload = b"not the real model" * 10
            httpd = ThreadingHTTPServer(("127.0.0.1", 0), type("H", (BaseHTTPRequestHandler,), {
                "log_message": lambda *a: None,
                "do_GET": lambda self: (self.send_response(200), self.send_header("Content-Length", str(len(payload))), self.end_headers(), self.wfile.write(payload)),
            }))
            threading.Thread(target=httpd.serve_forever, daemon=True).start()
            self.addCleanup(httpd.shutdown)
            self.addCleanup(httpd.server_close)
            old_url, old_files = srv.MODEL_BASE_URL, srv.MODEL_FILES
            srv.MODEL_BASE_URL = f"http://127.0.0.1:{httpd.server_address[1]}/"
            srv.MODEL_FILES = {"m.bin": {"size": len(payload), "sha256": "0" * 64}}
            self.addCleanup(lambda: (setattr(srv, "MODEL_BASE_URL", old_url), setattr(srv, "MODEL_FILES", old_files)))
            engine = srv.VoiceEngine(srv.Config(models_dir=Path(d)), lambda m: None)
            with self.assertRaises(Exception) as ctx:
                engine._download("m.bin", srv.MODEL_FILES["m.bin"], 0, len(payload))
            self.assertIn("checksum", str(ctx.exception))
            self.assertEqual(sorted(p.name for p in Path(d).iterdir()), [], "nothing half-downloaded is left behind")
            srv.MODEL_FILES = {"m.bin": {"size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}}
            engine._download("m.bin", srv.MODEL_FILES["m.bin"], 0, len(payload))
            self.assertEqual((Path(d) / "m.bin").read_bytes(), payload)


if __name__ == "__main__":
    unittest.main()
