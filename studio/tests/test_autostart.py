"""Tests for the start-at-login option (a macOS launchd agent).

launchd itself is never touched: a fake `launchctl` placed first on PATH records what would have been
run and plays back a loaded or an unloaded job. service.sh and autostart.command run for real, with fake
`uv` and `caffeinate` programs that record how they were called.

Run from the studio folder, like test_server.py:
    uv run --no-project --python 3.12 --with "anthropic>=2.3,<3" --with kokoro-onnx python -I -m unittest discover -s tests -v
"""
import contextlib
import importlib.util
import io
import json
import os
import plistlib
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

STUDIO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("wqserver_autostart", STUDIO / "server.py")
srv = importlib.util.module_from_spec(spec)
sys.modules["wqserver_autostart"] = srv  # dataclasses needs the module registered
spec.loader.exec_module(srv)

LABEL = "local.wedgequest.studio.unittest"

# what `launchctl print gui/501/<label>` prints for a running job (trimmed from a real one)
PRINT_RUNNING = f"""gui/501/{LABEL} = {{
\tactive count = 1
\tpath = /Users/sam/Library/LaunchAgents/{LABEL}.plist
\ttype = LaunchAgent
\tstate = running

\tprogram = /bin/bash
\targuments = {{
\t\t/bin/bash
\t\t/Users/sam/WedgeQuest-Studio/service.sh
\t}}

\trunning
\truns = 1
\tpid = 4242
\timmediate reason = speculative
\tlast exit code = (never exited)

\tresource coalition = {{
\t\tID = 1082
\t\ttype = resource
\t\tstate = active
\t}}
}}
"""

FAKE_LAUNCHCTL = r"""#!/bin/bash
echo "$*" >> "$FAKE_STATE/calls"
cmd="$1"; shift
case "$cmd" in
  print)
    case "$1" in
      gui/*/*)
        if [ -f "$FAKE_STATE/loaded" ]; then cat "$FAKE_STATE/print.txt"; exit 0; fi
        echo "Could not find service in domain for user gui: 501" >&2; exit 113 ;;
      gui/*)
        if [ -f "$FAKE_STATE/nogui" ]; then echo "Could not find domain" >&2; exit 113; fi
        echo "gui/501 = {"; echo "}"; exit 0 ;;
    esac ;;
  print-disabled)
    printf '\tdisabled services = {\n'
    if [ -f "$FAKE_STATE/disabled" ]; then printf '\t\t"%s" => disabled\n' "$FAKE_LABEL"; fi
    printf '\t}\n'; exit 0 ;;
  enable) exit 0 ;;
  bootout)
    if [ -f "$FAKE_STATE/loaded" ]; then rm -f "$FAKE_STATE/loaded"; exit 0; fi
    echo "Boot-out failed: 3: No such process" >&2; exit 3 ;;
  bootstrap)
    if [ -f "$FAKE_STATE/bootstrap_fails" ]; then echo "Bootstrap failed: 5: Input/output error" >&2; exit 5; fi
    touch "$FAKE_STATE/loaded"; exit 0 ;;
  kickstart)
    if [ -f "$FAKE_STATE/loaded" ]; then exit 0; fi
    echo "Could not find service" >&2; exit 113 ;;
esac
exit 64
"""

# passes everything on to the real plutil (when there is one), unless a test asks it to fail
FAKE_PLUTIL = r"""#!/bin/bash
if [ -f "$FAKE_STATE/plutil_fails" ]; then echo "$1: Unexpected character" ; exit 1; fi
if [ -x /usr/bin/plutil ]; then exec /usr/bin/plutil "$@"; fi
exit 0
"""

FAKE_UV = r"""#!/bin/bash
echo "$*" >> "$FAKE_STATE/uv.calls"
case "$*" in
  *--version*) exit "$(cat "$FAKE_STATE/probe_exit" 2>/dev/null || echo 0)" ;;
esac
exit "$(cat "$FAKE_STATE/uv_exit" 2>/dev/null || echo 0)"
"""

FAKE_CAFFEINATE = r"""#!/bin/bash
echo "$*" >> "$FAKE_STATE/caffeinate.calls"
"""


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Stub:
    """A tiny stand-in for the running game: answers /healthz and /api/status."""

    def __init__(self, status=None):
        outer = self
        self.status = status or {}

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                if self.path == "/healthz":
                    body = {"ok": True}
                elif self.path == "/api/status":
                    body = outer.status
                else:
                    self.send_error(404)
                    return
                data = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def write_exec(path: Path, text: str):
    path.write_text(text)
    path.chmod(0o755)


class Sandbox(unittest.TestCase):
    """A home folder, a Wedge Quest folder inside it, and fake launchctl / plutil / uv / caffeinate."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name).resolve()
        self.home = self.tmp / "home"
        self.folder = self.home / "WedgeQuest-Studio"
        self.folder.mkdir(parents=True)
        (self.folder / "service.sh").write_text((STUDIO / "service.sh").read_text())
        self.agents = self.home / "Library" / "LaunchAgents"
        self.state = self.tmp / "state"
        self.state.mkdir()
        (self.state / "print.txt").write_text(PRINT_RUNNING)
        bindir = self.tmp / "bin"
        bindir.mkdir()
        for name, text in (("launchctl", FAKE_LAUNCHCTL), ("plutil", FAKE_PLUTIL), ("uv", FAKE_UV), ("caffeinate", FAKE_CAFFEINATE)):
            write_exec(bindir / name, text)
        self.bindir = bindir
        patcher = mock.patch.dict(os.environ, {"PATH": f"{bindir}:{os.environ['PATH']}", "FAKE_STATE": str(self.state), "FAKE_LABEL": LABEL})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.stubs = []
        self.addCleanup(lambda: [s.close() for s in self.stubs])
        self.lines = []

    def stub(self, status=None):
        s = Stub(status)
        self.stubs.append(s)
        return s

    def item(self, port=None, folder=None, **cfg):
        item = srv.LoginItem(srv.Config(port=port or free_port(), **cfg), folder=folder or self.folder, say=self.lines.append, home=self.home, label=LABEL, agents_dir=self.agents)
        item.wait_seconds, item.poll, item.retry_wait = 0.4, 0.05, 0
        return item

    def said(self):
        return "\n".join(self.lines)

    def calls(self):
        try:
            return (self.state / "calls").read_text().splitlines()
        except OSError:
            return []

    def flag(self, name, on=True):
        (self.state / name).touch() if on else (self.state / name).unlink(missing_ok=True)


class PlistTests(Sandbox):
    def test_the_plist_asks_launchd_for_what_the_game_needs(self):
        item = self.item()
        p = item.build_plist()
        self.assertEqual(p["Label"], LABEL)
        self.assertEqual(p["ProgramArguments"], ["/bin/bash", str(self.folder / "service.sh")])
        self.assertEqual(p["WorkingDirectory"], str(self.folder))
        self.assertIs(p["RunAtLoad"], True)
        self.assertEqual(p["KeepAlive"], {"SuccessfulExit": False})  # restart after a crash, not after a clean stop
        env = p["EnvironmentVariables"]
        self.assertEqual((env["WQ_SERVICE"], env["WQ_ALLOW_SLEEP"]), ("1", "0"))
        self.assertTrue(env["WQ_LOG_FILE"].endswith("server.log"))
        self.assertIn("/opt/homebrew/bin", env["PATH"])
        self.assertEqual(item.build_plist(allow_sleep=True)["EnvironmentVariables"]["WQ_ALLOW_SLEEP"], "1")
        self.assertNotIn("ANTHROPIC_API_KEY", json.dumps(p))  # the key lives in .env, never in the plist

    def test_odd_folder_names_survive_the_trip_through_xml(self):
        odd = self.home / 'Wedge & "Quest" <é> 1'
        odd.mkdir()
        (odd / "service.sh").write_text("#!/bin/bash\n")
        item = self.item(folder=odd)
        self.assertIsNone(item._write_plist(False))
        written = plistlib.loads(item.plist_path.read_bytes())
        self.assertEqual(written["ProgramArguments"][1], str(odd / "service.sh"))
        self.assertEqual(written["WorkingDirectory"], str(odd))
        self.assertEqual(oct(item.plist_path.stat().st_mode & 0o777), "0o644")
        self.assertFalse(list(self.agents.glob("*.tmp")))

    @unittest.skipUnless(os.path.exists("/usr/bin/plutil"), "plutil is part of macOS")
    def test_the_real_plutil_accepts_the_plist(self):
        item = self.item()
        item._write_plist(False)
        out = subprocess.run(["/usr/bin/plutil", "-lint", str(item.plist_path)], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)


class GuardedPlaceTests(unittest.TestCase):
    def test_places_macos_may_block(self):
        home = Path("/Users/sam")
        cases = {
            "/Users/sam/Documents/WedgeQuest": "your Documents folder",
            "/Users/sam/Documents": "your Documents folder",
            "/Users/sam/Desktop/a/b": "your Desktop",
            "/Users/sam/Downloads/WedgeQuest-Studio": "your Downloads folder",
            "/Users/sam/Library/Mobile Documents/com~apple~CloudDocs/WQ": "iCloud Drive",
            "/Volumes/Games/WQ": "an external or network drive",
        }
        for folder, words in cases.items():
            self.assertEqual(srv.guarded_place(Path(folder), home), words, folder)

    def test_harmless_places(self):
        home = Path("/Users/sam")
        for folder in ("/Users/sam/WedgeQuest-Studio", "/Users/sam/Documents-old/WQ", "/Users/sam/Library/Application Support/WQ", "/Applications/WQ", "/opt/wq"):
            self.assertIsNone(srv.guarded_place(Path(folder), home), folder)


class InstallTests(Sandbox):
    def up(self):
        """Pretend nothing else holds the port and the game answers once it is started."""
        stub = self.stub()
        item = self.item(port=stub.port)
        item.port_busy = lambda: False
        return item

    def test_install_writes_the_plist_loads_it_and_waits_for_the_game(self):
        item = self.up()
        self.assertEqual(item.install(), 0, self.said())
        self.assertEqual(oct(item.plist_path.stat().st_mode & 0o777), "0o644")
        uid = os.getuid()
        calls = self.calls()
        self.assertIn(f"enable gui/{uid}/{LABEL}", calls)
        self.assertIn(f"bootstrap gui/{uid} {item.plist_path}", calls)
        self.assertLess(calls.index(f"enable gui/{uid}/{LABEL}"), calls.index(f"bootstrap gui/{uid} {item.plist_path}"))
        self.assertFalse([c for c in calls if c.startswith("bootout")])  # nothing earlier to replace
        said = self.said()
        self.assertIn("Done.", said)
        self.assertIn(f"http://localhost:{item.cfg.port}", said)
        self.assertIn(".local:", said)  # the address another Mac, an iPad or a phone can use
        self.assertIn("server.log", said)

    def test_install_over_an_earlier_setup_unloads_it_first(self):
        item = self.up()
        item._write_plist(False)
        self.flag("loaded")
        self.assertEqual(item.install(), 0, self.said())
        calls = self.calls()
        boot_out = next(i for i, c in enumerate(calls) if c.startswith("bootout"))
        boot_in = next(i for i, c in enumerate(calls) if c.startswith("bootstrap"))
        self.assertLess(boot_out, boot_in)

    def test_install_keeps_the_mac_awake_unless_told_otherwise(self):
        item = self.up()
        item.install(allow_sleep=True)
        self.assertEqual(plistlib.loads(item.plist_path.read_bytes())["EnvironmentVariables"]["WQ_ALLOW_SLEEP"], "1")
        self.assertNotIn("will not fall asleep", self.said())

    def test_install_refuses_a_folder_macos_may_block_unless_forced(self):
        guarded = self.home / "Documents" / "WedgeQuest-Studio"
        guarded.mkdir(parents=True)
        (guarded / "service.sh").write_text("#!/bin/bash\n")
        item = self.up()
        item.folder = guarded.resolve()
        self.assertEqual(item.install(), 1)
        self.assertIn("Documents folder", self.said())
        self.assertIn("--force", self.said())
        self.assertFalse(item.plist_path.exists())
        self.assertEqual(self.calls(), [])
        self.lines.clear()
        self.assertEqual(item.install(force=True), 0, self.said())
        self.assertTrue(item.plist_path.exists())

    def test_install_notices_a_missing_service_script(self):
        item = self.up()
        (self.folder / "service.sh").unlink()
        self.assertEqual(item.install(), 1)
        self.assertIn("service.sh is missing", self.said())
        self.assertFalse(item.plist_path.exists())

    def test_install_stops_when_something_already_holds_the_port(self):
        with socket.socket() as busy:
            busy.bind(("127.0.0.1", 0))
            busy.listen()
            item = self.item(port=busy.getsockname()[1])
            self.assertTrue(item.port_busy())
            self.assertEqual(item.install(), 1)
        self.assertIn("already in use", self.said())
        self.assertIn("Control-C", self.said())
        self.assertFalse(item.plist_path.exists())
        self.assertFalse([c for c in self.calls() if c.startswith("bootstrap")])

    def test_a_free_port_is_not_busy(self):
        self.assertFalse(self.item().port_busy())

    def test_install_with_nobody_at_the_screen_saves_the_plist_for_next_login(self):
        self.flag("nogui")
        item = self.up()
        self.assertEqual(item.install(), 0)
        self.assertTrue(item.plist_path.exists())
        self.assertIn("next time someone logs in", self.said())
        self.assertFalse([c for c in self.calls() if c.startswith("bootstrap")])

    def test_install_passes_on_why_launchctl_said_no(self):
        self.flag("bootstrap_fails")
        item = self.up()
        self.assertEqual(item.install(), 1)
        self.assertIn("Input/output error", self.said())
        self.assertIn("should start at your next login", self.said())
        self.assertEqual(len([c for c in self.calls() if c.startswith("bootstrap")]), 8)  # launchd can be slow to let go, so it retries

    def test_install_rejects_a_plist_that_plutil_does_not_like(self):
        self.flag("plutil_fails")
        item = self.up()
        self.assertEqual(item.install(), 1)
        self.assertIn("did not accept", self.said())
        self.assertFalse(item.plist_path.exists())
        self.assertFalse(list(self.agents.glob("*.tmp")))

    def test_install_shows_the_log_when_the_game_never_answers(self):
        item = self.item()  # nothing is listening on its port
        item.log_dir.mkdir(parents=True)
        item.log_file.write_text("starting\nTraceback (most recent call last):\nModuleNotFoundError: no module named anthropic\n")
        self.assertEqual(item.install(), 1)
        said = self.said()
        self.assertIn("has not answered", said)
        self.assertIn("| ModuleNotFoundError", said)
        self.assertTrue(item.plist_path.exists())  # still set up: the first start can be slow

    def test_install_creates_the_launch_agents_folder_when_missing(self):
        self.assertFalse(self.agents.exists())
        item = self.up()
        self.assertEqual(item.install(), 0)
        self.assertTrue(self.agents.is_dir())


class OtherCommandTests(Sandbox):
    def set_up(self, **kw):
        stub = self.stub(kw.get("status"))
        item = self.item(port=stub.port)
        item._write_plist(kw.get("allow_sleep", False))
        return item

    def test_remove_unloads_and_deletes_the_plist(self):
        item = self.set_up()
        self.flag("loaded")
        self.assertEqual(item.remove(), 0)
        self.assertFalse(item.plist_path.exists())
        self.assertFalse((self.state / "loaded").exists())
        self.assertIn("no longer start by itself", self.said())

    def test_remove_when_never_set_up_is_fine(self):
        item = self.item()
        self.assertEqual(item.remove(), 0)
        self.assertIn("nothing to remove", self.said())

    def test_stop_unloads_but_keeps_the_plist(self):
        item = self.set_up()
        self.flag("loaded")
        self.assertEqual(item.stop(), 0)
        self.assertTrue(item.plist_path.exists())
        self.assertFalse((self.state / "loaded").exists())
        self.assertIn("next time you log in", self.said())

    def test_stop_when_not_running(self):
        item = self.set_up()
        self.assertEqual(item.stop(), 0)
        self.assertIn("not running", self.said())

    def test_restart_kicks_a_running_job(self):
        item = self.set_up()
        self.flag("loaded")
        self.assertEqual(item.restart(), 0, self.said())
        self.assertIn(f"kickstart -k gui/{os.getuid()}/{LABEL}", self.calls())

    def test_restart_loads_a_job_that_was_stopped(self):
        item = self.set_up()
        self.assertEqual(item.restart(), 0, self.said())
        self.assertTrue([c for c in self.calls() if c.startswith("bootstrap")])

    def test_restart_needs_a_setup(self):
        item = self.item()
        self.assertEqual(item.restart(), 1)
        self.assertIn("install", self.said())

    def test_restart_with_nobody_at_the_screen(self):
        item = self.set_up()
        self.flag("nogui")
        self.assertEqual(item.restart(), 1)
        self.assertIn("nowhere to start it", self.said())


class StatusTests(Sandbox):
    STATUS = {"ai": {"enabled": True, "model": "claude-opus-5-5"}, "tts": {"state": "ready", "voices": [{}, {}, {}]}}

    def test_not_set_up(self):
        item = self.item()
        self.assertEqual(item.status(), 1)
        self.assertIn("Set up           no", self.said())
        self.assertIn("./autostart.command install", self.said())

    def test_running(self):
        stub = self.stub(self.STATUS)
        item = self.item(port=stub.port)
        item._write_plist(False)
        self.flag("loaded")
        self.assertEqual(item.status(), 0)
        said = self.said()
        self.assertIn("Running now      yes (process 4242)", said)
        self.assertIn("Questions        Claude, claude-opus-5-5", said)
        self.assertIn("Voice            ready (Kokoro, 3 voices)", said)
        self.assertIn("Keeps Mac awake  yes", said)
        self.assertIn(f"http://localhost:{stub.port}", said)

    def test_running_without_a_key_and_with_sleep_allowed(self):
        stub = self.stub({"ai": {"enabled": False}, "tts": {"state": "downloading", "progress": 0.42}})
        item = self.item(port=stub.port)
        item._write_plist(True)
        self.flag("loaded")
        item.status()
        said = self.said()
        self.assertIn("built-in pack (no API key in .env)", said)
        self.assertIn("downloading the voice model, 42%", said)
        self.assertIn("Keeps Mac awake  no", said)

    def test_set_up_but_not_started(self):
        item = self.item()
        item._write_plist(False)
        self.assertEqual(item.status(), 1)
        self.assertIn("It starts at your next login", self.said())

    def test_started_but_not_answering_shows_the_end_of_the_log(self):
        item = self.item()
        item._write_plist(False)
        item.log_file.write_text("one\ntwo\nCould not find uv\n")
        self.flag("loaded")
        self.assertEqual(item.status(), 1)
        self.assertIn("not answering yet (running)", self.said())
        self.assertIn("| Could not find uv", self.said())

    def test_switched_off_in_system_settings(self):
        item = self.item()
        item._write_plist(False)
        self.flag("disabled")
        item.status()
        self.assertIn("switched off", self.said())

    def test_launchd_output_is_read_correctly(self):
        item = self.item()
        self.flag("loaded")
        self.assertEqual(item.job(), {"state": "running", "pid": 4242, "last_exit": "(never exited)"})  # not the "state = active" further down
        self.flag("loaded", False)
        self.assertIsNone(item.job())

    def test_voice_wording(self):
        self.assertEqual(srv.voice_words({"state": "off"}), "off (each device uses its own voices)")
        self.assertEqual(srv.voice_words({"state": "loading"}), "loading")
        self.assertEqual(srv.voice_words({"state": "error", "message": "disk full"}), "unavailable: disk full")
        self.assertEqual(srv.voice_words({}), "unknown")


class MenuTests(Sandbox):
    def run_menu(self, item, *answers, interactive=True):
        feed = iter(answers)

        def ask(prompt):
            self.lines.append(prompt.strip())
            try:
                return next(feed)
            except StopIteration:
                raise EOFError

        return item.menu(ask=ask, interactive=interactive)

    def test_when_not_set_up_it_offers_to_set_up(self):
        item = self.item()
        item.install = lambda **kw: self.lines.append("INSTALL CALLED") or 0
        self.run_menu(item, "1", "")
        self.assertIn("Set it up", self.said())
        self.assertIn("INSTALL CALLED", self.said())

    def test_when_set_up_it_offers_restart_stop_and_remove(self):
        item = self.item()
        item._write_plist(False)
        item.remove = lambda: self.lines.append("REMOVE CALLED") or 0
        self.run_menu(item, "3", "")
        said = self.said()
        for words in ("Restart it now", "Stop it for now", "Remove it"):
            self.assertIn(words, said)
        self.assertIn("REMOVE CALLED", said)

    def test_return_alone_changes_nothing(self):
        item = self.item()
        item.install = lambda **kw: self.fail("must not install")
        self.assertEqual(self.run_menu(item, ""), 0)
        self.assertFalse([c for c in self.calls() if c.startswith(("bootstrap", "bootout"))])

    def test_nonsense_changes_nothing(self):
        item = self.item()
        item.install = lambda **kw: self.fail("must not install")
        self.run_menu(item, "banana", "")

    def test_without_a_terminal_it_only_shows_the_status(self):
        item = self.item()
        item.install = lambda **kw: self.fail("must not install")
        self.assertEqual(self.run_menu(item, interactive=False), 0)
        self.assertNotIn("What would you like to do?", self.said())


class CommandLineTests(Sandbox):
    def main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        env = {"WQ_LOGIN_LABEL": LABEL, "WQ_LAUNCH_AGENTS_DIR": str(self.agents)}
        with mock.patch.dict(os.environ, env), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = srv.main(list(argv))
            except SystemExit as exc:
                code = exc.code
        return code, out.getvalue(), err.getvalue()

    def test_status_through_main(self):
        with mock.patch.object(sys, "platform", "darwin"):
            code, out, _ = self.main("--autostart", "status")
        self.assertEqual(code, 1)
        self.assertIn("Set up           no", out)

    def test_other_systems_are_told_it_is_for_macs(self):
        with mock.patch.object(sys, "platform", "linux"):
            code, out, _ = self.main("--autostart", "status")
        self.assertEqual(code, 1)
        self.assertIn("only works on a Mac", out)

    def test_port_and_local_belong_in_dotenv_for_the_login_item(self):
        for flags in (["--port", "9000"], ["--local"]):
            code, _, err = self.main("--autostart", "status", *flags)
            self.assertEqual(code, 2)
            self.assertIn("WQ_PORT", err)

    def test_install_only_flags_need_install(self):
        for argv in (["--force"], ["--allow-sleep"], ["--autostart", "status", "--force"]):
            code, _, err = self.main(*argv)
            self.assertEqual(code, 2, argv)
            self.assertIn("--autostart install", err)

    def test_version(self):
        code, out, _ = self.main("--version")
        self.assertEqual(code, 0)
        self.assertIn(srv.VERSION, out)

    def test_an_unknown_action_is_refused(self):
        code, _, err = self.main("--autostart", "explode")
        self.assertEqual(code, 2)


class AddressTests(unittest.TestCase):
    def test_bonjour_name_asks_macos_first(self):
        done = subprocess.CompletedProcess([], 0, "Sams-Mac-Studio\n", "")
        with mock.patch.object(sys, "platform", "darwin"), mock.patch.object(srv.subprocess, "run", return_value=done) as run:
            self.assertEqual(srv.bonjour_name(), "Sams-Mac-Studio.local")
        self.assertEqual(run.call_args[0][0], ["scutil", "--get", "LocalHostName"])

    def test_bonjour_name_falls_back_to_the_host_name(self):
        for host, want in (("studio.fritz.box", "studio.local"), ("Studio.local", "Studio.local"), ("studio", "studio.local")):
            with mock.patch.object(sys, "platform", "darwin"), mock.patch.object(srv.subprocess, "run", side_effect=OSError), mock.patch.object(srv.socket, "gethostname", return_value=host):
                self.assertEqual(srv.bonjour_name(), want, host)

    def test_a_local_only_server_shows_no_network_addresses(self):
        cfg = srv.Config(host="127.0.0.1", port=8777)
        self.assertEqual(srv.network_urls(cfg), [])
        self.assertEqual(srv.address_lines(cfg), ["  On this computer   http://localhost:8777"])

    def test_the_network_addresses_use_the_same_port(self):
        cfg = srv.Config(port=8123)
        with mock.patch.object(srv, "lan_addresses", return_value=["192.168.1.20"]), mock.patch.object(srv, "bonjour_name", return_value="studio.local"):
            self.assertEqual(srv.address_lines(cfg), [
                "  On this computer   http://localhost:8123",
                "  On your network    http://192.168.1.20:8123",
                "                     http://studio.local:8123",
            ])

    def test_the_banner_says_how_it_was_started(self):
        cfg = srv.Config(port=8123)
        app = srv.App(cfg, lambda msg: None)
        with mock.patch.object(srv, "lan_addresses", return_value=["192.168.1.20"]), mock.patch.object(srv, "bonjour_name", return_value="studio.local"):
            by_hand = srv.banner(cfg, app)
            with mock.patch.dict(os.environ, {"WQ_SERVICE": "1"}):
                at_login = srv.banner(cfg, app)
        self.assertIn("Press Ctrl+C to stop.", by_hand)
        self.assertIn("http://studio.local:8123", by_hand)
        self.assertNotIn("Ctrl+C", at_login)
        self.assertIn("./autostart.command stop", at_login)


class ScriptTests(Sandbox):
    """service.sh and autostart.command, run for real with fake uv and caffeinate."""

    def run_script(self, script: Path, *args, env=None, cwd=None):
        full = {
            "PATH": f"{self.bindir}:/usr/bin:/bin",
            "HOME": str(self.home),
            "FAKE_STATE": str(self.state),
            "WQ_LOG_FILE": str(self.tmp / "logs" / "server.log"),
        }
        full.update(env or {})
        return subprocess.run(["/bin/bash", str(script), *args], env=full, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)

    def read(self, name):
        try:
            return (self.state / name).read_text().splitlines()
        except OSError:
            return []

    def wait_for(self, name, seconds=5):
        end = time.time() + seconds
        while time.time() < end:
            if self.read(name):
                return self.read(name)
            time.sleep(0.05)
        return []

    def log(self):
        return (self.tmp / "logs" / "server.log").read_text()

    def test_the_scripts_are_valid_bash(self):
        for name in ("start.command", "service.sh", "autostart.command"):
            out = subprocess.run(["/bin/bash", "-n", str(STUDIO / name)], capture_output=True, text=True)
            self.assertEqual(out.returncode, 0, f"{name}: {out.stderr}")

    def test_the_scripts_are_executable(self):
        for name in ("start.command", "service.sh", "autostart.command", "server.py"):
            self.assertTrue(os.access(STUDIO / name, os.X_OK), name)

    def test_service_prefers_what_is_installed_already(self):
        out = self.run_script(self.folder / "service.sh")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(self.read("uv.calls"), ["run --offline --script server.py --version", "run --offline --script server.py"])
        self.assertIn("starting at login", self.log())

    def test_service_goes_online_when_nothing_is_installed_yet(self):
        (self.state / "probe_exit").write_text("2")
        self.run_script(self.folder / "service.sh")
        self.assertEqual(self.read("uv.calls"), ["run --offline --script server.py --version", "run --script server.py"])

    def test_service_hands_uvs_exit_code_to_launchd(self):
        (self.state / "uv_exit").write_text("7")
        self.assertEqual(self.run_script(self.folder / "service.sh").returncode, 7)

    def test_service_keeps_the_mac_awake_while_it_runs(self):
        self.run_script(self.folder / "service.sh")
        calls = self.wait_for("caffeinate.calls")
        self.assertEqual(len(calls), 1)
        flags = calls[0].split()
        self.assertEqual(flags[:2], ["-i", "-w"])
        self.assertTrue(flags[2].isdigit())  # it waits on the process that becomes the server

    def test_service_lets_the_mac_sleep_when_asked(self):
        self.run_script(self.folder / "service.sh", env={"WQ_ALLOW_SLEEP": "1"})
        time.sleep(0.5)
        self.assertEqual(self.read("caffeinate.calls"), [])
        self.assertEqual(len(self.read("uv.calls")), 2)

    def test_service_keeps_the_log_small(self):
        log = self.tmp / "logs" / "server.log"
        log.parent.mkdir()
        log.write_bytes(b"x" * (3 * 1024 * 1024))
        self.run_script(self.folder / "service.sh")
        self.assertEqual((self.tmp / "logs" / "server.log.1").stat().st_size, 3 * 1024 * 1024)
        self.assertLess(log.stat().st_size, 1024)

    def test_service_appends_to_a_small_log(self):
        log = self.tmp / "logs" / "server.log"
        log.parent.mkdir()
        log.write_text("earlier run\n")
        self.run_script(self.folder / "service.sh")
        self.assertTrue(self.log().startswith("earlier run\n"))
        self.assertFalse((self.tmp / "logs" / "server.log.1").exists())

    def test_service_works_from_a_folder_with_spaces_and_symbols(self):
        odd = self.home / "Wedge Quest & Co"
        odd.mkdir()
        (odd / "service.sh").write_text((STUDIO / "service.sh").read_text())
        out = self.run_script(odd / "service.sh", cwd="/")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(len(self.read("uv.calls")), 2)

    def test_autostart_command_passes_its_words_to_the_server(self):
        out = self.run_script(STUDIO / "autostart.command", "install", "--allow-sleep")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(self.read("uv.calls"), ["run --script server.py --autostart install --allow-sleep"])

    def test_autostart_command_without_words_shows_the_menu(self):
        self.run_script(STUDIO / "autostart.command")
        self.assertEqual(self.read("uv.calls"), ["run --script server.py --autostart menu"])

    def test_autostart_command_keeps_the_exit_code(self):
        (self.state / "uv_exit").write_text("3")
        self.assertEqual(self.run_script(STUDIO / "autostart.command", "status").returncode, 3)

    def test_autostart_command_explains_when_uv_is_missing(self):
        # a copy that looks for uv only where this sandbox has none: not on PATH, not under the fake HOME
        text = (STUDIO / "autostart.command").read_text()
        for place in ("/opt/homebrew/bin/uv", "/usr/local/bin/uv"):
            text = text.replace(place, "/nonexistent/uv")
        script = self.folder / "autostart.command"
        script.write_text(text)
        out = self.run_script(script, "status", env={"PATH": "/usr/bin:/bin"})
        self.assertEqual(out.returncode, 1)
        self.assertIn("brew install uv", out.stdout)
        self.assertEqual(self.read("uv.calls"), [])


if __name__ == "__main__":
    unittest.main()
