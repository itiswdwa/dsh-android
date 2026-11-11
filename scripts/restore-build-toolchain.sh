#!/bin/sh
# restore-build-toolchain.sh — bring back everything build_apk.sh needs.
#
# Needed because a payload update replaces the whole runtime: apt-installed tools and
# everything under /tmp disappear, and this project's build toolchain lives in both
# places (HANDOFF §4.1d). Run this after installing a new APK on a device you build on.
#
# What it restores:
#   apt     JDK 21 (javac/keytool), librsvg2-bin (icons), python3-pil (render_icon),
#           qemu-user + the x86_64 cross loader/libgcc (aapt2 is an x86_64 binary),
#           python3-yaml (workflow lint). gcc only if build_linkfix needs to rebuild
#           (qemu-user-static is ~100MB more for no gain here).
#   /tmp    android.jar (platform 36), r8.jar (d8), apksig.jar, aapt2
#   /opt/android/root64   the QEMU_LD_PREFIX tree build_apk.sh expects
#
# Not restored here: libproot.so — that comes from the release asset via
# scripts/fetch-proot.sh, and PROOT= must point at it.
#
# Usage: sh scripts/restore-build-toolchain.sh
set -eu

ANDROID_JAR_DIR=/tmp/platform/android-35
AAPT2_DIR=/tmp/aapt2dir
R8_VERSION=9.5.26
APKSIG_VERSION=9.4.1
AAPT2_VERSION=9.4.1-15978811
MIRROR=http://mirrors.aliyun.com/ubuntu-ports/

echo "== apt 源（ports.ubuntu.com 从这台机器只有 ~2MB/min，换镜像后 ~9MB/min）"
python3 - "$MIRROR" <<'PY'
import glob, pathlib, re, sys
mirror = sys.argv[1]
for name in glob.glob("/etc/apt/sources.list.d/*.sources") + ["/etc/apt/sources.list"]:
    path = pathlib.Path(name)
    if not path.exists():
        continue
    text = path.read_text()
    new = re.sub(r"https?://(?:ports\.|(?:archive|security)\.)?ubuntu\.com/(?:ubuntu-ports|ubuntu)/?", mirror, text)
    if new != text:
        path.write_text(new)
        print(f"  改写 {name}")
PY

echo "== apt 安装（JDK / librsvg / PIL / gcc / qemu / 交叉 libc / yaml）"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=8 -y install \
  openjdk-21-jdk-headless librsvg2-bin python3-pil qemu-user \
  libc6-amd64-cross libgcc-s1-amd64-cross python3-yaml >/dev/null

echo "== 安卓 SDK 组件（JAR/二进制，都是 /tmp 里的）"
mkdir -p "$ANDROID_JAR_DIR" "$AAPT2_DIR"
if [ ! -f "$ANDROID_JAR_DIR/android.jar" ]; then
  curl -sSL --retry 5 -o /tmp/platform-35.zip \
    https://dl.google.com/android/repository/platform-35_r02.zip
  python3 - <<'PY'
import os, zipfile
z = zipfile.ZipFile("/tmp/platform-35.zip")
name = [n for n in z.namelist() if n.endswith("android.jar")][0]
os.makedirs("/tmp/platform/android-35", exist_ok=True)
with z.open(name) as src, open("/tmp/platform/android-35/android.jar", "wb") as dst:
    dst.write(src.read())
print("  android.jar ok")
PY
fi
[ -f /tmp/r8.jar ] || curl -sSL --retry 5 -o /tmp/r8.jar \
  "https://dl.google.com/dl/android/maven2/com/android/tools/r8/$R8_VERSION/r8-$R8_VERSION.jar"
[ -f /tmp/apksig.jar ] || curl -sSL --retry 5 -o /tmp/apksig.jar \
  "https://dl.google.com/dl/android/maven2/com/android/tools/build/apksig/$APKSIG_VERSION/apksig-$APKSIG_VERSION.jar"
if [ ! -f "$AAPT2_DIR/aapt2" ]; then
  curl -sSL --retry 5 -o /tmp/aapt2.jar \
    "https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/$AAPT2_VERSION/aapt2-$AAPT2_VERSION-linux.jar"
  python3 - <<'PY'
import pathlib, zipfile
z = zipfile.ZipFile("/tmp/aapt2.jar")
pathlib.Path("/tmp/aapt2dir").mkdir(parents=True, exist_ok=True)
target = pathlib.Path("/tmp/aapt2dir/aapt2")
with z.open("aapt2") as src, open(target, "wb") as dst:
    dst.write(src.read())
target.chmod(0o755)
print("  aapt2 ok (x86_64, 由 build_apk.sh 用 qemu 跑)")
PY
fi

echo "== QEMU_LD_PREFIX 树（build_apk.sh 里写死 /opt/android/root64）"
mkdir -p /opt/android/root64/lib64 /opt/android/root64/usr/lib /opt/android/root64/lib
ln -sf /usr/x86_64-linux-gnu/lib/ld-linux-x86-64.so.2 /opt/android/root64/lib64/ld-linux-x86-64.so.2
ln -sfn /usr/x86_64-linux-gnu/lib /opt/android/root64/usr/lib/x86_64-linux-gnu
ln -sfn /usr/x86_64-linux-gnu/lib /opt/android/root64/lib/x86_64-linux-gnu
ln -sf /usr/bin/qemu-x86_64-static /usr/bin/qemu-x86_64

echo "== 自检"
javac -version
rsvg-convert --version
python3 -c "from PIL import Image; print('PIL ok')"
QEMU_LD_PREFIX=/opt/android/root64 qemu-x86_64 "$AAPT2_DIR/aapt2" version | head -1
ls -l "$ANDROID_JAR_DIR/android.jar" /tmp/r8.jar /tmp/apksig.jar | awk '{print "  ", $5, $9}'
echo "== 完成（libproot.so 用: sh scripts/fetch-proot.sh；出包时 PROOT=\$PWD/build/proot/libproot.so）"
