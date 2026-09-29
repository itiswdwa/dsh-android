#!/usr/bin/env python3
"""Generate update.json — the manifest the app checks for updates.

Two independent channels, because they cost the user different things:

  app  the shell: UI, icons, new bridge endpoints. ~143 MB, needs an APK install.
  hot  plugins, skills, the sandbox prompt and guest scripts. ~50 KB, applied
       in place — no reinstall, and the user's sessions and credentials survive.

Both are served from the repository's latest release, so publishing one release
with two assets is enough; nothing else has to be hosted.

Usage: make_update_manifest.py <repo-root>
Output: <repo-root>/update.json
"""
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

REPO = "itiswdwa/dsh-android"
BASE = f"https://github.com/{REPO}"
RAW = f"https://raw.githubusercontent.com/{REPO}/main"


def hot_version(hot_zip: Path) -> str:
    if not hot_zip.is_file():
        return ""
    with zipfile.ZipFile(hot_zip) as archive:
        try:
            return json.loads(archive.read("hot.json")).get("version", "")
        except (KeyError, json.JSONDecodeError):
            return ""


def version_code(version: str) -> int:
    code = 0
    for part in version.split(".")[:3]:
        code = code * 100 + int(part)
    return code


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    version = (root / "VERSION").read_text(encoding="utf-8").strip()
    hot = hot_version(root / "build" / "hot-assets" / "hot.zip")
    manifest = {
        "schema": 1,
        "app": {
            "version": version,
            "versionCode": version_code(version),
            "url": f"{BASE}/releases/latest/download/dsh-android.apk",
            "page": f"{BASE}/releases/latest",
        },
        "hot": {
            "version": hot,
            "url": f"{BASE}/releases/latest/download/dsh-hot.zip",
            "manifest": f"{RAW}/update.json",
        },
    }
    out = root / "update.json"
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out}: app {version} ({manifest['app']['versionCode']}), hot {hot or '(none)'}")


if __name__ == "__main__":
    main()
