#!/usr/bin/env python3
"""Compose the release body for a hot-package publish.

A release body is two things at once: the app's own release notes (written once,
by release.sh) and a description of the hot package currently attached. Only the
second one changes per hot publish, so it lives after a marker and is replaced
wholesale — appending instead would stack a new section on every push.

    ...app notes...

    ---

    <!-- hot-notes -->

    ## 热更新包 <hash>

    ...docs/releases/hot-<hash>.md, minus its own H1...

Usage: hot_release_body.py <release.json> [notes.md]
Output: a GitHub release PATCH payload (JSON) on stdout.
"""
from __future__ import annotations

import json
import pathlib
import sys

MARKER = "<!-- hot-notes -->"

def section(notes: pathlib.Path | None) -> str:
    title = f"热更新包 {notes.stem.removeprefix('hot-')}" if notes is not None else "热更新包"
    body = f"{MARKER}\n\n## {title}\n"
    if notes is None:
        return body
    lines = notes.read_text(encoding="utf-8").strip().splitlines()
    # The notes file carries an H1 for people reading it in the repository; the
    # release body already has the section heading, so drop it.
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
    return f"{body}\n" + "\n".join(lines).strip() + "\n"

def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    release = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    notes = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None
    head = (release.get("body") or "").split(MARKER)[0].rstrip()
    body = f"{head}\n\n---\n\n{section(notes)}".strip() + "\n"
    print(json.dumps({"body": body}, ensure_ascii=False))

if __name__ == "__main__":
    main()
