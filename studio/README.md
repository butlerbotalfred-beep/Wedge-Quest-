# Wedge Quest Studio

The home-server edition of Wedge Quest. The same game, served from your Mac to every device on your
network, with two upgrades:

- **A studio voice.** Questions are read aloud by a voice model that runs on your Mac (Kokoro, 12
  voices). Nothing is sent to the internet to make it speak.
- **Claude-written questions, with your own key.** Claude writes each question for the age of the player
  answering it. The API key stays on your Mac and never reaches the browser. With no key set, the game
  uses its built-in question pack, so it always works.

## Start it

1. **Once:** install `uv`, a small free tool that sets up Python for you. In Terminal run one of these:

   ```bash
   brew install uv
   ```
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. **Double-click `start.command`.** The first start takes a few minutes: it fetches the Python packages
   (a few dozen MB) and the voice model (about 350 MB, from the Kokoro project's GitHub release, checked
   against a checksum). That happens once; later starts take a few seconds. The game opens on this Mac.

3. **On an iPad, phone or another Mac** (the Mac mini in the living room, say) on the same Wi-Fi or
   Ethernet, open the address the Terminal window shows under *On your network* (for example
   `http://192.168.1.20:8777`, or the `.local` name). Use the same address every time on a given
   device, because each address keeps its own saved settings and games. On an iPad, *Share, Add to Home
   Screen* makes it open full screen like an app. The voice is made on this Mac and plays on the device
   you are playing on.

Stop it with `Ctrl+C` in the Terminal window.

If macOS says it cannot verify `start.command` (or `autostart.command`), right-click it and choose *Open*
the first time. If it asks whether Python may accept incoming connections, choose *Allow*, or the iPads
cannot reach it.

## Start by itself at login

So that nobody has to open Terminal after a restart, the Mac can start the game whenever you log in:

1. Keep this folder in your **home folder** (or anywhere except Desktop, Documents, Downloads and iCloud
   Drive). macOS keeps programs that start by themselves out of those, and the setup says so if you try.
2. **Double-click `autostart.command`** and choose *Set it up*. Or, in Terminal: `./autostart.command install`.

That is all. It is running as soon as the setup finishes, it starts again at every login, and macOS starts
it again by itself if it ever crashes. The first start takes a few minutes while the voice model downloads
(`status` shows how far it is). While it runs, the Mac will not fall asleep on its own, so the iPads can
reach it; the screen can still turn off. If you would rather let the Mac sleep, run
`./autostart.command install --allow-sleep`.

| To do this | Run |
| --- | --- |
| See whether it is running, and the addresses to open | `./autostart.command status` |
| Restart it, for example after changing `.env` | `./autostart.command restart` |
| Stop it until the next login (to start it by hand, say) | `./autostart.command stop` |
| Never start it at login again | `./autostart.command remove` |

Good to know:

- **It starts when you log in**, not when the Mac switches on. For a Mac Studio that nobody sits at, turn on
  automatic login (System Settings, Users & Groups). macOS does not offer that while FileVault is on.
- It reads its settings from `.env` only. A key you exported in your shell profile (`.zshrc`) is not seen
  by it. To make the game answer only this Mac, put `WQ_HOST=127.0.0.1` in `.env`.
- It starts even with the internet down, because the packages are already on the Mac. Claude-written
  questions then wait: the game uses the built-in pack until the internet is back.
- Everything it prints goes to `~/Library/Logs/WedgeQuestStudio/server.log` (trimmed at every start).
- macOS may say a background item was added. That is this. You can switch it off in System Settings,
  General, Login Items.
- If you move this folder, or install a newer copy of it, run `./autostart.command install` again.

## Claude-written questions

1. Copy `.env.example` to `.env` (same folder) and paste your key after `ANTHROPIC_API_KEY=`.
   Make a key at <https://console.anthropic.com> (Settings, API keys). An API key is separate from a Claude
   chat subscription and is billed by use. Keep the file private: `chmod 600 .env`.
2. Restart the server. The top bar of the game shows *AI Quizmaster* when Claude is writing, and
   *Built-in questions* when it is not (hover it to see why).
3. To test your setup without playing, run `./start.command --check`. It asks Claude for one word and
   speaks one sentence.

**What is sent to Claude:** only each player's age and difficulty level, the topic names, and a short list
of questions already asked so it does not repeat itself. Player names are never sent.

**What it costs.** The model is `claude-opus-5-5` unless you set `WQ_MODEL`. Expect roughly 2 to 10 cents
for a batch of about a dozen questions on that model (an estimate from the token prices, $4 in and $20 out
per million), and a game needs a batch for each age group and each refill. The Terminal window prints what
every batch actually cost, so you can see it for yourself. For much lower cost, set
`WQ_MODEL=claude-haiku-5-5` (or `claude-sonnet-5-5`). `WQ_DAILY_LIMIT` (default 300 requests) stops a
mistake from running up a bill. If the key is wrong, the account is out of credit or the limit is reached,
the game says so in the top bar and carries on with the built-in questions.

## The voice

The studio voice is **Kokoro** running on your Mac. It starts on its own; until it is ready (the first time
it is still downloading) each device reads with its own voice. In the game menu (the three lines, top
right) you can pick another voice, change the speed and press *Try it*. The device's own voices are still
listed at the bottom of the picker.

By default the game reads questions aloud only for young players (age 7 and under). To have the host read
every question, set **Read questions aloud** to *Always* on the setup screen or in the menu.

On an Apple M3 laptop the voice made speech about twice as fast as it plays, and the game fetches the audio
for a question while the pawn is still hopping, so it normally starts at once. A Mac Studio should be
faster. If you ever want to turn the studio voice off, set `WQ_VOICE_ENGINE=off`.

## Settings

Everything is optional and goes in `.env` (see `.env.example`):

| Setting | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Turns on Claude-written questions. |
| `WQ_MODEL` | `claude-opus-5-5` | Which Claude model writes the questions. |
| `WQ_DAILY_LIMIT` | `300` | Most question requests per day. |
| `WQ_VOICE` | `af_heart` | Default studio voice. Others: `af_bella af_nicole af_sarah af_aoede af_kore am_michael am_fenrir am_puck bf_emma bm_george bm_fable`. |
| `WQ_VOICE_ENGINE` | `kokoro` | `off` uses only each device's own voices. |
| `WQ_PORT` | `8777` | The port the game is served on. |
| `WQ_HOST` | every device on your network | `127.0.0.1` makes the game answer only this Mac. |
| `WQ_ALLOWED_HOSTS` | none | Extra host names the server should answer to (see Safety). |

Options for `start.command`: `--local` (only this Mac can connect), `--port 8778`, `--check`.

## Safety

This is meant for your home network. There is no login, so do not make the port reachable from the
internet. The server only answers requests addressed to local names (an IP address, `localhost`, a `.local`
name or a single-word name), which blocks web pages that try to reach it from outside, and it limits how
often Claude and the voice can be called. The game folder is the only thing it serves, never `.env` or
`models/`. Started at login it is reachable around the clock by everyone on your Wi-Fi, so keep
`WQ_DAILY_LIMIT` in place and consider a monthly spend limit on your Anthropic account.

## If something is off

| What you see | What to try |
| --- | --- |
| *Port 8777 in use* | The server is already running, probably the login item (open `http://localhost:8777`). To run it by hand instead, `./autostart.command stop` first, or use `--port 8778`. |
| An iPad or another Mac cannot connect | Same Wi-Fi or Ethernet as the Mac, not a guest network? Is the Mac awake? Try the numeric address. Allow incoming connections for Python when macOS asks, and on another Mac allow its browser to find devices on the local network if it asks. |
| It did not start after a restart | It starts when you log in, so log in (or turn on automatic login). Then `./autostart.command status`; the log it names says why. |
| *This folder is in your Documents folder* (or Desktop, Downloads, iCloud Drive) | Move the whole folder to your home folder and run `./autostart.command install` from there. |
| The login item stopped working after an update | Run `./autostart.command install` again; it replaces the old set-up. |
| No sound on an iPhone | Check the silent switch, and tap the screen once before the first question. |
| Top bar says *Built-in questions* | Hover it for the reason. Usually the key is missing or wrong: run `./start.command --check`. |
| The picker shows no studio voices | Look at the Terminal window: the voice may still be downloading or loading. |
| Start over with the voice | Delete the `models` folder; the next start downloads it again. |

## What is in this folder

| Path | What it is |
| --- | --- |
| `start.command` | Double-click to start. |
| `autostart.command` | Double-click to set up (or take away) starting at login. |
| `service.sh` | What macOS runs at login. Not for double-clicking. |
| `server.py` | The server: serves the game, speaks, asks Claude. One file, readable top to bottom. |
| `www/` | The game, with its own copy of three.js and the fonts, so it works with no internet. |
| `.env.example` | Settings template. Copy to `.env`. |
| `models/` | The voice model, created on the first start. |
| `tests/` | Server tests, and `fake_claude.py`, a stand-in for Claude for trying things with no key. |
| `vendor.lock.json` | Checksums of the third-party files in `www/`. |

## Licences

three.js is MIT. The fonts Baloo 2 and Fredoka are under the SIL Open Font License. The Kokoro voice model
is Apache 2.0 and `kokoro-onnx` is MIT; they use `espeak-ng` (GPL 3) for pronunciation, installed as a
Python package and not modified. The game itself is yours to use and change.
