#!/usr/bin/env bash
# Regenerate preview.png from live captures of the widget.
#
# Usage: preview/build.sh <before.png> <after.png>
#
# Each argument is a 2x capture of the bar's left section (grim -s 2) showing
# the same theme; the first should have a gap in the workspace numbers and the
# second the compacted sequence. The script crops the menu button off, renders
# preview/poster.html with chromium, and writes preview.png at 1600x1000.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")
work="$here/.work"

before=${1:?2x capture with a gap in the workspace numbers}
after=${2:?2x capture after compaction}

command -v chromium >/dev/null || { echo "chromium is required" >&2; exit 1; }
command -v magick >/dev/null || { echo "ImageMagick (magick) is required" >&2; exit 1; }

mkdir -p "$work"
trap '[[ -f $work/server.pid ]] && kill "$(cat "$work/server.pid")" 2>/dev/null || true' EXIT

# Crop the menu button and the wallpaper strip under the bar, and accept
# either a 1x or a 2x capture by normalising both to the same 764x68 tile.
tile() {
  local source=$1
  local target=$2
  local height
  height=$(magick identify -format '%h' "$source")
  if (( height < 68 )); then
    magick "$source" -crop 382x34+30+0 +repage -resize 200% "$target"
  else
    magick "$source" -crop 764x68+60+0 +repage "$target"
  fi
}

tile "$before" "$work/before.png"
tile "$after" "$work/after.png"

if [[ ! -f $work/wallpaper.jpg ]]; then
  cp "$HOME/.local/state/omarchy/current/theme/backgrounds/1-cosmic.jpg" "$work/wallpaper.jpg"
fi

cp "$here/poster.html" "$work/poster.html"

port=${PREVIEW_PORT:-8793}
pushd "$work" >/dev/null
python3 -m http.server "$port" >/dev/null 2>&1 &
echo $! > server.pid
popd >/dev/null
sleep 0.5

chromium --headless --disable-gpu --hide-scrollbars \
  --window-size=1600,1000 \
  --screenshot="$work/preview.png" \
  "http://127.0.0.1:$port/poster.html" >/dev/null 2>&1

cp "$work/preview.png" "$repo/preview.png"
echo "wrote $repo/preview.png"
