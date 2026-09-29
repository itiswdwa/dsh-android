#!/usr/bin/env python3
"""Bundle the files that must be updatable without re-installing the sandbox.

The payload archive is versioned by content hash, so every tweak to the plugin
or to a guest script used to force the app to unpack ~400 MB again. Those files
are tiny and live at fixed paths, so they travel separately as assets/hot.zip and
are re-applied on every launch:

    opt/dsh/android/pty-server.mjs          guest-side terminal endpoint
    opt/dsh/android/start-dsh.sh            guest entry point
    opt/dsh/dsh-plugin-android/**           the harness plugin (prompt, UI)

Only a *rootfs* change (a package, node, a patched dependency) still needs the
full payload. The file is deliberately small enough to keep in the APK verbatim.

Usage: make_hot_zip.py <repo-root> <out.zip>
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import zipfile
from pathlib import Path

# Prefixes an external package may write to. Anything else is refused: a hot
# package is executable content, and "it came from the user" is not the same as
# "it may drop files anywhere in the guest".
ALLOWED_PREFIXES = (
    "opt/dsh/android/",
    "opt/dsh/dsh-plugin-android/",
    "etc/",
    "@home/",
)


def add_file(archive: zipfile.ZipFile, source: Path, arcname: str) -> int:
    if not source.is_file():
        return 0
    info = zipfile.ZipInfo(arcname, date_time=(2026, 1, 1, 0, 0, 0))
    info.external_attr = (0o755 if name_is_executable(source) else 0o644) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, source.read_bytes())
    return 1


def name_is_executable(path: Path) -> bool:
    return path.suffix == ".sh" or path.name == "shiz" or os.access(path, os.X_OK)


def add_tree(archive: zipfile.ZipFile, root: Path, prefix: str) -> int:
    count = 0
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = [d for d in dirnames if d != "node_modules" or dirpath != str(root)]
        for name in sorted(filenames):
            path = Path(dirpath) / name
            rel = path.relative_to(root).as_posix()
            count += add_file(archive, path, f"{prefix}/{rel}")
    return count


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    digest = hashlib.sha256(out.name.encode("utf-8"))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in ("start-dsh.sh", "pty-server.mjs"):
            written += add_file(archive, root / "payload" / "opt" / "dsh" / "android" / name,
                                f"opt/dsh/android/{name}")
        # Distro files we deliberately adjust (see payload/etc/): applied on every
        # launch so a fix here does not force a 400 MB payload re-extraction.
        written += add_tree(archive, root / "payload" / "etc", "etc")
        # guest home files (skills, instructions): "@home/" maps to the guest's
        # /root, which is a bind mount the rootfs cannot reach.
        written += add_tree(archive, root / "payload" / "home", "@home")
        # ...and the plugin a second time, at the path the *profile* resolves it
        # from. The app can write there directly (same filesystem, no PRoot), so
        # a plugin update no longer depends on the guest-side copy step.
        written += add_tree(archive, root / "plugin" / "dsh-plugin-android",
                            "@home/.dsh/profiles/web/node_modules/dsh-plugin-android")
        written += add_tree(archive, root / "plugin" / "dsh-plugin-android", "opt/dsh/dsh-plugin-android")
    # Stamp the package so a receiver can tell whether it is newer than what it
    # already applied. Written last, so its hash covers the payload files too.
    digest = hashlib.sha256()
    with zipfile.ZipFile(out) as archive:
        for name in sorted(archive.namelist()):
            digest.update(name.encode("utf-8"))
            digest.update(archive.read(name))
    version = digest.hexdigest()[:16]
    with zipfile.ZipFile(out, "a", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(zipfile.ZipInfo("hot.json", date_time=time.localtime()[:6]),
                         json.dumps({"version": version, "files": written,
                                     "built": time.strftime("%Y-%m-%dT%H:%M:%S")}, indent=2))
    print(f"wrote {out} ({out.stat().st_size} bytes, {written} files, version {version})")


if __name__ == "__main__":
    main()
