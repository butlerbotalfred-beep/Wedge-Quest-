# Changelog

Every version that has shipped, newest first, in plain words. The version of a running game is at the
foot of the game menu; the server prints the same line when it starts.

## 1.0.1 · 11 November 2026

Nothing about how the game plays has changed. This version makes the project safe to own.

- **The game says which build it is.** The foot of the game menu shows the version, the date and a
  short build id, for example `Wedge Quest 1.0.1 · 11 Nov 2026 · abc1234`. The server reports the same
  three values at `/api/status` and prints them when it starts.
- **The server warns about a mixed install.** If `www/index.html` and `server.py` come from different
  packages, the start-up text says so and names both.
- **One command checks everything:** `./check` runs every test and confirms the shipped pages are
  exactly what the source builds.
- **One command builds the package:** `./release` runs the check, then writes
  `WedgeQuest-Studio-<version>.zip` for the Studio and `WedgeQuest-Cloud-<version>.html` for the cloud
  artifact, each with its checksum. The same commit always gives the same files.
- `./start.command --version` and `--check` now print the date and build id as well as the version.
- The log tidy-up in `service.sh` no longer depends on a macOS-only command.
- Node 22 or newer is required to build and test; the scripts say so plainly on anything older.
- Removed leftovers: the `zip-share/` folder, its launch entry and the hand-made zip.

## 1.0.0 with the hub fix · 28 October 2026

Tagged `v1.0.0-hubfix`. Shipped as a replacement `WedgeQuest-Studio.zip`, still calling itself 1.0.0.

- **A piece can cross the hub.** Before, the middle of the board blocked every route through it.
  Now a roll can pass over the hub; a piece can only stop there once it holds every wedge.

## 1.0.0 · 28 October 2026

The first Studio package: the game served from a Mac at home to every device on the network, with
questions written by Claude through a key that stays on the server, and questions read aloud by a
voice model running on the Mac. The cloud artifact (published the same day) is the same game without
the server.
