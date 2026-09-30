#!/usr/bin/env python3
"""The project's version model, in one place.

A version has three parts, because the three change for different reasons and
travel through different channels:

    apk       1.1.5      the shell — Java, resources, and what the bundled
                         payload is built from. Installed by re-installing the
                         APK.
    terminal  2          the runtime inside the sandbox — rootfs, node, dsh and
                         the tools installed into it. This number does NOT move
                         when the apk version moves: they are independent, and a
                         shell release that does not touch the runtime keeps the
                         same terminal number.
    hot       0          packages applied over an already-installed shell (the
                         plugin, skills, guest scripts). 0 means none.

Written together a version reads `1.1.5-t2-sp0`. Every place that renders,
compares or tracks a version goes through this module, so the pieces cannot
drift into different spellings.

Files, all at the repository root and committed:

    VERSION           the apk version
    ROOTFS_VERSION    the terminal version
    HOT               the last hot package built here: {app, terminal, sp, hash}

Usage: version.py [--root DIR] [--field app|terminal|sp|full|code|tag]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

TRACKER = "HOT"


def _read_number(path: Path, fallback: str) -> str:
    if not path.is_file():
        return fallback
    text = path.read_text(encoding="utf-8").strip()
    return text or fallback


def read(root: Path) -> dict:
    """The current version as its parts, plus the composed strings."""
    app = _read_number(root / "VERSION", "0.0.0")
    terminal = _read_number(root / "ROOTFS_VERSION", "1")
    tracker: dict = {}
    if (root / TRACKER).is_file():
        try:
            tracker = json.loads((root / TRACKER).read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            tracker = {}
    # A tracker written for a different app or terminal line says nothing about
    # this one: the hot sequence restarts with each line.
    current_line = tracker.get("app") == app and str(tracker.get("terminal", "")) == terminal
    sp = int(tracker.get("sp", 0)) if current_line else 0
    return {
        "app": app,
        "terminal": terminal,
        "sp": sp,
        "hot": hot_version(app, terminal, sp),
        "full": full_version(app, terminal, sp),
        "core": f"{app}-t{terminal}",
        "code": version_code(app),
        "tag": f"v{app}",
    }


def hot_version(app: str, terminal: str, sp: int) -> str:
    """What a hot package calls itself: the line it belongs to, plus its number."""
    return f"{app}-t{terminal}-sp{sp}"


def full_version(app: str, terminal: str, sp: int) -> str:
    """What the app displays: apk, terminal, hot — with sp0 spelled out."""
    return f"{app}-t{terminal}-sp{sp}"


def version_code(app: str) -> int:
    code = 0
    for part in app.split(".")[:3]:
        code = code * 100 + int(part)
    return code


def main() -> None:
    options = sys.argv[1:]
    root = Path(options[options.index("--root") + 1]) if "--root" in options \
        else Path(__file__).resolve().parent.parent
    field = options[options.index("--field") + 1] if "--field" in options else "full"
    values = read(root)
    if field not in values:
        sys.exit(f"未知字段 {field}（可用：{'、'.join(values)}）")
    print(values[field])


if __name__ == "__main__":
    main()
