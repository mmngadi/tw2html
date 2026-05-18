#!/usr/bin/env bash
# Usage:
#   ./inline.sh input.html -o output.html
#   ./inline.sh input.html                # Spits out to stdout
#   cat input.html | ./inline.sh -o -     # Explicit stdout
#   ./inline.sh -o output.html < input.html

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

# --- Default Values ---
OUTPUT_FILE="-" # Default to stdout

# --- Parse Options ---
while getopts "ho:" opt; do
  case "$opt" in
    o) OUTPUT_FILE="$OPTARG" ;;
    h|\?)
      echo "Usage: $0 [input_file] [-o output_file]" >&2
      echo "  -o: Output file path (use '-' or omit for stdout)" >&2
      exit 1
      ;;
  esac
done
shift $((OPTIND - 1))

# Determine input source (remaining positional arg, or stdin)
INPUT_FILE="${1:-_}"

# --- Tmp dir (cleaned up on exit) ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

HTML_IN="$TMP/input.html"
CLASSES_JSON="$TMP/classes.json"
IR_JSON="$TMP/tailwind-ir.json"

# Buffer the input handling both file paths and stdin streams seamlessly
if [ "$INPUT_FILE" = "-" ] || [ "$INPUT_FILE" = "_" ]; then
  cat > "$HTML_IN"
else
  if [ ! -f "$INPUT_FILE" ]; then
    echo "error: input file '$INPUT_FILE' does not exist" >&2
    exit 1
  fi
  cat "$INPUT_FILE" > "$HTML_IN"
fi

# Step 1: Extract class names from HTML
"$BIN_EXTRACT" < "$HTML_IN" > "$CLASSES_JSON"

# Steps 2 & 3: Run from js/ so node_modules resolves correctly
# Subshell '()' keeps the directory change local, avoiding working directory pollution
(
  cd "$JS_DIR"
  # Step 2: Generate CSS for those classes via Tailwind
  node build-ir.js < "$CLASSES_JSON"

  # Step 3: Parse the CSS into IR JSON
  node extract-ir.js "$IR_JSON"
)

# Step 4: Inline styles and direct output based on choice
if [ "$OUTPUT_FILE" = "-" ]; then
  "$BIN_INLINE" "$IR_JSON" < "$HTML_IN"
else
  "$BIN_INLINE" "$IR_JSON" < "$HTML_IN" > "$OUTPUT_FILE"
fi
