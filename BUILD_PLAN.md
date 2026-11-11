# Wedge Quest build plan

Written 10 November 2026 from the audit in [AUDIT.md](AUDIT.md). Finding IDs (P1, G1, S1 …) refer to it.
Starting point: Studio package 1.0.0 with the hub-crossing fix.

The plan has ten milestones. Each one has a goal, stages, reviews, and a list headed **Complete when**
that is fixed now, before the work starts. A milestone is closed only when every line of that list is
ticked with evidence. Nothing else counts as done.

**Tracker.** Every decision, stage, review and completion criterion below is a card in the Notion
database [Wedge Quest tasks](https://app.notion.com/p/48309a80f535416da14a2bf998912b56), under the page
[Wedge Quest build plan](https://app.notion.com/p/415a15d7cdec811f893ae1294adc72ac). This file is the
definition; Notion is where status and evidence are recorded.

## Status

| # | Milestone | Ships as | Closes | Status |
| --- | --- | --- | --- | --- |
| M0 | A safe home for the project | 1.0.1 | P1 P2 P5 P6 P7 | In progress: evidence in [docs/milestones/M0.md](docs/milestones/M0.md) |
| M1 | The home install, verified | (no change) | P3, first look at P4 | Not started |
| M2 | Never stuck, never lost | 1.1.0 | G1–G6 Q1 Q2 Q7 T1 T2 U5 U13 | Not started |
| M3 | The key and the server are safe | 1.2.0 | S1–S5 S9–S16 T3 | Not started |
| M4 | Built-in questions fit every age | 1.3.0 | B1 B2 B3 Q6 | Not started |
| M5 | Claude questions you can trust and afford | 1.4.0 | P4 Q3 Q8 Q9 | Not started |
| M6 | The game teaches | 1.5.0 | Q4 Q5 G7 | Not started |
| M7 | Comfortable for a six-year-old on any screen | 1.6.0 | U1–U4 U6–U12 U14–U18 | Not started |
| M8 | Easy to own | 1.7.0 | S6 S7 S8 S17 S18 | Not started |
| M9 | Release 2.0, both editions in step | 2.0.0 | P2, re-audit | Not started |

**Order.** M0 to M3 should stay first and in this order: they protect the work, confirm what is really
running, stop the game losing a turn, and protect the key. M4 to M7 can be reordered to taste; if the
learning goal matters most to you, M6 can move ahead of M5 (it then uses built-in questions only until M5
lands). M8 and M9 come last.

**Size.** S is about one working session, M two or three, L four or more. These are guesses, not promises.

## Rules that apply to every milestone

### What "complete" means

1. The **Complete when** list is fixed in this file. It can be changed only by you, only before the
   milestone starts, and the change is written in the decision log at the end of this file.
2. Each line is ticked only with evidence: a test name and its output, a checksum, a screenshot, or your
   own report for things only you can see.
3. Evidence goes in `docs/milestones/M<n>.md`, one file per milestone, using the template at the end.
4. A line that cannot be met is not quietly dropped. The milestone stays open, or you decide to defer the
   line and the reason is logged.
5. "Verified" means it was run here. Anything only you can check at home stays marked unverified until
   you report it.

### Standing checks, at the end of every stage

| Check | Passes when |
| --- | --- |
| SC1 Tests | `./check` is green: every JavaScript and Python suite, plus a clean rebuild that matches the shipped pages. |
| SC2 Red then green | Every behaviour change has a test that fails on the old code and passes on the new. The failing run is kept as evidence. |
| SC3 Mutation | For each new test file, at least five deliberate bugs in the code it covers are introduced one at a time; every one is caught. |
| SC4 Browser | The stage's scenario is played in a real browser with no console errors. |
| SC5 No regressions | The game simulations from M2 (once they exist) still complete with zero exceptions. |

### Reviews, at the end of every milestone

| Review | Who | Passes when |
| --- | --- | --- |
| R1 Checklist | Me | Every stage output exists and every standing check has evidence. |
| R2 Independent review | A fresh reviewer that has not seen how the work was done, given only the code and this milestone's goal | No open Critical or Major finding. Minor findings are fixed or logged. |
| R3 Scenario run | Me, in the browser against the built package | The milestone's scripted scenarios pass end to end. |
| R4 Owner acceptance | You, at home | You have done the short checklist in the milestone and reported the results. Only milestones the family can see or that touch your Mac have one. |

### Releases

Every milestone that changes shipped files ends with a tagged commit, a version bump, a `CHANGELOG.md`
entry in plain words, a package built by the release script with its checksum, and update steps. The
cloud artifact is republished only when you say so.

### Spending

Stages that call the real Claude API (M1, M5) state an estimated cost first and wait for your go-ahead.

---

## M0 · A safe home for the project → 1.0.1

**Goal.** The source cannot be lost, any build can be identified, and one command proves the project is healthy.

**Closes** P1, P2 (version stamp), P5, P6, P7. **Size** S. **Depends on** nothing.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| Where the project lives | A folder in your home folder, for example `~/Projects/wedge-quest`. Not Desktop, Documents or iCloud. |
| A second copy | A private GitHub repository. Otherwise Time Machine on that folder. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 0.1 Move | Move this session to the folder you choose. | Project in its permanent folder. |
| 0.2 History | Start a repository, add an ignore list (`models/`, `.env`, caches, `dist` stays tracked), commit the current state, tag it `v1.0.0-hubfix`. | Baseline tag. |
| 0.3 One-command check | A `check` script: four JavaScript suites, the Python suite with the right environment, then a rebuild into a temporary folder compared byte for byte with the tracked pages. | `./check` |
| 0.4 Release script | A `release` script that builds the pages, assembles the zip with fixed timestamps and permissions, refuses if `.env`, `models/` or caches are present, and writes the sha256 beside it. | `./release`, `WedgeQuest-Studio-<version>.zip`, `.sha256` |
| 0.5 Build identity | One version source. The build stamps version, date and commit into the page; the game menu shows it; `/api/status` returns it; the server warns in its banner when page and server builds differ. | Version line in the menu. |
| 0.6 Housekeeping | Remove `zip-share/`, the `share-studio-zip` launch entry and stray caches. Add `CHANGELOG.md` starting with 1.0.0, the hub fix and 1.0.1. State the supported Node version and make the scripts refuse older ones with a clear message. | Clean tree. |

### Reviews

R1. R2: the reviewer clones the repository into an empty folder and follows only the README to run
`./check` and `./release`.

### Complete when

- [ ] C0.1 The project is in the folder you chose, outside the session folder, and is a repository with the tag `v1.0.0-hubfix`.
- [ ] C0.2 A second copy exists where you decided (remote repository or backup), and I have told you how to confirm it.
- [ ] C0.3 In a fresh clone, `./check` passes with no manual steps.
- [ ] C0.4 `./release` run twice produces zips with the same sha256.
- [ ] C0.5 The game menu and `/api/status` show the same version, date and commit; a test asserts it.
- [ ] C0.6 The working tree has no leftovers and `git status` is clean after `./check`.
- [ ] C0.7 `CHANGELOG.md` exists and names every shipped version.

---

## M1 · The home install, verified → no code change

**Goal.** Replace every "unverified" about your Mac Studio and Mac mini with something seen.

**Closes** P3; gives the first real look at P4 and the live answer for S9. **Size** S for me, about 30
minutes for you. **Depends on** M0 (so the build shows its version).

**Spending.** `--check` asks Claude for one word. One family game on Opus 5.5 is estimated at well under
a dollar; the log will show the real figure.

### Stages

| Stage | Who | Work | What to report back |
| --- | --- | --- | --- |
| 1.1 Install 1.0.1 | You | Replace `www/index.html` and `server.py` in your Studio folder (I give the exact steps), restart. | The version line from the game menu on the mini. |
| 1.2 Key and voice | You | Run `./start.command --check` on the Studio. | The lines it prints: what Claude answered, whether the sentence was spoken. |
| 1.3 The mini | You | Open the game on the mini. | Top bar colour and wording; whether a roll can cross the hub. |
| 1.4 One real game | Family | Play one game with Claude questions on. | The "questions" lines from the log (cost and counts); any question that was wrong, odd or too hard; how long the first question took. |
| 1.5 Restart | You | Restart the Studio, log in, touch nothing else. | Whether the game is reachable from the mini, and after how long. |
| 1.6 Record | Me | Write the results into `docs/milestones/M1.md` and the project notes; open findings for anything that failed. | Updated unverified list. |

### Reviews

R1. R4 is the milestone itself.

### Complete when

- [ ] C1.1 The mini shows version 1.0.1 and a piece can cross the hub.
- [ ] C1.2 `--check` output is recorded: Claude answered and the voice spoke, or the exact error is recorded and a finding opened.
- [ ] C1.3 One full game was played with Claude questions; the real cost, the number of calls and the time to first question are recorded.
- [ ] C1.4 Every question the family flagged is written down word for word.
- [ ] C1.5 The restart result is recorded.
- [ ] C1.6 The list of unverified items in the project notes is updated; nothing about the home install is still a guess.

---

## M2 · Never stuck, never lost → 1.1.0

**Goal.** No reload, slow answer, bad save or error can freeze the game or cost a player their turn.

**Closes** G1, G2, G3, G4, G5, G6, Q1, Q2, Q7, T1, T2 (JavaScript), U5, U13. **Size** L. **Depends on** M0.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| How long to wait for Claude before using a built-in question | 8 seconds, then switch automatically and say so on the card. |
| Reload with a question on screen | The same question comes back. It cannot be dodged. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 2.1 Game harness | A headless harness that loads the real game with a stand-in screen and board and plays whole games. Tests for today's behaviour: turn order, wedge award, level change, win, save and resume. | `tests/game.test.js`, part of `./check`. |
| 2.2 Save at every step | Save after the roll, the move, the question being shown, the answer and the wedge. Save when the page is hidden. On resume, restore the exact step, including the same question and the same roll. Save format version 2 with a converter from version 1. | Resume tests for seven points in a turn. |
| 2.3 Time limits | A deadline on every Claude call (browser and server bridge). After the wait you chose, serve a built-in question and mark the card "Built-in". The waiting card gets a "Use a built-in question" button. | Hang tests: never-answering, slow, and failing stand-ins. |
| 2.4 The AI comes back | Failures back off and retry in the background instead of switching off for the game. A repeated question is discarded without counting as a failure. The top bar shows "AI resting, back soon" and recovers by itself. The batch reader recovers after a bad line. | Recovery tests; parser tests with broken lines. |
| 2.5 Saves that cannot break start-up | Deep validation of a saved game; a damaged one is set aside and the family is offered a fresh start, with AI detection still running. Persist the list of asked questions. Warn on duplicate topic names. Ask before overwriting a saved game. Keep setup edits when continuing. The error path stops after three tries with a "Back to setup" button. | 30 damaged-save cases. |
| 2.6 Loading and card races | Cloud edition: if the graphics library fails to load, show the fallback message with a retry button. A question that arrives after its card closed is discarded. A question card cannot open over the menu. | Boot tests without the library; race tests. |
| 2.7 Test debt | Replace the always-true assertions. Add tests so each of the eleven surviving deliberate bugs is caught. | Mutation report. |

### Reviews

R1. R2 on `game.js`, `questions.js`, `play-ui.js`. R3 scenarios: reload at each step of a turn; unplug the
network mid-question and plug it back; load each damaged save. R4: on the mini, reload the page while a
question is showing and confirm the same question returns; tell me if anything felt slower.

### Complete when

- [ ] C2.1 `tests/game.test.js` exists, runs in `./check`, and covers turn order, wedge award, level change, final question, win, and save/resume.
- [ ] C2.2 Reloading at each of seven points in a turn (before roll, after roll, while choosing, during the question, after the answer, before claiming a wedge, during the final question) resumes at that point with the same roll and question. Automated.
- [ ] C2.3 With a Claude stand-in that never answers, a built-in question is on screen within 10 seconds and the game continues. Automated.
- [ ] C2.4 After 20 consecutive failures followed by recovery, Claude questions return within five questions without a restart. Automated.
- [ ] C2.5 Thirty damaged saves: start-up never throws, AI detection still runs, and the family is offered a fresh start. Automated.
- [ ] C2.6 One thousand simulated games across 3 to 8 wedges and 1 to 6 players finish with zero exceptions and zero stuck states.
- [ ] C2.7 At least 20 deliberate bugs across `game.js` and `questions.js`, including the eleven from the audit, are each caught by a test.
- [ ] C2.8 No test in the JavaScript suites has an assertion that cannot fail (reviewer confirms).
- [ ] C2.9 R2 reports no open Critical or Major finding.
- [ ] C2.10 You confirm the reload check on the mini.

---

## M3 · The key and the server are safe → 1.2.0

**Goal.** Nothing on the home network can run up a bill, knock the server over, or fill the disk.

**Closes** S1, S2, S3, S4, S5, S9–S16, T2 (Python), T3. **Size** L. **Depends on** M0; M1 for the live
answer to S9.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| Should each device need a code before it can use Claude questions? | Yes: a four-word family code shown on the Studio, typed once per device. The game still plays without it, using built-in questions. |
| Daily spending cap | $2 a day and $20 a month, changeable in settings. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 3.1 The server writes the prompt | The browser sends only ages, levels, topic names and the avoid list. The server checks each field (ages 4–99, at most 8 topics, lengths) and builds the prompt itself from the same template the cloud edition uses. Free text is refused. A test proves both editions produce the same prompt for the same input. | New `/api/ask` contract; contract tests. |
| 3.2 Family code | If you chose it: the server makes a code on first start, shows it in the banner and `status`; a device sends it once and gets a token stored in the browser. Requests without a token get built-in questions only. | Pairing tests. |
| 3.3 A budget that holds | The count, tokens and estimated dollars are written to a file and survive restarts. Caps per day and per month in dollars from real token counts. A refused request costs nothing. "Unlimited" must be spelled out, not `0`. The game shows "Today's Claude budget is used up" plainly. | Budget tests across restart and midnight. |
| 3.4 Connection hygiene | Idle and half-sent connections time out after 30 seconds. A cap on open connections. Raise the file-handle limit at start. Bound the voice queue and give each request a deadline. | Load tests under the 256-handle limit. |
| 3.5 Errors and logs | Malformed paths and bodies get a 400 and one log line. Logs rotate by size while running, carry the date and the device address on spending lines, and never print a traceback for bad input. Voice errors shown to devices carry no file paths. | Hostile-request suite. |
| 3.6 Pinned packages | Ship a lock file for the Python packages; both start paths use it. | `server.py.lock`, used by `start.command` and `service.sh`. |
| 3.7 Claude call details | Check the key once at start and say so in the banner. Recognise "out of credit" in every shape the live API returned in M1. Cap total retry time at 20 seconds. A genuine bad request makes one call, not three. | Error-mapping tests. |
| 3.8 Remaining server items | Speech cache accounting; refuse to start when another copy holds the port on any address; voice download retries later and checks the checksum on every start; back-off in the login item's restart loop; rotate `launchd.log`. Fix the path-traversal test so it would catch the bug. Tests for every `WQ_*` setting and for `.env` parsing. | Tests for each. |

### Reviews

R1. R2 as a security review: the reviewer is told only "this server holds an API key on a home network;
try to spend it, stall it, or fill its disk". R3: the hostile-request suite against the built package.
R4: on a second device without the code, confirm the game plays with built-in questions and the top bar
says why.

### Complete when

- [ ] C3.1 A request with free prompt text is refused. A test sends 50 crafted bodies; none reaches the Claude stand-in.
- [ ] C3.2 The cloud edition and the server produce byte-identical prompts for 20 fixed inputs.
- [ ] C3.3 The budget survives a restart and resets at midnight and at month end; a dollar cap stops requests in a test with scripted token counts.
- [ ] C3.4 With 300 idle connections under a 256 file-handle limit, a new request is answered within one second, and all idle connections are closed within 40 seconds.
- [ ] C3.5 One thousand hostile requests (the audit's list plus the reviewer's) leave the server answering within 100 ms and add under 100 KB to the log.
- [ ] C3.6 Both start paths install exactly the locked package versions; a test compares them.
- [ ] C3.7 Every finding S9–S16 has a test that failed before and passes now.
- [ ] C3.8 If the family code was chosen: a device without it gets no Claude call; a device with it does. Automated.
- [ ] C3.9 The Python suite covers every `WQ_*` setting and the `.env` cases from the audit.
- [ ] C3.10 R2 reports no open Critical or Major finding.
- [ ] C3.11 You confirm the second-device check at home.

---

## M4 · Built-in questions fit every age → 1.3.0

**Goal.** With no key and no internet, every player still gets questions for their own age on the topic
they chose.

**Closes** B1, B2, B3, Q6. **Size** L (mostly content). **Depends on** M2.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| Age bands | Five: 4–6, 7–9, 10–12, 13–17, adult. |
| When a young child has seen every question on a topic | Repeat their own band, least recently asked first. Never borrow from an older band unless you switch that on. |
| Spelling and units | US English, with miles and Fahrenheit explained alongside metric where a question needs them. Tell me if you want otherwise. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 4.1 Pack format | Questions move to a data file: id, subject, topic tags, age band, level 1–3, question, answer, three wrong answers, a one-sentence "why", date reviewed. A checker script enforces the rules below. | `data/pack/*.json`, `tools/check-pack` in `./check`. |
| 4.2 Checker rules | Four different options; no "all of the above"; the answer does not appear in the question; question length per band (12 words for 4–6, 18 for 7–9, 25 above); options within a length ratio so the longest is not a tell; no "which is NOT" below age 10; no time-sensitive wording ("currently", "most recent"); every question has a "why". | Rule tests. |
| 4.3 Topic matching | Match whole words and a synonym list, never letters inside words. Every topic in the game's idea list has its own tagged questions. An unknown topic is labelled "General" and the setup screen says so before the game starts. | A table of 200 topic names with the expected result, as a test. |
| 4.4 Repair | Fix or replace the questions flagged in the audit (Appendix A). | Diff of the pack. |
| 4.5 Grow | Reach at least 20 questions per subject per band (10 subjects × 5 bands), and at least 12 per band for each idea-list topic that is not a subject (Dinosaurs, Movies, Music, Video Games, Weather, Technology, Robots, Cars, Mythology, Inventions, Oceans, Books). Written in batches; each batch is fact-checked by a second pass that did not write it, and anything uncertain is dropped rather than kept. | About 1,700 questions. |
| 4.6 Serving rules | Pick by band, then level. Remember what each player was asked across games. No "Level up" message unless questions really change. | Simulation tests. |

### Reviews

R1. R2 in two parts: code review of matching and serving; an independent fact review of every question by
a reviewer that did not write it. R3: a built-in-only game in the browser with ages 6, 8 and 38. R4: you
read 50 randomly drawn questions from the 4–6 band and mark any you would not ask your son.

### Complete when

- [ ] C4.1 `tools/check-pack` reports zero errors on the whole pack and runs in `./check`.
- [ ] C4.2 In 200 simulated built-in games (ages 6, 8, 38; six topics), no player is served a question above their band, and repeats within a game are under 5%.
- [ ] C4.3 The 200-name topic table passes: every name gets the expected subject or "General". None of the audit's wrong matches remain.
- [ ] C4.4 Every topic in the game's idea list has at least 12 questions of its own in every band.
- [ ] C4.5 Every subject has at least 20 questions in every band.
- [ ] C4.6 The independent fact review covers 100% of questions and leaves zero disputed.
- [ ] C4.7 Every question flagged in Appendix A of the audit is fixed, replaced or justified in writing.
- [ ] C4.8 Your 50-question sample: every objection is fixed, and a second sample of 20 has none.
- [ ] C4.9 R2 code review reports no open Critical or Major finding.

---

## M5 · Claude questions you can trust and afford → 1.4.0

**Goal.** Claude-written questions are measurably right for each age, a wrong one can be caught and
corrected at the table, and a game costs a known, small amount.

**Closes** P4, Q3, Q8, Q9. **Size** L. **Depends on** M1, M3.

**Spending.** The evaluation runs call the real API from your Studio. I will give an estimate before each
run; the full set of runs in this milestone should cost a few dollars.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| Which model writes questions | Decided by the measurements in stage 5.4, not in advance: the cheapest model that meets the quality bar. |
| Target cost per three-player game | Set after the baseline in 5.1. Proposed: no more than $0.25. |
| Who may overrule a verdict | Anyone at the table, with a hold-to-confirm so a child does not do it by accident. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 5.1 Measuring stick | A fixed set of 60 requests across ages 5, 6, 8, 10, 13, 16 and adult, your family's topics, and levels. A scoring sheet: structure, fits the age, one defensible answer, fact check, reading length. A script you run on the Studio that writes a results file. Baseline run on today's prompt. | `tools/eval`, baseline report with real cost and timing. |
| 5.2 Better prompt | Fuller guides for every band; the family's locale and units; no "which is NOT" for young players; options of similar length; a required one-sentence "why"; the avoid list includes built-in questions already asked; batches written for the exact age when the youngest player is under 8. | Prompt version 2, measured against the baseline. |
| 5.3 Checks in code | The same rules as the pack checker (4.2) run on every Claude-written question before it is served; failures are dropped. | Shared validator; tests. |
| 5.4 A second look | Each batch is checked by a separate, cheaper call that answers every question without seeing the marked answer. A mismatch drops the question. Measure how many wrong questions this catches and what it costs. | Second-look step; catch-rate report. |
| 5.5 Model and waste | Run the measuring stick on Opus 5.5, Sonnet 5.5 and Haiku 5.5. Ask only for the topics and levels about to be needed. Keep unused questions on the server for the next game. | Comparison table; pick recorded in the decision log. |
| 5.6 "That's not right" | A button on the result card: hold to overrule. The score, wedge and turn are corrected, the question is saved to a report file on the Studio with what was marked right, and it is never served again. A simple page lists reported questions. | Overrule tests; report file. |

### Reviews

R1. R2: code review, plus an independent fact review of a 200-question sample that passed all checks. R3:
a game against the real API on the Studio with the log open. R4: you review 30 served questions for the
4–6 band and try the overrule button once.

### Complete when

- [ ] C5.1 The baseline and final reports exist, produced by the same script on the same 60 requests.
- [ ] C5.2 In a sample of 200 questions that passed every check, the independent fact review finds zero wrong answer keys and at most two ambiguous questions. If it finds more, the cause is fixed and a fresh sample is drawn.
- [ ] C5.3 At least 95% of sampled questions fit their age band on the scoring sheet.
- [ ] C5.4 Every served question has a "why".
- [ ] C5.5 A three-player, six-topic game costs no more than the target you set, measured from real token counts over three games.
- [ ] C5.6 No more than 25% of written questions go unused, measured over the same three games.
- [ ] C5.7 The first question of a game appears within 5 seconds in nine starts out of ten (Claude or built-in).
- [ ] C5.8 Overruling a verdict corrects score, wedge and turn, and the question is never served again. Automated.
- [ ] C5.9 The model choice and its measurements are in the decision log, and you have agreed to it.
- [ ] C5.10 Your 30-question review: every objection is traced to a cause and fixed.

---

## M6 · The game teaches → 1.5.0

**Goal.** A wrong answer leads to learning, each child can see themselves improve, and a young player has
a fair share of the game.

**Closes** Q4, Q5, G7. **Size** L. **Depends on** M2, M4. Uses M5's "why" when Claude is on.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| How often should a player get it right? | About three times in four. The current rule settles near half. |
| Roll again after a right answer | Keep it, capped at two extra rolls a turn, so one strong player cannot run the table. |
| Default game length when a player is under 8 | Four wedges ("short game"), six otherwise. |
| After missing the final question | Move back out one space and roll normally next turn. |
| Where progress is kept | On the Studio, per child, so it follows them to any device. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 6.1 Why, every time | After every answer, right or wrong, the card shows and speaks the one-sentence "why". After a miss it comes first, before any extra trivia. | Card change; tests. |
| 6.2 Comeback questions | A missed question returns later for the same player, in this game or the next, marked "Comeback". Getting it right is celebrated and recorded. Spacing: after 3 turns, then next game, then two games later. | Schedule tests. |
| 6.3 Player profiles | Name, age, avatar and history stored on the Studio. The setup screen offers saved players. Ages update on a birthday prompt once a year. | Profile store; tests. |
| 6.4 Difficulty that fits | Replace the two-in-a-row rule with one that aims for the success rate you chose and applies to the very next question. Start each player where they finished last time. | Simulation tests. |
| 6.5 Fair play | The roll-again cap, the short-game default and the final-question rule you chose. Help text updated. | Rule tests; simulations. |
| 6.6 Progress | For each child: stars per topic, "getting better at", "practise next", and comeback wins. A parent view after each game: what was missed, by whom, with the "why". Kept across games; exportable as a file. | Progress screen. |

### Reviews

R1. R2 on the rules, the schedule and the store. R3: two back-to-back games in the browser showing a miss
in game one returning as a comeback in game two. R4: the family plays two games on different days.

### Complete when

- [ ] C6.1 Every answer is followed by a shown and spoken "why", for built-in and Claude questions. Automated.
- [ ] C6.2 Every missed question is offered again to the same player within their next two games. Automated over 100 simulated game pairs.
- [ ] C6.3 Simulated players settle in the chosen band: a struggling player (55% right at the easiest level) ends at 65% or better overall with at least 60% of questions at the easiest level; a middling player ends between 65% and 80%.
- [ ] C6.4 A level change applies to the next question. Automated.
- [ ] C6.5 In 200 simulated games of a 40%-accuracy child against an 85%-accuracy adult with fair-play rules on, the child gets at least 30% of the questions and wins at least 15% of the games.
- [ ] C6.6 A default game with a player under 8 finishes in 60 questions or fewer on average in simulation.
- [ ] C6.7 A profile created on one device appears with its history on another. Automated against a local server.
- [ ] C6.8 The progress screen shows per-topic results and comeback wins for each child, and the history file can be exported.
- [ ] C6.9 R2 reports no open Critical or Major finding.
- [ ] C6.10 After two family games on different days, you report: a comeback question appeared for your son; the progress screen matched what happened; and whether he asked to play again. The first two must be yes. The third is recorded, whatever it is.

---

## M7 · Comfortable for a six-year-old on any screen → 1.6.0

**Goal.** A child who cannot yet read can take a whole turn alone, on the mini or an iPad, by mouse,
touch or keyboard, and the voice reads everything correctly.

**Closes** U1–U4, U6–U12, U14–U18. **Size** L. **Depends on** M2.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| Which devices must work | The Mac mini with a mouse, plus an iPad if the family has one. Tell me the iPad model. |
| Choosing a space on touch | Tap once to see the topic, tap again to go. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 7.1 Reading aloud correctly | Decimals, ranges, scores, abbreviations, blanks, units, fractions and symbols. A phrase list of at least 300 cases as a test, plus every question in the pack checked for split numbers. | `tests/speech.test.js`. |
| 7.2 Speech that always starts | Start speech inside the tap where the browser requires it; a watchdog restarts or falls back when speech does not begin within 2 seconds; keep a reference so Chrome cannot drop it. In the cloud edition, prefer on-device voices and say when a network voice is in use. | Queue tests; device check. |
| 7.3 Everything spoken | Speak the prompts ("roll the die", "pick a glowing space", "roll again", level and wedge news, the final-question explainer). Highlight each answer as it is read. | Tests. |
| 7.4 Safe input | Keys act only when the right thing has focus and ignore key repeat. Answers accept input 400 ms after the card appears. Wider tap tolerance; no page zoom on double tap. | Input tests. |
| 7.5 Touch play | Tap-to-preview with the topic name and icon shown large; the legend stays visible on narrow screens; prompts worded for the device in use. | Touch tests at 375, 768 and 1024 px. |
| 7.6 Sizes and access | Every control at least 44 px at every supported width. Dialogs take, trap and return focus; the question is announced with its choices. A colour-blind-safe palette, and a symbol on every wedge so colour is never the only signal. Reduced motion respected by the banner and the board. | Automated size, contrast and colour checks. |
| 7.7 Graphics housekeeping | Recover from a lost graphics context. Free shapes on rebuild and stop rebuilding on every keystroke. Remember the quality level, allow it to step back up, and base it on more than one threshold. Frame cap at 60. | Leak test over 50 new games. |
| 7.8 Small items | Avatar picker includes all the originals; the reason the AI is off is visible on tap, not only on hover; "How to play" does not reopen every game when storage is blocked; wake lock re-acquired; a time limit on the Studio voice request. | Tests. |

### Reviews

R1. R2 on input, speech and accessibility. R3: a full game by keyboard only; a full game at 768 px wide
by touch emulation. R4: your son takes five turns with nobody reading for him; you note every point he
needed help.

### Complete when

- [ ] C7.1 The 300-phrase speech test passes, and no question in the pack produces a split number or a dropped blank.
- [ ] C7.2 An automated measurement finds zero controls under 44 px at 375, 768, 1024 and 1920 px wide.
- [ ] C7.3 Holding Enter for five seconds at any point in a turn never answers a question. Automated.
- [ ] C7.4 A full game is completed by keyboard only, and one by touch emulation at 768 px, both scripted.
- [ ] C7.5 On touch, every space's topic can be seen before committing. Automated.
- [ ] C7.6 Under simulated colour blindness, any two topic colours differ by at least 20 in Lab distance or carry different symbols; text contrast is at least 4.5 everywhere.
- [ ] C7.7 Every dialog traps focus and returns it; the question is announced before the choices (checked with the accessibility tree).
- [ ] C7.8 After 50 new games in one page, the count of live shapes and textures is within 5% of the count after the first.
- [ ] C7.9 A forced graphics context loss is followed by a working board within 3 seconds.
- [ ] C7.10 R2 reports no open Critical or Major finding.
- [ ] C7.11 Your son completes five turns in a row without anyone reading or clicking for him. Each point where he needed help is fixed, and the check is repeated until the list is empty.
- [ ] C7.12 If an iPad is in scope: the first question is read aloud without an extra tap, checked by you on the device.

---

## M8 · Easy to own → 1.7.0

**Goal.** Setting up, updating, backing up and removing the Studio edition each take a double-click or one
short page of instructions, and nothing is lost along the way.

**Closes** S6, S7, S8, S17, S18. **Size** M. **Depends on** M3, M6.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| Where your settings and data live | `~/Library/Application Support/WedgeQuestStudio`, separate from the program folder, so replacing the program never touches them. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 8.1 Data apart from program | Key, settings, voice model, profiles, saves, budget and reports move to the data folder. The first start of the new version moves existing files across and says what it moved. | Migration tests. |
| 8.2 Set-up helper | `setup.command`: asks for the key without showing it, writes the settings file readable only by you, runs the check, and prints the address for the mini. The settings reader tolerates comments, `export`, quotes and a byte-order mark, and names the line when it cannot read one. Started by hand, it ignores a stray `ANTHROPIC_BASE_URL` unless you ask for it. | Parser tests; helper tests. |
| 8.3 Update helper | `update.command`: takes a new zip, checks its sha256, swaps the program folder, restarts the login item, checks the server answers, and goes back to the old version if it does not. | Update and roll-back tests with a stand-in for macOS's launcher. |
| 8.4 Saved games on the Studio | A game in progress is kept on the server, so any device at any address can continue it. Export and import as a file. | Tests. |
| 8.5 Honest documentation | The README rewritten for the new layout. A test fails if a setting in the code is missing from the README or the example settings file, or the other way round. Sections for updating, backing up and removing everything. Licence texts for the fonts and three.js shipped in the package. | Doc test in `./check`. |

### Reviews

R1. R2: a reviewer re-audits the README line by line against the code, as in the audit. R3: the whole
life cycle in a temporary home folder: install, set up, play, update from 1.6.0, confirm nothing lost,
remove, confirm nothing left. R4: you perform one real update on the Studio following only the README.

### Complete when

- [ ] C8.1 Updating from 1.6.0 to 1.7.0 in a temporary home folder keeps the key, the voice model, every profile and the game in progress. Automated.
- [ ] C8.2 A failed update returns to the previous version and the server answers. Automated.
- [ ] C8.3 The settings reader accepts every case from the audit (comment, `export`, quotes, byte-order mark) or names the faulty line. Automated.
- [ ] C8.4 A game started at the numeric address continues at the `.local` address. Automated.
- [ ] C8.5 The doc test passes, and the README re-audit finds zero mismatches.
- [ ] C8.6 The removal steps leave no file, login item, log or cache behind in the temporary home folder. Automated.
- [ ] C8.7 You complete an update on the Studio in under five minutes using only the README, and tell me where you hesitated. Each hesitation is fixed in the README.

---

## M9 · Release 2.0, both editions in step → 2.0.0

**Goal.** Every audit finding is closed or knowingly deferred, both editions carry the same game, and the
family signs off.

**Closes** P2 and the audit as a whole. **Size** M. **Depends on** everything above.

**Your decisions**

| Decision | Recommended |
| --- | --- |
| Republish the cloud artifact | Yes, once, at the end. It gets the game changes (rules, saving, speech, input, learning on that device) but not the server features. |

### Stages

| Stage | Work | Output |
| --- | --- | --- |
| 9.1 Close-out table | Every finding in the audit listed with the milestone, the test and the commit that closed it, or the reason and your agreement for deferring it. | `docs/audit-closeout.md`. |
| 9.2 Second audit | Three fresh reviewers repeat the audit on 2.0.0 with the same briefs, without seeing the first audit. New findings are triaged; any Critical or Major is fixed before release. | `AUDIT-2.md`. |
| 9.3 Full regression | `./check`; the game, pack and speech simulations; every browser scenario from M2 to M8 against the final package. | Evidence file. |
| 9.4 Cloud edition | Build and, with your go-ahead, republish. Confirm the published page shows 2.0.0. | Published version. |
| 9.5 Family sign-off | Two full games at home on 2.0.0. | Your notes. |

### Reviews

R1. R2 is stage 9.2. R3 is stage 9.3. R4 is stage 9.5.

### Complete when

- [ ] C9.1 The close-out table accounts for all 65 findings; none is "open".
- [ ] C9.2 The second audit has no open Critical or Major finding.
- [ ] C9.3 The full regression passes on the release package, whose sha256 is recorded.
- [ ] C9.4 The Studio and the cloud artifact both show version 2.0.0, or the cloud edition is deferred by your decision.
- [ ] C9.5 Two family games completed on 2.0.0 with no problem you consider serious. Anything you report is fixed or scheduled.
- [ ] C9.6 The project notes list nothing as unverified that could have been verified.

---

## Where each finding is handled

| Area | Findings → milestone |
| --- | --- |
| Project | P1 P5 P6 P7 → M0 · P2 → M0, M9 · P3 → M1 · P4 → M1, M5 |
| Game | G1–G6 → M2 · G7 → M6 |
| Question service | Q1 Q2 Q7 → M2 · Q3 Q8 Q9 → M5 · Q4 Q5 → M6 · Q6 → M4 |
| Built-in pack | B1 B2 B3 → M4 |
| Tests | T1 → M2 · T2 → M2 (JavaScript), M3 (Python) · T3 → M3 |
| Server | S1–S5 S9–S16 → M3 · S6 S7 S8 S17 S18 → M8 |
| Interface and voice | U5 U13 → M2 · U1–U4 U6–U12 U14–U18 → M7 |

## Evidence file template

`docs/milestones/M<n>.md`:

```markdown
# M<n> · <name>

Started: <date>   Closed: <date>   Version: <x.y.z>   Package sha256: <…>

## Complete when
- [x] C<n>.1 <criterion> — evidence: <test name / file / screenshot / your report, with date>
- [ ] C<n>.2 …

## Reviews
- R1 checklist: <date, result>
- R2 independent review: <date, findings and what happened to each>
- R3 scenario run: <date, scenarios, result>
- R4 owner acceptance: <date, what you reported>

## Deferred or changed
<criterion, reason, who decided, date>

## Not verified
<anything that could not be checked, and why>
```

## Decision log

| Date | Decision | By |
| --- | --- | --- |
| 2026-11-10 | Plan written from the audit. All "recommended" entries are proposals until you confirm them at the start of each milestone. | — |
| 2026-11-11 | Project lives in `~/Projects/wedge-quest` on the MacBook. Second copy is the private GitHub repository `butlerbotalfred-beep/Wedge-Quest-`. | Michael |
| 2026-11-11 | Packages go to `packages/`; tracked pages carry the build id `source` and `./release` stamps the commit; Node 22 is the minimum. Reasons in docs/milestones/M0.md. | Claude |
