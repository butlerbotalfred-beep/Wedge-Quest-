#!/bin/bash
# Wedge Quest Studio: have the game start by itself whenever you log in to this Mac.
# Double-click this file for a short menu, or run it from Terminal:
#   ./autostart.command install | status | restart | stop | remove      (install --allow-sleep lets the Mac sleep as usual)
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

if [ $# -eq 0 ]; then set -- menu; fi
"$UV" run --script server.py --autostart "$@"
code=$?
if [ $code -ne 0 ] && [ -t 0 ]; then
  echo
  read -r -p "Press Return to close."
fi
exit $code
