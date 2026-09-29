#!/usr/bin/env python3
"""Assemble a signed-ready APK from aapt2 output plus dex and native libs.

Usage: pack_apk.py <aapt2-linked.apk> <out.apk> <entry:path>...

Hand-builds the zip because aapt2 does not align anything and Android cares
about two entries in particular:

  resources.arsc   must be STORED (not deflated) and 4-byte aligned, otherwise
                   Android 11+ refuses the install
  lib/**/*.so      stored and page-aligned so the loader can mmap them; the app
                   also execs one of them, which needs the extracted copy to be
                   byte-identical

Already-compressed payload assets (assets/payload.tar.gz) are stored verbatim,
so the 69 MB payload is never deflated twice.
"""
from __future__ import annotations

import struct
import sys
import time
import zlib
from pathlib import Path

STORE = 0
DEFLATE = 8
UTF8_FLAG = 0x0800


def dos_time(when: float) -> tuple[int, int]:
    t = time.localtime(when)
    date = ((t.tm_year - 1980) << 9) | (t.tm_mon << 5) | t.tm_mday
    clock = (t.tm_hour << 11) | (t.tm_min << 5) | (t.tm_sec // 2)
    return clock, date


def deflate(data: bytes, level: int = 9) -> bytes:
    compressor = zlib.compressobj(level, zlib.DEFLATED, -15)
    return compressor.compress(data) + compressor.flush()


class Entry:
    def __init__(self, name: str, data: bytes, method: int, align: int = 1, mode: int = 0o644):
        self.name = name.encode("utf-8")
        self.data = data
        self.method = method
        self.align = align
        self.mode = mode
        self.crc = zlib.crc32(data) & 0xFFFFFFFF
        self.payload = data if method == STORE else deflate(data)
        self.offset = 0
        self.data_offset = 0


def build(entries: list[Entry], out: Path) -> None:
    now = time.time()
    clock, date = dos_time(now)
    blob = bytearray()
    central = bytearray()

    for entry in entries:
        name_len = len(entry.name)
        extra = b""
        # Pad the local header so the file *data* lands on an alignment boundary.
        head = 30 + name_len
        if entry.align > 1:
            pad = (-(len(blob) + head)) % entry.align
            if pad and pad < 4:
                pad += entry.align
            if pad:
                extra = struct.pack("<HH", 0xFFFF, pad - 4) + b"\0" * (pad - 4)
        entry.offset = len(blob)                      # local header offset (central directory)
        entry.data_offset = len(blob) + head + len(extra)   # where the file bytes start
        version = 20 if entry.method == DEFLATE else 10
        blob += struct.pack("<IHHHHHIIIHH",
                            0x04034B50, version, UTF8_FLAG, entry.method, clock, date,
                            entry.crc, len(entry.payload), len(entry.data),
                            name_len, len(extra))
        blob += entry.name + extra + entry.payload

        central += struct.pack("<IHHHHHHIIIHHHHHII",
                               0x02014B50, (3 << 8) | 20, version, UTF8_FLAG, entry.method,
                               clock, date, entry.crc, len(entry.payload), len(entry.data),
                               name_len, len(extra), 0, 0, 0,
                               (entry.mode & 0xFFFF) << 16, entry.offset)
        central += entry.name + extra

    central_offset = len(blob)
    blob += central
    count = len(entries)
    blob += struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, count, count,
                        len(central), central_offset, 0)
    out.write_bytes(bytes(blob))


def load_aapt2(path: Path) -> list[Entry]:
    import zipfile

    entries: list[Entry] = []
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            data = archive.read(info.filename)
            if info.filename == "resources.arsc":
                entries.append(Entry(info.filename, data, STORE, align=4))
            elif info.filename.endswith(".so"):
                entries.append(Entry(info.filename, data, STORE, align=4096))
            else:
                entries.append(Entry(info.filename, data, DEFLATE))
    return entries


def make_entry(spec: str) -> Entry:
    name, _, raw = spec.partition(":")
    path = Path(raw)
    if not path.is_file():
        sys.exit(f"no such file: {path}")
    if name.endswith(".so"):
        return Entry(name, path.read_bytes(), STORE, align=4096, mode=0o755)
    if name.endswith(".gz"):
        return Entry(name, path.read_bytes(), STORE, mode=0o644)
    return Entry(name, path.read_bytes(), DEFLATE)


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    linked = Path(sys.argv[1])
    out = Path(sys.argv[2])
    entries = load_aapt2(linked)
    for spec in sys.argv[3:]:
        entries.append(make_entry(spec))
    out.parent.mkdir(parents=True, exist_ok=True)
    build(entries, out)
    print(f"packed {out} ({out.stat().st_size} bytes, {len(entries)} entries)")
    for entry in entries:
        if entry.align > 1:
            assert entry.data_offset % entry.align == 0, entry.name
            print(f"  aligned  {entry.name.decode()} @ {entry.data_offset} (align {entry.align})")


if __name__ == "__main__":
    main()
