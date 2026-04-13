#!/bin/bash
set -euo pipefail

ROOT_DIR="$(pwd)"
SRC_DIR="$ROOT_DIR/studyengine"
DIST_DIR="$ROOT_DIR/dist"

if [[ ! -f "$SRC_DIR/index.html" ]]; then
  echo "Error: run this script from repo root (missing studyengine/index.html)." >&2
  exit 1
fi

mkdir -p "$DIST_DIR"

css_order=(
  "$SRC_DIR/css/base.css"
  "$SRC_DIR/css/dashboard.css"
  "$SRC_DIR/css/session.css"
  "$SRC_DIR/css/sidebar.css"
  "$SRC_DIR/css/modals.css"
)

# Keep JS order exactly as current build pipeline
js_order=(
  "$SRC_DIR/js/utils.js"
  "$SRC_DIR/js/fsrs.js"
  "$SRC_DIR/js/courses.js"
  "$SRC_DIR/js/cards.js"
  "$SRC_DIR/js/dragon.js"
  "$SRC_DIR/js/sidebar.js"
  "$SRC_DIR/js/dashboard.js"
  "$SRC_DIR/js/tutor.js"
  "$SRC_DIR/js/tiers.js"
  "$SRC_DIR/js/session.js"
  "$SRC_DIR/js/state.js"
)

styles_file="$DIST_DIR/.se-styles.css"
scripts_file="$DIST_DIR/.se-scripts.js"

cat "${css_order[@]}" > "$styles_file"
cat "${js_order[@]}" > "$scripts_file"

sed -e '/__STYLES__/{r '"$styles_file" -e 'd}' \
    -e '/__SCRIPTS__/{r '"$scripts_file" -e 'd}' \
    "$SRC_DIR/index.html" > "$DIST_DIR/studyengine.html"

rm -f "$styles_file" "$scripts_file"

# Required explicit copies
cp -f "$ROOT_DIR/core.js" "$DIST_DIR/core.js"
cp -f "$ROOT_DIR/clock.html" "$DIST_DIR/clock.html"
cp -f "$ROOT_DIR/timetable.html" "$DIST_DIR/timetable.html"
cp -f "$ROOT_DIR/quotes.html" "$DIST_DIR/quotes.html"
cp -f "$ROOT_DIR/horizon.html" "$DIST_DIR/horizon.html"

# Copy any other root-level .html/.js/.css/.png files
shopt -s nullglob
for f in "$ROOT_DIR"/*.html "$ROOT_DIR"/*.js "$ROOT_DIR"/*.css "$ROOT_DIR"/*.png; do
  if [[ "$(basename "$f")" == "studyengine.html" ]]; then
    continue
  fi
  cp -f "$f" "$DIST_DIR/$(basename "$f")"
done
shopt -u nullglob

# Copy static assets to dist/ (e.g. horizon dragon PNGs)
if [[ -d "$ROOT_DIR/assets" ]]; then
  rm -rf "$DIST_DIR/assets"
  cp -r "$ROOT_DIR/assets" "$DIST_DIR/assets"
fi

file_count="$(find "$DIST_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')"
total_size="$(du -sh "$DIST_DIR" | awk '{print $1}')"
echo "Build complete: $DIST_DIR ($file_count files, $total_size)"
