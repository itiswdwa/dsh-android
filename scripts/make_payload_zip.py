#!/usr/bin/env python3
"""Pack the sandbox payload as a zip the app can extract with java.util.zip.

Why zip and not tar.gz: the app used to parse tar itself, and a hand-rolled
reader desynchronised on the 512-byte padding after regular files — which is
exactly the kind of bug that is invisible until it eats a file. java.util.zip is
battle-tested, and a zip entry carries everything a rootfs needs:

  external attributes   unix mode, including S_IFLNK for symlinks and the
                        exec bits the guest needs to run anything
  trailing slash        directories

Entry order matters: a symlink or a file is extracted only after its parent
directory, so writing the archive in sorted order (dirs first, then children)
keeps extraction a single forward pass.

The archive carries content only: Android's java.util.zip.ZipEntry has no
external-attributes accessor (that is an OpenJDK extension), so unix modes and
symlink-ness travel in a sibling manifest — one line per entry, tab separated:

    mode<TAB>path<TAB>link-target      (link-target only for symlinks)

Usage: make_payload_zip.py <rootfs-dir> <out.zip>
"""
from __future__ import annotations

import os
import stat
import sys
import time
import zipfile
from pathlib import Path

S_IFMT = 0o170000
S_IFLNK = 0o120000
S_IFDIR = 0o040000


def external_attr(mode: int) -> int:
    return (mode & 0xFFFF) << 16


def collect(root: Path) -> list[tuple[Path, os.stat_result]]:
    """Every path under root, parents before children.

    Symlinked *directories* need their own pass: os.walk reports them in
    dirnames but, with followlinks=False, never yields them as a dirpath and
    never lists them in filenames — so a merge-style layout (`/bin -> usr/bin`
    on Ubuntu, `/lib`, `/sbin`) would silently ship without /bin at all.
    """
    out: list[tuple[Path, os.stat_result]] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames.sort()
        filenames.sort()
        current = Path(dirpath)
        if current != root:
            out.append((current, os.lstat(current)))
        for name in list(dirnames):
            path = current / name
            if path.is_symlink():
                out.append((path, os.lstat(path)))
                dirnames.remove(name)
        for name in filenames:
            path = current / name
            out.append((path, os.lstat(path)))
    return out


def verify(root: Path, archive_path: Path) -> None:
    """Assert the archive holds every path in the source tree.

    The symlinked-directory bug above was invisible: the payload built, shipped,
    installed, and only failed when PRoot could not find /bin/sh. Cheap
    completeness check beats another round of that.
    """
    import zipfile

    with zipfile.ZipFile(archive_path) as archive:
        packed = {name.rstrip("/") for name in archive.namelist()}

    missing: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        current = Path(dirpath)
        for name in list(dirnames):
            path = current / name
            if path.is_symlink() and path.relative_to(root).as_posix() not in packed:
                missing.append(path.relative_to(root).as_posix())
            if path.is_symlink():
                dirnames.remove(name)
        for name in filenames:
            rel = (current / name).relative_to(root).as_posix()
            if rel not in packed:
                missing.append(rel)

    if missing:
        sys.exit(f"error: {len(missing)} paths missing from the archive, e.g. {missing[:5]}")
    for required in ("bin/sh", "usr/bin/env"):
        probe = root / required
        if not os.path.lexists(probe):
            sys.exit(f"error: source tree has no {required}; is this really a rootfs?")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    entries = collect(root)
    print(f"packing {len(entries)} entries from {root}")
    stored = 0
    linked = 0
    manifest: list[str] = []
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        # The root itself, so extraction creates the destination.
        info = zipfile.ZipInfo(".", date_time=time.localtime()[:6])
        info.external_attr = external_attr(S_IFDIR | 0o755) | 0x10
        archive.writestr(info, b"")

        for path, st in entries:
            rel = path.relative_to(root).as_posix()
            mode = st.st_mode
            if stat.S_ISDIR(mode):
                rel += "/"
                info = zipfile.ZipInfo(rel, date_time=time.localtime(st.st_mtime)[:6])
                info.external_attr = external_attr(mode) | 0x10
                archive.writestr(info, b"")
                continue
            if stat.S_ISLNK(mode):
                target = os.readlink(path)
                info = zipfile.ZipInfo(rel, date_time=time.localtime(st.st_mtime)[:6])
                info.external_attr = external_attr(S_IFLNK | 0o777)
                info.compress_type = zipfile.ZIP_STORED
                archive.writestr(info, target.encode("utf-8"))
                manifest.append(f"{S_IFLNK | 0o777:o}\t{rel}\t{target}")
                linked += 1
                continue
            manifest.append(f"{mode & 0o7777:o}\t{rel}")
            if not stat.S_ISREG(mode):
                # Sockets, fifos and device nodes are recreated by the guest, not
                # shipped: they carry no file content worth extracting.
                continue
            info = zipfile.ZipInfo(rel, date_time=time.localtime(st.st_mtime)[:6])
            info.external_attr = external_attr(mode)
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(path, "rb") as handle:
                archive.writestr(info, handle.read())
            stored += 1

    verify(root, out)

    manifest_path = out.with_suffix(".manifest")
    manifest_path.write_text("\n".join(manifest) + "\n", encoding="utf-8")
    size = out.stat().st_size
    print(f"wrote {out} ({size} bytes): {stored} files, {linked} symlinks, "
          f"{sum(1 for d in entries if stat.S_ISDIR(d[1].st_mode))} dirs")
    print(f"wrote {manifest_path} ({manifest_path.stat().st_size} bytes, {len(manifest)} rows)")


if __name__ == "__main__":
    main()
