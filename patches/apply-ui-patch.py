#!/usr/bin/env python3
"""Apply the DeepSeek Harness phone-layout patch to an installed npm tree.

Usage: apply-ui-patch.py <path-to-node_modules-root>

Copies android-mobile.{css,js} into the web frontend's served dist/assets/ and
wires them into dist/index.html. Idempotent: re-running replaces the payload
files and never duplicates the <link>/<script> tags.

Why patch the packaged frontend instead of shipping a dsh client plugin: the
phone layout is a property of the shell (AppFrame grid tracks), which upstream
composes at build time from packages/client/ui-layout. A plugin can add panels
but cannot renegotiate the frame's track solve, so the override has to live in
the served shell. Everything is expressed in terms of stable class-name
suffixes, so it survives CSS-module hash churn.
"""
from __future__ import annotations

import hashlib
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSS_NAME = "android-mobile.css"
JS_NAME = "android-mobile.js"
MARKER = "dshm-android-mobile"

VIEWPORT_RE = re.compile(
    r'<meta name="viewport" content="[^"]*" />',
    re.IGNORECASE,
)
# viewport-fit=cover lets the WebView hand us real safe-area insets; the shell
# is edge-to-edge on Android 15+ and would otherwise draw under the gesture bar.
VIEWPORT = (
    '<meta name="viewport" content="width=device-width, initial-scale=1, '
    'viewport-fit=cover, interactive-widget=resizes-content" />'
)
def cache_key(path: Path) -> str:
    """Content hash for cache busting: the payload files keep stable names, so
    without this the WebView reuses a stale override after a payload update."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def inject_block(assets: Path) -> str:
    return (
        f"    <!-- {MARKER} -->\n"
        f'    <link rel="stylesheet" href="./assets/{CSS_NAME}?v={cache_key(assets / CSS_NAME)}" />\n'
        f'    <script src="./assets/{JS_NAME}?v={cache_key(assets / JS_NAME)}" defer></script>\n'
    )


def find_dist(root: Path) -> Path:
    dist = root / "@deepseek-ai" / "dsh-web-frontend" / "dist"
    if not (dist / "index.html").is_file():
        sys.exit(f"error: no web frontend dist under {root}")
    return dist


def patch_index(index: Path, assets: Path) -> str:
    html = index.read_text(encoding="utf-8")
    html = re.sub(
        r"\s*<!-- " + MARKER + r" -->\n(?:\s*<(?:link|script)[^\n]*\n)*", "\n", html
    )
    if VIEWPORT_RE.search(html):
        html = VIEWPORT_RE.sub(VIEWPORT, html)
    else:
        html = html.replace(
            "<head>", "<head>\n    " + VIEWPORT, 1
        )
    html = html.replace("  </head>", inject_block(assets) + "  </head>", 1)
    index.write_text(html, encoding="utf-8")
    return html


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = Path(sys.argv[1]).resolve()
    dist = find_dist(root)
    assets = dist / "assets"
    assets.mkdir(exist_ok=True)
    for name in (CSS_NAME, JS_NAME):
        shutil.copyfile(HERE / name, assets / name)
    html = patch_index(dist / "index.html", assets)
    print(f"patched {dist}")
    print(f"  assets/{CSS_NAME} ({(assets / CSS_NAME).stat().st_size} bytes)")
    print(f"  assets/{JS_NAME} ({(assets / JS_NAME).stat().st_size} bytes)")


if __name__ == "__main__":
    main()
