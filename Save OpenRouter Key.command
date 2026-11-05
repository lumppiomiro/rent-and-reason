#!/bin/zsh
cd "${0:A:h}"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
node setup-openrouter.cjs
read '?Press Return to close.'
