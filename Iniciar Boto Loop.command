#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

if [[ ! -d node_modules ]]; then
  npm install
fi

exec npm start
