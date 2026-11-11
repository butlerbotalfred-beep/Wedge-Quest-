#!/bin/bash
# Run by macOS (launchd) when you log in, once ./autostart.command install has set that up.
# Not for double-clicking: use start.command for that. Everything this prints goes to
# ~/Library/Logs/WedgeQuestStudio/server.log
cd "$(dirname "$0")" || exit 1

LOG="${WQ_LOG_FILE:-$HOME/Library/Logs/WedgeQuestStudio/server.log}"
mkdir -p "$(dirname "$LOG")"
# Keep the log small: past 2 MB the old one becomes server.log.1 and a fresh one starts.
if [ -f "$LOG" ] && [ "$(stat -f %z "$LOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
  mv -f "$LOG" "$LOG.1"
fi
exec >>"$LOG" 2>&1
echo
echo "---- $(date '+%Y-%m-%d %H:%M:%S')  starting at login ----"

# macOS starts programs like this with almost no PATH.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin"
UV="$(command -v uv)"
if [ -z "$UV" ]; then
  echo "Could not find uv. Install it (brew install uv); macOS tries again in a few seconds."
  exit 1
fi

# Keep this Mac from sleeping for as long as the game is running; the screen can still turn off.
# caffeinate lets go by itself when this process ends.
if [ "$WQ_ALLOW_SLEEP" != "1" ] && command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i -w $$ &
fi

# Use the packages already on this Mac when possible, so the game also starts with the internet down.
OFFLINE=""
if "$UV" run --offline --script server.py --version >/dev/null 2>&1; then OFFLINE="--offline"; fi
exec "$UV" run $OFFLINE --script server.py
