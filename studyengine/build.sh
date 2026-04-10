#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/studyengine"
DIST_DIR="$ROOT_DIR/dist"
mkdir -p "$DIST_DIR"
cat   "$SRC_DIR/css/base.css"   "$SRC_DIR/css/dashboard.css"   "$SRC_DIR/css/session.css"   "$SRC_DIR/css/sidebar.css"   "$SRC_DIR/css/modals.css"   > "$DIST_DIR/.se-styles.css"
cat   "$SRC_DIR/js/utils.js"   "$SRC_DIR/js/fsrs.js"   "$SRC_DIR/js/courses.js"   "$SRC_DIR/js/cards.js"   "$SRC_DIR/js/dragon.js"   "$SRC_DIR/js/sidebar.js"   "$SRC_DIR/js/dashboard.js"   "$SRC_DIR/js/tutor.js"   "$SRC_DIR/js/session.js"   "$SRC_DIR/js/state.js"   > "$DIST_DIR/.se-scripts.js"
sed -e '/__STYLES__/{r '"$DIST_DIR"'/.se-styles.css' -e 'd}'     -e '/__SCRIPTS__/{r '"$DIST_DIR"'/.se-scripts.js' -e 'd}'     "$SRC_DIR/index.html" > "$DIST_DIR/studyengine.html"
rm -f "$DIST_DIR/.se-styles.css" "$DIST_DIR/.se-scripts.js"
echo "Built $DIST_DIR/studyengine.html"
