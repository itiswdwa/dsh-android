#!/bin/sh
# Build the Ubuntu rootfs the app ships: base system + official Node + harness.
#
# Produces build/rootfs-ubuntu/, which assemble_payload.sh then finishes off.
# One-time job, roughly:
#   ubuntu-base  30 MB   https://cdimage.ubuntu.com/ubuntu-base/
#   node tarball 30 MB   https://nodejs.org/dist/
#   npm install  ~500 MB unpacked, trimmed to ~175 MB later
#
# Note on --libc: this script is usually run on a musl host (Alpine), and npm
# otherwise picks optional dependencies for the *host* libc. The guest is glibc,
# so the target platform has to be stated explicitly or sharp/require-builtin
# land in their musl variants and fail at runtime.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD="$ROOT/build"
ROOTFS="$BUILD/rootfs-ubuntu"
UBUNTU_VERSION="${UBUNTU_VERSION:-24.04.5}"
NODE_VERSION="${NODE_VERSION:-22.23.2}"

mkdir -p "$BUILD"

echo "== ubuntu-base $UBUNTU_VERSION =="
if [ ! -d "$ROOTFS" ]; then
  curl -fL --retry 5 -o "$BUILD/ubuntu-base.tar.gz" \
    "https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/ubuntu-base-${UBUNTU_VERSION}-base-arm64.tar.gz"
  mkdir -p "$ROOTFS"
  tar xzf "$BUILD/ubuntu-base.tar.gz" -C "$ROOTFS"
fi
echo "   $(du -sh "$ROOTFS" | cut -f1)"

echo "== official node $NODE_VERSION =="
if [ ! -x "$ROOTFS/usr/local/bin/node" ]; then
  curl -fL --retry 5 -o "$BUILD/node-arm64.tar.xz" \
    "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz"
  xz -t "$BUILD/node-arm64.tar.xz"          # a truncated download is otherwise silent
  tar xJf "$BUILD/node-arm64.tar.xz" -C "$ROOTFS/usr/local" --strip-components=1
fi
# Ship without the 64 MB of C headers: node-gyp fetches its own when needed.
rm -rf "$ROOTFS/usr/local/include"

echo "== harness =="
mkdir -p "$ROOTFS/opt/dsh"
[ -f "$ROOTFS/opt/dsh/package.json" ] || cat > "$ROOTFS/opt/dsh/package.json" <<'EOF'
{ "name": "dsh-sandbox", "private": true, "version": "1.0.0" }
EOF
cd "$ROOTFS/opt/dsh"
HOME="${TMPDIR:-/tmp}/npmhome" npm i --no-audit --no-fund \
  --os=linux --cpu=arm64 --libc=glibc \
  @deepseek-ai/dsh@0.1.7-rc.2 \
  @xterm/xterm@5.5.0 @xterm/addon-fit@0.10.0 @xterm/addon-canvas@0.7.0

# The stock node binary carries debug sections; stripping is worth ~18 MB and
# changes nothing at runtime.
strip --strip-all "$ROOTFS/usr/local/bin/node" 2>/dev/null || true

echo "== done =="
du -sh "$ROOTFS" "$ROOTFS/opt/dsh/node_modules"
echo "next: sh scripts/assemble_payload.sh"
