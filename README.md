# Wedge Quest

A family trivia board game with a glossy, slightly tilted 3D board in a night-forest diorama.
Players roll a die, walk around a wheel of candy-colored spaces, answer a question in the topic of
the space they land on and win a wedge for each topic. Collect every wedge, reach the hub and
answer one last question to win. Questions are written by Claude for the age of the player
answering them, and can be read aloud.

## Layout

| Path | What it does |
| --- | --- |
| `src/layout.js` | Board geometry for 3 to 8 wedges and the movement rules (exact roll, no turning back, the hub can be crossed but only stopped on with every wedge). Pure functions. |
| `src/questions.js` | The Quizmaster: builds the prompt, streams questions from Claude, keeps a deck per age band and topic, adapts difficulty, falls back to the bank on any failure. |
| `src/bank.js` | Built-in questions (10 subjects, three age tiers) used when the AI is unavailable. |
| `src/voice.js` | Read-aloud: ranks the device's voices (Natural, Premium, Enhanced first), cleans text for speech, reads in chunks with pauses. |
| `src/textures.js` | Canvas textures: embossed tile icons, the floor, soft glows. |
| `src/scenery.js` | The forest around the board (instanced trees, rocks, tower, lanterns). |
| `src/scene.js` | three.js board: tiles, pawns, hop animation, bloom glow, camera fitting, picking. |
| `src/ui.js`, `src/play-ui.js` | Setup screen, scoreboard, die, question card, dialogs, voice controls. |
| `src/game.js` | Turn loop, rules, saving and resuming. |
| `src/style.css`, `src/template.html` | Look and page shell. All sizes are in rem so the interface scales with the window. |
| `src/dev-mock.js` | Local stand-in for the Claude runtime. Never published. |
| `tests/` | Node tests for the board rules, the question service and the voice ranking. |

## Build and test

```bash
node build.mjs                 # writes dist/index.html (publish this) and dist/dev.html (adds the mock)
node tests/layout.test.js
node tests/questions.test.js
node tests/voice.test.js
python3 -m http.server 8765 --directory dist   # then open /dev.html
```

Useful query switches on `dev.html`: `?fail=not_granted` (AI refuses), `?speed=6` (faster fake
latency), `?q=hi` or `?q=lo` (lock graphics quality).

## How the AI part works

The page asks for the `sample` capability. When it runs inside a Claude viewer, the first call asks
the viewer for permission and spends that viewer's own Claude usage. Questions are requested in
batches per age band (first batch on the quick tier so the game starts fast, refills on the default
tier) and stream in as JSON lines. If permission is declined, a call fails or the page runs outside
a viewer, the game switches to the built-in bank and says so in the top bar.

## Home-server edition (Wedge Quest Studio)

`studio/` is a second way to run the same game: a small Python server serves it to every device on the
home network, reads questions aloud with a local voice model (Kokoro) and asks Claude for questions with
an API key that stays on the server. The cloud artifact above is untouched. See `studio/README.md` for
using it; for working on it:

| Path | What it does |
| --- | --- |
| `studio/server.py` | The server (one file, run with `uv run --script`): static files, `/api/status`, `/api/tts`, `/api/ask`, and `--autostart` (see below). |
| `studio/autostart.command`, `studio/service.sh` | Start at login. `server.py --autostart install` writes a launchd agent (`~/Library/LaunchAgents/local.wedgequest.studio.plist`) that runs `service.sh`: it keeps the Mac awake, prefers the packages already installed so it starts offline, and logs to `~/Library/Logs/WedgeQuestStudio`. launchd restarts it after a crash. |
| `src/studio.js` | Browser side of `/api/status` and `/api/ask`. Its `sample` has the shape of the Claude runtime's, so the Quizmaster uses it unchanged. |
| `src/voice-studio.js` | The studio voice as a `WQVoice` engine: fetches short clips, schedules them on the audio clock, falls back to the browser voice. |
| `tools/vendor.mjs` | Fetches three.js and the fonts into `studio/www/` and records their checksums in `studio/vendor.lock.json`. |
| `tests/studio.test.js`, `studio/tests/` | Node tests for the bridge and engine; Python tests for the server (a fake Claude API, plus the real voice model if present) and for the login item (a fake `launchctl`; `service.sh` run with a fake `uv`). |

```bash
node tools/vendor.mjs          # once: fetch three.js and fonts into studio/www
node build.mjs                 # also writes studio/www/index.html
node tests/studio.test.js
cd studio && uv run --no-project --python 3.12 --with "anthropic>=2.3,<3" --with kokoro-onnx python -I -m unittest discover -s tests
```

`studio/tests/fake_claude.py` is a stand-in for the Claude API: run it, then start the server with
`ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://127.0.0.1:8790` to try the whole game with no key.

## About the voice

A published page can only use the browser's own text-to-speech voices; cloud voices cannot be
called from it. `voice.js` picks the best English voice on the device automatically and the game
menu has a picker, speed control and a Try it button. On a Mac the big upgrade is to download a
Premium voice (System Settings, Accessibility, Spoken Content, System voice, Manage Voices, Ava
or Zoe). Edge on Windows ships Natural voices.

## Making it yours

- Topic ideas, avatars and the neon palette are in `src/theme.js`.
- Number of wedges is limited to 3 to 8 by `src/layout.js` (`RIM_GAP` sets spaces between wedges).
- Difficulty adapts per player: two right answers in a row go up a level, two wrong go down.
