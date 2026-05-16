#!/usr/bin/env bash
# Usage:
#   cat input.html | ./inline.sh
#   ./inline.sh < input.html > output.html

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

BIN_EXTRACT="$SCRIPT_DIR/bin/extract"
BIN_INLINE="$SCRIPT_DIR/bin/inline"
JS_DIR="$SCRIPT_DIR/js"

# --- Sanity checks ---
if [ ! -x "$BIN_EXTRACT" ]; then
  echo "error: bin/extract not found. Run: go build -o bin/extract ./cmd/extract" >&2
  exit 1
fi
if [ ! -x "$BIN_INLINE" ]; then
  echo "error: bin/inline not found. Run: go build -o bin/inline ./cmd/inline" >&2
  exit 1
fi
if [ ! -d "$JS_DIR/node_modules" ]; then
  echo "error: js/node_modules not found. Run: cd js && npm install" >&2
  exit 1
fi

# --- Tmp dir (cleaned up on exit) ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

HTML_IN="$TMP/input.html"
CLASSES_JSON="$TMP/classes.json"
IR_JSON="$TMP/tailwind-ir.json"
CSS_OUT="$JS_DIR/out.css"   # build-ir.js always writes here

# Buffer stdin so we can feed it to two separate processes
cat > "$HTML_IN"

# Step 1: Extract class names from HTML
"$BIN_EXTRACT" < "$HTML_IN" > "$CLASSES_JSON"

# Steps 2 & 3: Run from js/ so node_modules resolves correctly
cd "$JS_DIR"

# Step 2: Generate CSS for those classes via Tailwind
node build-ir.js < "$CLASSES_JSON"

# Step 3: Parse the CSS into IR JSON
node extract-ir.js "$IR_JSON"

# Step 4: Inline the styles and strip class attrs
"$BIN_INLINE" "$IR_JSON" < "$HTML_IN"
