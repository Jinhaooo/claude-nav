#!/usr/bin/env bash
# Package claude-nav into a zip ready for the Chrome Web Store.
set -euo pipefail

cd "$(dirname "$0")"

OUT="claude-nav.zip"
rm -f "$OUT"

zip -r "$OUT" . \
  -x "*.git*" \
  -x "screenshots/*" \
  -x "build.sh" \
  -x "*.zip" \
  -x "node_modules/*" \
  -x ".DS_Store" \
  -x "Thumbs.db" \
  -x ".vscode/*" \
  -x ".idea/*"

echo "Built $OUT"
