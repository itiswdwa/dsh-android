#!/bin/sh
# Build the guest-side link()/chown() compatibility shim (payload/.../linkfix.c).
#
# The result is *preloaded* into every dynamically linked process in the guest,
# so two properties matter more than speed:
#
#   * it must be an aarch64 shared object — the guest is arm64, and a build host
#     that is not would silently produce something that cannot load;
#   * it must have no libc dependency, or a symbol glibc cannot resolve would
#     fail the preload for every program in the sandbox. gcc -nostdlib gives
#     exactly that: the shim only makes raw syscalls.
#
# Usage: build_linkfix.sh [--check]   (--check only verifies an existing build)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/payload/opt/dsh/android/linkfix.c"
OUT="$ROOT/payload/opt/dsh/android/liblinkfix.so"

verify() {
  python3 - "$OUT" <<'PY'
import struct, sys
from pathlib import Path

path = Path(sys.argv[1])
data = path.read_bytes()
if data[:4] != b"\x7fELF" or data[4] != 2 or data[5] != 1:
    sys.exit(f"{path.name}: not a 64-bit little-endian ELF")
if struct.unpack_from("<H", data, 18)[0] != 0xB7:
    sys.exit(f"{path.name}: not an AArch64 object (e_machine={struct.unpack_from('<H', data, 18)[0]:#x})")

# Walk the program headers for PT_DYNAMIC, then the dynamic entries for
# DT_NEEDED: any entry here is a library the guest's loader must find.
phoff, phentsize, phnum = struct.unpack_from("<Q", data, 32)[0], struct.unpack_from("<H", data, 54)[0], struct.unpack_from("<H", data, 56)[0]
dynamic = None
for index in range(phnum):
    entry = phoff + index * phentsize
    if struct.unpack_from("<I", data, entry)[0] == 2:  # PT_DYNAMIC
        dynamic = struct.unpack_from("<Q", data, entry + 8)[0]
if dynamic is not None:
    needed = []
    cursor = dynamic
    while True:
        tag, value = struct.unpack_from("<QQ", data, cursor)
        if tag == 0:
            break
        if tag == 1:
            needed.append(value)
        cursor += 16
    if needed:
        sys.exit(f"{path.name}: depends on {len(needed)} shared object(s); it must be self-contained")

print(f"linkfix: {path.name} is a self-contained aarch64 shared object ({len(data)} bytes)")
PY
}

if [ "${1:-}" = "--check" ]; then
  [ -f "$OUT" ] || { echo "linkfix: $OUT not built yet" >&2; exit 1; }
  verify
  exit 0
fi

[ -f "$SRC" ] || { echo "linkfix: missing $SRC" >&2; exit 1; }
if [ -f "$OUT" ] && [ "$OUT" -nt "$SRC" ]; then
  echo "linkfix: $OUT is up to date ($(wc -c < "$OUT") bytes)"
  exit 0
fi

command -v gcc >/dev/null || {
  echo "linkfix: need gcc to build $OUT (the release paths must not ship a stale or missing shim)" >&2
  exit 1
}

# -nostdlib -nostartfiles: nothing from the host libc is linked in, which is what
# keeps the object loadable inside the guest's glibc.
gcc -O2 -fPIC -shared -nostdlib -nostartfiles -fno-stack-protector \
  -fno-asynchronous-unwind-tables -Wl,-s -o "$OUT" "$SRC"

verify
