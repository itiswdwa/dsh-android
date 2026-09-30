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

Usage: make_hot_zip.py <repo-root> <out.zip> [--base]

The version a user sees is `<app>-sp<n>` (app version from VERSION, n from the
committed HOT tracker), or plain `<app>` when the package is the base an app
build bakes in — `--base` selects that branch for a new app version.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
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

# Where the last package this tree produced is recorded: `{app, sp, hash}`.
# Committed, because the sequence number has to survive across machines and
# sessions — recomputing it from the network would double-bump on a retry.
TRACKER = "HOT"


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


def read_tracker(root: Path) -> dict:
    """The last hot package this tree produced, or an empty record."""
    path = root / TRACKER
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def next_sp(root: Path, app: str, digest: str, base: bool) -> int:
    """The sequence number for the package about to be written.

    The version a user reads is `<app>-sp<n>`, so the number has to be stable for
    identical content (a rebuild must not bump it and re-prompt every device) and
    monotonic for changed content (a lower number would look like a downgrade and
    the app's "already applied" check would skip the update).

      same app, same payload   -> keep the number it already has
      same app, new payload    -> the next number
      new app version          -> 1 for a hot package, 0 for the base an app
                                  build bakes in (which is published as plain
                                  `<app>`, because it has no hot update yet)
    """
    tracker = read_tracker(root)
    if tracker.get("app") == app and tracker.get("hash") == digest:
        return int(tracker.get("sp", 0))
    if tracker.get("app") != app:
        return 0 if base else 1
    return int(tracker.get("sp", 0)) + 1


def write_tracker(root: Path, app: str, sp: int, digest: str) -> None:
    (root / TRACKER).write_text(json.dumps({
        "app": app,
        "sp": sp,
        "version": hot_version(app, sp),
        "hash": digest,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def hot_version(app: str, sp: int) -> str:
    return app if sp <= 0 else f"{app}-sp{sp}"


def main() -> None:
    args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
    base = "--base" in sys.argv
    if len(args) != 2:
        sys.exit(__doc__)
    root = Path(args[0]).resolve()
    out = Path(args[1]).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    app = (root / "VERSION").read_text(encoding="utf-8").strip()

    # The guest-side link()/chown() shim is a built artefact that must never be
    # stale or absent: without it apt/dpkg fail inside the sandbox. Build it
    # here so any path that can produce a package produces it correctly.
    build = root / "scripts" / "build_linkfix.sh"
    if build.is_file():
        subprocess.run(["sh", str(build)], check=True)

    written = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        # The whole guest-side service directory: the entry script, the PTY
        # service, and the link()/chown() shim with its source. Listing files
        # one by one here is exactly how a new one ends up missing from a
        # package, so the directory travels as a unit.
        written += add_tree(archive, root / "payload" / "opt" / "dsh" / "android", "opt/dsh/android")
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
    # Content identity for the tracker and for the app's own logging. Computed
    # before hot.json exists, so stamping the version cannot change it.
    digest = hashlib.sha256()
    with zipfile.ZipFile(out) as archive:
        for name in sorted(archive.namelist()):
            digest.update(name.encode("utf-8"))
            digest.update(archive.read(name))
    content = digest.hexdigest()[:16]
    sp = next_sp(root, app, content, base)
    version = hot_version(app, sp)
    with zipfile.ZipFile(out, "a", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(zipfile.ZipInfo("hot.json", date_time=time.localtime()[:6]),
                         json.dumps({"version": version, "app": app, "sp": sp, "hash": content,
                                     "files": written,
                                     "built": time.strftime("%Y-%m-%dT%H:%M:%S")}, indent=2))
    write_tracker(root, app, sp, content)
    print(f"wrote {out} ({out.stat().st_size} bytes, {written} files, version {version}, content {content})")


if __name__ == "__main__":
    main()
