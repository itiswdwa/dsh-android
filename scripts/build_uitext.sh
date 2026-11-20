#!/bin/sh
# Build the native text matcher behind `ui where "文字"`.
#
# The matcher renders the characters with the guest's Noto Sans CJK (the same
# family the Android UI uses) and correlates them over a screenshot, so a locate
# costs ~0.3-1 s on a 3200px-wide capture instead of the seconds a JVM/Node
# implementation needs. It is compiled here and shipped as a payload file:
# payload/usr/local/bin/uitext (the hot overlay carries it, no APK rebuild).
#
# Build deps (Debian/Ubuntu guest):
#   apt-get install -y libfreetype-dev libjpeg-dev
#
# Usage: sh scripts/build_uitext.sh [output-path]
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/payload/usr/local/bin/uitext}"
CC="${CC:-gcc}"

"$CC" -O3 -Wall -Wextra \
  -o "$OUT" "$ROOT/native/uitext.c" \
  -I/usr/include/freetype2 -lfreetype -ljpeg -lm

echo "built $OUT"
