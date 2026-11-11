# Wedge Quest audit

Audit date: 10 November 2026. Audited build: Studio package 1.0.0 with the hub-crossing fix
(`WedgeQuest-Studio.zip`, sha256 `b6b77837…`), and the source it was built from.

The build plan that answers this audit is in [BUILD_PLAN.md](BUILD_PLAN.md). Finding IDs here (P1, G1, S1 …)
are the ones the plan refers to.

## Summary

The game plays, every test passes and the build is reproducible. It is not yet safe from loss, not
verified at home, and it does not yet do much for the reason it exists: helping a six-year-old learn.

65 findings: 1 critical, 27 major, 34 minor, 3 ideas.

**What is sound**

- The movement rules, including the new hub crossing: 12,887 paths checked, no illegal move, no stuck position.
- The page's handling of typed and Claude-written text: none of it can run as code.
- The server's basic protections: it refuses path tricks, outside web pages and oversized requests, and never reveals the key.
- All 150 built-in questions have the right answer marked.
- The package matches the source and contains nothing it should not.

**What matters most**

1. **The source could vanish** (P1). It exists only in this session's folder.
2. **Nothing at home has been verified** (P3, P4). Claude-written questions have never been seen with a real key.
3. **A slow Claude call hangs the game, and reloading rewinds the turn** (Q1, G1).
4. **A six-year-old gets teenagers' questions in built-in mode** after five per subject, and several topics give the wrong subject (B1, B2).
5. **The game does not teach from mistakes** (Q5), and its difficulty rule leaves a struggling child failing about half the time (Q4). The roll-again rule gave a simulated weak player a third of the turns of a strong one (G7).
6. **Any device on the Wi-Fi can spend the API key**, and the daily limit resets on restart (S1, S2).
7. **Read-aloud mangles decimals, date ranges and abbreviations** (U1), and a held Enter key can answer for a child (U2).
8. **Updating the Studio loses the key and the voice model** unless you know to carry them over (S6).

## How the audit was done

| Step | What was done |
| --- | --- |
| Full read | Three independent reviewers each read one area in full, without being told what to look for: game rules and questions, board/interface/voice, Studio server and package. |
| Probes | Each reviewer ran scripts against the real code: a headless harness that plays whole games, a live local server with a stand-in for Claude, mutation copies of the tests. |
| Tests | I ran every suite: 153,330 layout, 530 question, 20 voice and 99 Studio-bridge checks, and 109 Python tests (6 skipped: they need the 354 MB voice model). All pass. |
| Build | I rebuilt in a clean copy. `dist/index.html`, `dist/dev.html` and `studio/www/index.html` came out byte-identical to the shipped files, and the zip matches `studio/`. |
| Cross-check | I re-ran or re-read the main findings myself before writing them down. Findings I confirmed are marked ✔ in the tables. |
| Live look | I opened the setup screen at desktop and phone width and measured the controls. |

Every finding says how it was established: **ran** (reproduced by running the real code) or **read**
(inferred from the code only).

### What this audit could not cover

- **The Mac Studio and the Mac mini.** This MacBook cannot connect to them, so nothing running at home was
  inspected. Whether the Studio has the hub fix, and whether its key works, is unknown.
- **The real Claude API.** No call has ever been made with a real key, so the quality and accuracy of
  Claude-written questions is unmeasured.
- **Sound.** Nobody has confirmed how the Kokoro voice sounds or mispronounces.
- **The cloud artifact as a live page.** Its source was audited; the published page was not opened.
- **Real devices.** No iPad, no iPhone, no Safari, no real restart of a Mac with the login item.

## State of the project

| Thing | State | How I know |
| --- | --- | --- |
| Source code | Only in a folder the app made for this session. No version control, no backup. | Listed the folder; no `.git`. |
| Studio package | `WedgeQuest-Studio.zip` 1.0.0 with the hub fix, built 28 Oct. Identical to `studio/`. | Checksums, `diff`. |
| Studio at home | Running, key added and server restarted according to you. Hub fix and key unconfirmed. | Your messages; no access. |
| Cloud artifact | Version 2, published 28 Oct, still has the old hub rule. | Not republished since the fix. |
| Tests | 153,979 JavaScript checks and 109 Python tests pass. `game.js` has no test. | Ran them. |
| Version shown to players | None. The server knows it is 1.0.0; the game page shows no version or build date. | Searched the source. |
| Leftovers | `zip-share/` (a second copy of the zip and page), the `share-studio-zip` launch entry, `studio/__pycache__` from test runs. | Listed the folder. |
| Tooling | Node 18.20.8 (past end of life), uv 0.10.4. No `package.json`, no single command that runs everything. | Version commands. |

## Findings

Severity: **Critical** (do before anything else), **Major** (breaks play, costs money, or defeats the
learning goal), **Minor**, **Idea**.

### Project and delivery

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| P1 | Critical | **The source can be lost.** It lives only in this session's folder, which is deleted with the session. There is no repository, history or backup. The only other copies are built pages, which are hard to edit. | ✔ ran: no `.git`, single copy. |
| P2 | Major | **Three versions are in play and nothing identifies them.** The cloud artifact has the old hub rule, the Studio may or may not have the new one, and neither page shows a version or build date. | ✔ read. |
| P3 | Major | **The home install is unverified end to end.** Not confirmed: the hub fix on the Studio, Claude questions with the real key, the mini reaching the Studio, start at login after a real restart. | ✔ no access; see "could not cover". |
| P4 | Major | **Claude-written questions have never been seen.** Every test uses a stand-in. Prompt quality, accuracy per age, speed and real cost are unmeasured. | ✔ read. |
| P5 | Minor | **No one-command check and no release script.** Tests are five separate commands; the zip was assembled by hand. | ✔ read. |
| P6 | Minor | **Leftovers:** `zip-share/`, the `share-studio-zip` launch entry, `studio/__pycache__`. | ✔ ran. |
| P7 | Minor | **Node 18 is past end of life.** The build and tests need nothing newer, but it gets no security fixes. | ✔ ran. |

### Game rules, turns and saving

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| G1 | Major | **A reload during a question rewinds the turn.** The game saves only after a turn ends. Reloading with a question on screen gives the same player a new roll and a different question, so any question can be dodged, including the final one. Reloading after a correct answer but before "Claim your wedge" loses the wedge. | ✔ ran in a headless game; `src/game.js:357` is the only save point. |
| G2 | Major | **`game.js` has no tests.** The turn loop, win condition, wedge award, level changes and save/resume are untested. A headless harness is feasible (the reviewer built one). | ✔ ran: nothing in `tests/` loads it. |
| G3 | Minor | **A damaged save can break start-up.** `players:[null]` throws during boot, and the game then never detects the AI. `stats.by: []` freezes the first question card. Nine players or level 99 are accepted. The game itself never writes these, and there is no migration beyond a version check. | ran; `src/game.js:192-201`. |
| G4 | Minor | **Asked questions are forgotten on resume.** After "Continue last game", 5 of the next 5 built-in questions on a topic were repeats. | ran; `src/questions.js:126`. |
| G5 | Minor | **Setup edge cases.** Duplicate topic names are allowed (three "Animals" wedges). Starting a new game silently overwrites the old save at the first turn. "Continue" discards edits just made on the setup screen. | ran; `src/game.js:238-241`. |
| G6 | Minor | **The error path can loop.** A persistent error shows "Something hiccuped" every 0.8 s forever and does not save. | read; `src/game.js:358-365`. |
| G7 | Idea | **Rules that work against a young player.** A right answer rolls again with no cap: a 40%-accuracy child against an 85% adult got 10 questions a game to the adult's 32 and lost 40 of 40 simulated games. The default (6 wedges, 3 players) takes about 94 questions. A player who misses the final question gets another every turn without moving. | ran, simple bot. |

### Question service (Claude-written questions)

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| Q1 | Major | **A slow Claude call can hang the game.** There is no time limit on a call, slowness never falls back to the built-in pack, and the waiting card cannot be closed. The only way out is to reload, which (G1) rewinds the turn. | ✔ ran: still waiting after 25 s; no timeout in `src/questions.js` or `src/studio.js`. |
| Q2 | Major | **The AI turns itself off for the rest of the game after four failures, and never retries.** A repeated question counts as a failure. A network error turned it off by the third question. | ran; `src/questions.js:289-302`. |
| Q3 | Major | **Nothing checks that a Claude-written question is right.** Only the structure is checked. Accepted in tests: "All of the above" as the answer, the answer given away in the question, a second true option, a 45-word question, no fun fact. There is no "report this question" and no way for a parent to overrule a verdict. | ran; `src/questions.js:266-287`. |
| Q4 | Major | **Difficulty settles where players fail about half the time.** Two right in a row goes up, two wrong goes down. A struggling child ended at 45% right with only a third of questions at the easiest level. After a level change the next question still comes from the old level. | ran, 40 simulated games each. |
| Q5 | Major | **Misses teach nothing.** The fun fact is extra trivia, not an explanation. A missed question never comes back. The list of misses appears only on the victory screen (last 8, all players mixed), and is deleted with the save. Per-topic results are collected and never shown. Nothing carries over between games. | read; `src/play-ui.js:267-389`, `src/game.js:444,513`. |
| Q6 | Minor | **Built-in mode ignores the level** but still announces "Level up! Questions are now a little trickier". | ran; `src/questions.js:345-349`. |
| Q7 | Minor | **One malformed line can discard the rest of a batch.** A stray quote left 1 of 3 good questions. | ran; `src/questions.js:81-113`. |
| Q8 | Minor | **About 63% of written questions are never asked.** With an instant stand-in: 69 calls and 305 questions per game for 112 asked. Four such games would reach the 300-a-day limit. | ran; real latency will lower this. |
| Q9 | Minor | **Prompt gaps.** One-line guides for teens and adults; "everyday things" for ages 4–6 even on History; no rule against "which is NOT" questions or tell-tale option lengths; no locale or units; the avoid-list omits built-in questions already asked; a batch written for age 4 can be served to a 6-year-old. | read; `src/questions.js:49-76`. |

### Built-in question pack

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| B1 | Major | **Young players run out of their own questions after five per subject.** A 6-year-old on Science got 5 questions for their age, then 5 written for ages 9–12, then 5 for teens. Across 60 simulated family games, 34% of the 6-year-old's questions came from an older tier. Adults get the teen tier; there is no adult tier. Six topics hold 90 questions and a three-player game asks about 94. | ✔ ran; `src/bank.js:282`. |
| B2 | Major | **Topic names are matched to subjects by letters inside words.** "Video Games" (in the game's own idea list) gives sports questions, "Cooking" gives history (`king`), "Earth" gives arts (`art`), "Hot Dogs" gives animals. "Weather", "Technology", "Robots", "Cars", "Mythology" and "Inventions" (all in the idea list) match nothing. Music, Movies, Art and Books share the same five arts questions per tier, so a Movies wedge asks who painted the Mona Lisa. | ✔ ran; `src/bank.js:252-267`. |
| B3 | Minor | **Question quality.** No wrong answer key in all 150. Flagged: 3 time-sensitive, 6 loosely true or ambiguous, 2 that give the answer away, 9 too hard for a 6-year-old even read aloud, several overlaps (Mona Lisa twice, pyramids twice, three water questions in one set), and a US slant. Full list with line numbers in the appendix. | read all 150; answer position checked over 40,000 serves, no bias. |

### Tests

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| T1 | Major | **Eleven deliberate bugs pass the question tests**, among them: correct answer always first, fewer than three wrong answers accepted, built-in pack ignoring age, the four-failure switch-off removed, length limits removed. | ran each in a scratch copy. |
| T2 | Minor | **Weak assertions.** `tests/layout.test.js:66` (always true), `tests/questions.test.js:143` (always true), `:176` (unused mock), `tests/studio.test.js:168`. The Python path-traversal test would pass against a server with the bug. | ran / read. |
| T3 | Minor | **Untested server behaviour:** connection timeouts, crafted paths, budget across a restart and day change, `.env` parsing, every `WQ_*` setting, the model download retry loop, `--check`, the zip itself. The six real-voice tests are skipped unless the model is on disk. | read. |

### Studio server

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| S1 | Major | **Any device on the home network can spend the API key.** `/api/ask` accepts any text that begins "You are the Quizmaster" and sends it to Claude. The caller cannot change the model or output size, but can ask for anything. Rough exposure: about $0.20 a request on Opus 5.5, about $60 a day at the default limit, reachable by one device in about 13 minutes, which also turns AI questions off for the family that day. | ✔ ran against a local server; `studio/server.py:785-789`. Cost is arithmetic, not measured. |
| S2 | Major | **The daily limit resets on every restart and counts requests, not money.** `WQ_DAILY_LIMIT=0` means unlimited. A request refused as "busy" still uses one. | ✔ ran: limit 3, restart, limit gone; `studio/server.py:238-270`. |
| S3 | Major | **Idle connections can make the server unreachable.** A connection that sends nothing is held forever. A login-item process gets 256 file handles; with 250 idle connections a new request was refused. Tablets that fall asleep leave such connections behind, on a server meant to run for months. | ✔ ran under the 256 limit; `studio/server.py:648,823`. |
| S4 | Major | **Malformed requests write tracebacks to a log that only rotates at start.** `GET /%00` adds about 2.4 KB each time with no rate limit. | ran: 50 requests, 123 KB; `studio/server.py:730`. |
| S5 | Major | **Python packages are version ranges with no lock.** A start by hand can install releases never tested here, and the login item (offline first) can run different versions from a hand start. | ran: resolves to anthropic 2.8.0, kokoro-onnx 0.6.1 today. |
| S6 | Major | **Updating loses `.env` and the 354 MB voice model** unless the owner knows to carry them across, and nothing says so. | ✔ read; `studio/README.md:72,143`. |
| S7 | Major | **Adding the key is fragile.** `.env` files are hidden in Finder. A trailing `# comment`, a byte-order mark or `export` in front silently breaks the line. Started by hand, a stale `ANTHROPIC_BASE_URL` in the shell would send the key to that host. Permissions are advice only. | ran each parser case. You hit one version of this on 28 Oct. |
| S8 | Major | **Saved games live only in each browser, per address.** A new IP address, switching between the number and the `.local` name, or a port change orphans every save. No export. | read; `src/game.js:23-37`. |
| S9 | Minor | **"Out of credit" may be reported as a generic outage.** Only a 400 with "credit" in the text is recognised; a 402 is not. Needs one check against the live API. | ran with a stand-in. |
| S10 | Minor | **Retries can hold a request for a long time** (a 429 with a 30 s wait was still pending after 20 s), and a real 400 costs three calls. | ran. |
| S11 | Minor | **Speech cache accounting drifts** when the same clip is requested at once; eventually every insert empties the cache. | ran: one 48 KB entry counted as 240 KB. |
| S12 | Minor | **Voice errors in `/api/status` can show a home-folder path** to every device. | ran. |
| S13 | Minor | **Two servers can share the port** (`--local` plus the login item), with no error. | ran with plain sockets. |
| S14 | Minor | **Logs cannot explain a bill:** time of day only, no client address on question lines. | read. |
| S15 | Minor | **The first voice download does not retry after three failures** until a restart; later starts check size only, not the checksum. | read. |
| S16 | Minor | **No back-off in restart loops; `launchd.log` never rotates.** | read. |
| S17 | Minor | **Fourteen README mismatches**, listed in the appendix. The notable ones: the Safety section understates which host names are accepted (a public IP in the Host header returned 200), the log is not "trimmed at every start", and the cost line is an estimate. | ran / read. |
| S18 | Idea | Validate the key at start-up; an uninstall section; ship licence texts for the fonts; a watchdog for a hung server. | read. |

**Checked and sound in the server:** static serving refused thirteen path-traversal variants; DNS
rebinding and cross-site POSTs are refused; the key never appears in a response, the status endpoint or
the login item; the model download checks size and checksum before an atomic rename; the Claude API call
uses valid model IDs, parameters and error handling for SDK 2.3 through 2.8; the README's prices match the
current price table.

### Board, interface and voice

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| U1 | Major | **Read-aloud says numbers and abbreviations wrongly.** "3.14" is spoken as "3." then "14." as two separate clips; "1939–1945" becomes "1939 minus 1945"; "Dr. Seuss" breaks after "Dr."; a blank ("The ___ is the largest planet") is dropped. The built-in pi and marathon questions are affected. | ✔ ran the real clean-up code; `src/voice.js:119,146`. |
| U2 | Major | **Keys act regardless of what has focus, and ignore key repeat.** Enter aimed at the menu button rolled the die. A repeated "1" answered a question that had just appeared. A held or mashed Enter can roll, answer A, continue and roll again, and the wrong answer counts against the child. | ran the handlers on a stand-in page; the full chain needs a real browser. `src/play-ui.js:155-160,300-308`. |
| U3 | Major | **On an iPad the first spoken lines may be silent, and Chrome can drop the choices.** Safari only speaks when speech starts inside a tap; here it always starts after a delay. Nothing notices when speech never starts or stalls. | read; needs a real device. `src/voice.js:189-227`. |
| U4 | Major | **On touch you cannot see a space's topic while choosing.** Topics show on hover only, the prompt says "Hover a space to see its topic", and the legend is hidden below 900 px wide (an iPad held upright) and faded while picking. | ✔ read; `src/game.js:385`, `src/scene.js:1235`. |
| U5 | Major | **Cloud edition: if three.js fails to load, the page is blank with no message.** The Studio edition serves three.js itself and is not affected. | ran: booted without three.js. `src/game.js:708-713`. |
| U6 | Major | **No recovery when the graphics context is lost.** iPad Safari drops it after the app is in the background; the result would be a black board under a working interface. | read; needs a real device. `src/scene.js:166-227`. |
| U7 | Minor | **Setup controls are small for touch.** At phone width 59 controls are under 44 px (age buttons 29×29). On an iPad the age, remove-player and segmented buttons are 28–30 px. In-game controls are comfortable (die 93 px, answers 64 px high on an iPad). | ✔ measured in the browser at 375 px; iPad figures computed. |
| U8 | Minor | **Dialogs do not manage focus.** No starting focus, no focus trap, background still reachable. A screen reader lands on "A, Mars" without hearing the question. Tab is captured while choosing a space. | read; `src/ui.js:99-125`. |
| U9 | Minor | **Some signals are colour only.** Violet and blue topics are indistinguishable with the commonest colour blindness; yellow, lime and orange are close. Wedge pies on pawns and score cards are colour plus position only. Toolbar toggles show their state by icon colour alone. | ran a colour-blindness simulation. Text contrast is sound. |
| U10 | Minor | **Reduced motion hides the turn banner** and the board still animates. | read; `src/style.css:390,415`. |
| U11 | Minor | **Graphics memory leaks.** Typing a 10-letter name rebuilds the pawns ten times and leaves 200 shapes behind; each board rebuild leaves 9. | ran with a stand-in renderer. `src/scene.js:818-827`. |
| U12 | Minor | **The graphics quality switch only steps down, is not remembered, and can misfire.** Its 42 ms threshold is a hair above a 24 Hz TV's 41.7 ms, so a capable Mac mini on such a TV could lose the glow. | read; `src/scene.js:374-388`. |
| U13 | Minor | **Card timing races.** A question that arrives after its card closed still reads aloud and accepts a key press. A question card can open on top of the menu. | ran on a stand-in page. |
| U14 | Minor | **Touch details.** A tap that moves 6 px or lasts over 0.7 s picks nothing; double-tap can zoom the page; answers accept a tap the instant the card appears, so a second tap on the die can answer. | read; needs a real device. |
| U15 | Minor | **Small voice and device gaps.** The Studio voice request has no time limit; the screen wake lock is not re-acquired after the tab was hidden; with storage blocked "How to play" opens every game. | read. |
| U16 | Minor | **Cloud edition in Chrome may send spoken lines to Google.** Network voices rank above standard local ones, so "Google US English" can be chosen, and every line including a child's name goes to Google's speech service. | ranking confirmed by the test; that those voices are remote is browser knowledge. |
| U17 | Minor | **A non-reader still needs help with prompts.** Spoken: turn, question, choices, verdict, fun fact, winner. Not spoken: "roll the die", "pick a glowing space", "roll again", level-up, the final-question explainer. Why the AI is off is only in a hover tooltip. A changed avatar cannot be changed back to most of the originals. | read. |
| U18 | Idea | **Performance headroom.** The default board is 380 draw calls and 177k triangles with about a dozen full-screen glow passes; fine on an Apple-silicon Mac mini, reliant on the step-down on an older iPad. No frame cap on 120 Hz screens. | ran scene statistics. |

**Checked and sound in the page:** no text typed by the family or written by Claude ever reaches the page
as HTML; server error text is never displayed; double clicks on the die, clicks during a hop and double
answers are guarded; restart cancels the turn loop cleanly; resize and rotation are handled; every storage
access is protected; the voice queue has no overlap path.

## Appendix A: built-in questions flagged (B3)

Line numbers are in `src/bank.js`.

| Kind | Questions |
| --- | --- |
| Time-sensitive | `:169` most men's World Cup titles (Brazil; still right after 2026), `:195` top coffee grower, `:193` most expensive spice |
| Loosely true or ambiguous | `:111` travel before cars ("most people" walked), `:93` Egypt's continent with Asia as a wrong option, `:206` primary colour of paint, `:179` monkeys and bananas, `:181` rabbits and carrots, `:37` frogs "start out as" tadpoles, `:18` plants make the oxygen we breathe |
| Answer given away | `:114` "built the Colosseum in Rome" → The Romans, `:221` "which Paris museum" with one Paris option |
| Too hard for age 6 read aloud | `:12`, `:60`, `:84`, `:85`, `:86`, `:107`, `:109`, `:206`, `:229` |
| Overlaps | Mona Lisa `:211`/`:221`; pyramids `:107`/`:117`; water `:11-13`; the Sun `:15`/`:60`; basketball `:157`/`:163`; oxygen `:18`/`:236` |

## Appendix B: README mismatches (S17)

`studio/README.md` unless stated.

1. `:128-131` accepted host names: the code also accepts `.lan`, `.home.arpa`, `.internal`, `.localhost`, and any IP address including public ones.
2. `:69` "trimmed at every start": only when over 2 MB, only at start; `launchd.log` never.
3. `:91-92` daily limit "stops a mistake": resets on restart, counts requests, 0 means unlimited.
4. `:92-93` "out of credit … the game says so": only for one error shape.
5. `:89-90` "what every batch actually cost": an estimate for six models; no Terminal window under the login item.
6. `:65`, `:111` settings come from `.env`: by hand, exported variables win.
7. `:36-37` "right-click and choose Open": recent macOS moved this to System Settings, Privacy & Security.
8. `:76` copying `.env.example`: both files are hidden in Finder.
9. `:113-124` settings table omits `WQ_RATE_PER_MIN`, `WQ_MODELS_DIR`, `WQ_SKIP_HASH`, `WQ_NO_OPEN`; `.env.example` omits `WQ_ALLOWED_HOSTS`; options omit `--no-play`, `--version`, `--force`.
10. `:139` "Port 8777 in use": not reported when one copy is `--local`.
11. `:72`, `:143` updating: no mention of keeping `.env` and `models/`.
12. `:23-24` "a few dozen MB" of packages: about 151 MB installed.
13. `:149-161` folder table omits `check.wav`.
14. Top-level `README.md:67` test command leaves the kokoro version pin off.
