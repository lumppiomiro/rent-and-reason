#!/bin/zsh
cd "${0:A:h}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null; then
  print 'Install Node.js 22 or newer from https://nodejs.org, then try again.'
  read '?Press Return to close.'
  exit 1
fi
node launch.cjs
read '?Press Return to close.'
