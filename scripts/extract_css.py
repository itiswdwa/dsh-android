#!/usr/bin/env python3
"""Dump the CSS-module payloads a dsh client bundle carries inline.

Every dsh client bundle embeds its stylesheets as `\0dsh-css:<source path>.mjs`
regions holding a JS module whose default export is the stylesheet text. When
matching upstream visuals, reading the real declarations beats guessing from a
screenshot, and this is the only copy of them in a published install.

Usage: extract_css.py <client.js> [outdir] [name-filter]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REGION = re.compile(r"//#region \\0dsh-css:([^\n]*)\n(.*?)(?=\n\s*//#endregion)", re.S)


def css_of(body: str) -> str:
    """The stylesheet text out of one region.

    tsdown emits the sheet as `const css$N = "<escaped text>";` followed by the
    style-tag installer and the class-name map, so take the leading string
    literal rather than the whole region body.
    """
    match = re.search(r'(["`\'])((?:[^"`\'\\]|\\.)*)\1', body)
    if match is None:
        return body.strip()
    literal = match.group(0)
    if literal[0] == "`":
        return literal[1:-1].replace("\\`", "`").replace("\\$", "$")
    if literal[0] == '"':
        return json.loads(literal)
    return literal[1:-1].replace("\\'", "'")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    text = src.read_text(encoding="utf-8")
    outdir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/tmp/dsh-css")
    needle = sys.argv[3] if len(sys.argv) > 3 else ""
    outdir.mkdir(parents=True, exist_ok=True)
    count = 0
    for path, body in REGION.findall(text):
        if needle and needle not in path:
            continue
        name = Path(path).name.replace(".module.css.mjs", ".module.css")
        (outdir / name).write_text(css_of(body), encoding="utf-8")
        count += 1
        print(f"{name}: {len(css_of(body))} bytes")
    print(f"{count} stylesheet(s) -> {outdir}")


if __name__ == "__main__":
    main()
