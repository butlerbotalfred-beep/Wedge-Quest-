#!/bin/bash
# Wedge Quest Studio: double-click this file to start the game server.
# Run it from Terminal instead to pass options, for example:  ./start.command --local
cd "$(dirname "$0")" || exit 1

find_uv() {
  command -v uv 2>/dev/null && return
  for p in "$HOME/.local/bin/uv" /opt/homebrew/bin/uv /usr/local/bin/uv "$HOME/.cargo/bin/uv"; do
    if [ -x "$p" ]; then echo "$p"; return; fi
  done
}

UV="$(find_uv)"
if [ -z "$UV" ]; then
  echo
  echo "Wedge Quest Studio needs a small free tool called uv (it sets up Python for you)."
  echo "Install it with ONE of these commands in Terminal, then open this file again:"
  echo
  echo "    brew install uv"
  echo "    curl -LsSf https://astral.sh/uv/install.sh | sh"
  echo
  read -r -p "Press Return to close."
  exit 1
fi

OPEN="--open"
if [ -n "$WQ_NO_OPEN" ]; then OPEN=""; fi

"$UV" run --script server.py $OPEN "$@"
code=$?
if [ $code -ne 0 ]; then
  echo
  echo "The server stopped (exit code $code)."
  read -r -p "Press Return to close."
fi
exit $code
