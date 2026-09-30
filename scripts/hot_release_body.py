#!/usr/bin/env python3
"""Compose the release body for a hot-package publish.

A release body carries two things: the notes of the app version it ships (written
once, by release.sh) and the notes of the hot package currently attached. Only the
second changes per publish, so it lives after a marker and is replaced wholesale —
appending would stack a new section on every push.

Both halves come from CHANGELOG.md (via release_notes.py); nothing here invents
copy. A missing section is allowed and simply leaves the marker bare, which is
what a release looks like when its package is the baked-in base.

Usage: hot_release_body.py <release.json> [section.md]
Output: a GitHub release PATCH payload (JSON) on stdout.
"""
from __future__ import annotations

import json
import pathlib
import sys

MARKER = "<!-- hot-notes -->"


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    release = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    section = ""
    if len(sys.argv) > 2 and sys.argv[2] and pathlib.Path(sys.argv[2]).is_file():
        section = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").strip()

    head = (release.get("body") or "").split(MARKER)[0].rstrip()
    body = f"{head}\n\n---\n\n{MARKER}\n\n{section}".strip() + "\n"
    print(json.dumps({"body": body}, ensure_ascii=False))


if __name__ == "__main__":
    main()
