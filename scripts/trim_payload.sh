#!/bin/sh
# Trim an installed dsh npm tree down to what the Android payload needs.
# Usage: trim_payload.sh <node_modules>
#
# Everything removed here is either development-only (type declarations, source
# maps, docs, tests) or a foreign-platform binary. The one *behavioural* removal
# is libreoffice-kit-wasm (145 MB of LibreOffice WASM behind the office skill);
# set DSH_KEEP_OFFICE=1 to keep it. Verify dsh still boots after any change here.
set -e
NM="$1"
[ -d "$NM" ] || { echo "usage: $0 <node_modules>" >&2; exit 1; }

echo "before: $(du -sh "$NM" | cut -f1)"

# --- development artifacts -------------------------------------------------
find "$NM" -name '*.map' -delete
find "$NM" -name '*.d.ts' -delete
find "$NM" -name '*.d.mts' -delete
find "$NM" -name '*.d.cts' -delete
find "$NM" -type d -name 'test' -prune -exec rm -rf {} +
find "$NM" -type d -name 'tests' -prune -exec rm -rf {} +
find "$NM" -type d -name '__tests__' -prune -exec rm -rf {} +
find "$NM" -type d -name 'coverage' -prune -exec rm -rf {} +
find "$NM" -type d -name 'docs' -prune -exec rm -rf {} +
find "$NM" -type d -name 'examples' -prune -exec rm -rf {} +
find "$NM" -type d -name '.github' -prune -exec rm -rf {} +
find "$NM" -name '*.md' -not -name 'LICENSE*' -delete
find "$NM" -name '*.markdown' -delete

# --- foreign-platform binaries --------------------------------------------
# Keep only linux-arm64 payloads; the guest never executes the others.
rm -rf "$NM"/node-pty/prebuilds/darwin-* "$NM"/node-pty/prebuilds/win32-*
rm -rf "$NM"/node-pty/third_party
rm -rf "$NM"/@img/sharp-darwin-* "$NM"/@img/sharp-win32-* "$NM"/@img/sharp-linux-x64 \
       "$NM"/@img/sharp-linuxmusl-x64 "$NM"/@img/sharp-libvips-*x64* \
       "$NM"/@img/sharp-libvips-darwin-* "$NM"/@img/sharp-libvips-win32-* 2>/dev/null || true
rm -rf "$NM"/sherpa-onnx-* 2>/dev/null || true

# --- optional heavyweight payloads ----------------------------------------
if [ "${DSH_KEEP_OFFICE:-0}" != "1" ]; then
  rm -rf "$NM"/@deepseek-ai/libreoffice-kit-wasm/assets
fi

echo "after:  $(du -sh "$NM" | cut -f1)"
