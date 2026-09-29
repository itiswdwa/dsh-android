#!/bin/sh
# Assemble the payload that ships inside the APK as assets/payload.tar.gz.
#
# Inputs:
#   build/rootfs-ubuntu/     Ubuntu + official Node + (trimmed) dsh, prepared
#                            by the earlier steps of the payload build
#   payload/                 this repo's overlay: PTY service, entry script,
#                            shiz CLI, plugin
#   plugin/dsh-plugin-android/
#   profile/                 the pre-seeded dsh profile (plugin preinstalled)
# Output:
#   build/payload-assets/payload.tar.gz
#
# The app unpacks this itself with java.util.zip, so the archive is a plain zip
# plus a manifest carrying modes and symlink targets.
set -eu

ROOT=/var/minis/workspace/dsh-android
BUILD="$ROOT/build"
ROOTFS="${DSH_ROOTFS:-$BUILD/rootfs}"
ASSETS="$BUILD/payload-assets"

[ -d "$ROOTFS" ] || { echo "no $ROOTFS — build the rootfs first" >&2; exit 1; }

echo "== overlay / =="
cp -a "$ROOT/payload/." "$ROOTFS/"
chmod +x "$ROOTFS/opt/dsh/android/start-dsh.sh" "$ROOTFS/usr/local/bin/shiz"
chmod 755 "$ROOTFS/opt/dsh/android"

echo "== guest home (skills, instructions) =="
[ -d "$ROOT/payload/home" ] && cp -a "$ROOT/payload/home/." "$ROOTFS/opt/dsh/dsh-home-seed/"

echo "== plugin =="
rm -rf "$ROOTFS/opt/dsh/dsh-plugin-android"
cp -a "$ROOT/plugin/dsh-plugin-android" "$ROOTFS/opt/dsh/dsh-plugin-android"
# The profile resolves the plugin from its own node_modules; a real copy keeps
# the payload free of symlinks that a tar round-trip would have to preserve.
# The profile ships under /opt (immutable payload), NOT under /root: the app
# bind-mounts app storage onto /root, which would hide anything staged there.
SEED="$ROOTFS/opt/dsh/dsh-home-seed"
mkdir -p "$SEED/profiles/web/node_modules"
cp -a "$ROOT/profile/." "$SEED/profiles/web/"
rm -rf "$SEED/profiles/web/node_modules/dsh-plugin-android"
cp -a "$ROOT/plugin/dsh-plugin-android" "$SEED/profiles/web/node_modules/dsh-plugin-android"

echo "== dsh source patches =="
python3 "$ROOT/patches/apply-hardlink-patch.py" "$ROOTFS/opt/dsh/node_modules"

echo "== sanity =="
for f in opt/dsh/android/pty-server.mjs \
         opt/dsh/android/start-dsh.sh \
         opt/dsh/node_modules/node-pty/prebuilds/linux-arm64/pty.node \
         opt/dsh/node_modules/@xterm/xterm/lib/xterm.js \
         opt/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/android-mobile.css \
         opt/dsh/node_modules/node-addon-require-builtin/lib/index.js \
         usr/local/bin/node bin/bash \
         usr/local/bin/node \
         opt/dsh/dsh-home-seed/profiles/web/cordis.patch.yml \
         opt/dsh/dsh-home-seed/profiles/web/node_modules/dsh-plugin-android/lib/client.js \
         usr/local/bin/shiz bin/bash; do
  [ -e "$ROOTFS/$f" ] || { echo "MISSING: $f" >&2; exit 1; }
done
echo "   all expected files present"

mkdir -p "$ASSETS"
