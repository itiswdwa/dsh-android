#!/bin/sh
# Export the Android tool paths scripts/build_apk.sh expects, from $ANDROID_HOME.
#
# Sourced by the CI workflow (`. scripts/ci_android_env.sh`) rather than set in the
# workflow's `env:` block, because `android-actions/setup-android` exports
# ANDROID_HOME at *runtime*: `${{ env.ANDROID_HOME }}` is evaluated when the
# workflow is parsed and would be empty. Shell expansion is unambiguous.
#
# Every path is still overridable, and nothing here is required when the caller
# passes its own ANDROID_JAR/AAPT2/D8 — a local build keeps using /tmp.
set -eu

: "${ANDROID_HOME:?setup-android did not export ANDROID_HOME}"

ANDROID_JAR="${ANDROID_JAR:-$ANDROID_HOME/platforms/android-35/android.jar}"
AAPT2="${AAPT2:-$ANDROID_HOME/build-tools/35.0.0/aapt2}"
D8="${D8:-$ANDROID_HOME/build-tools/35.0.0/lib/d8.jar}"
APKSIG="${APKSIG:-/tmp/apksig.jar}"
PROOT="${PROOT:-$PWD/build/proot/libproot.so}"
# Cross compiler for liblinkfix.so: the guest is aarch64 and a runner is x86_64.
CC="${CC:-aarch64-linux-gnu-gcc}"

for required in "$ANDROID_JAR" "$AAPT2" "$D8"; do
  [ -f "$required" ] || { echo "ci_android_env: 缺少 $required（SDK 装少了？）" >&2; exit 1; }
done

export ANDROID_JAR AAPT2 D8 APKSIG PROOT CC
echo "ci_android_env: aapt2=$AAPT2"
echo "ci_android_env: android.jar=$ANDROID_JAR"
