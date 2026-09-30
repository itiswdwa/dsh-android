#!/usr/bin/env python3
"""Generate update.json — the manifest the app checks for updates.

Two independent channels, because they cost the user different things:

  app       the shell: UI, icons, new bridge endpoints. ~143 MB, needs an APK
            install.
  terminal  the runtime in the sandbox (rootfs, node, dsh, installed tools). It
            has a version of its own that does not move with the app version;
            shipping a new one means a new payload, i.e. a new APK.
  hot       plugins, skills, the sandbox prompt and guest scripts. ~50 KB,
            applied in place — no reinstall, and the user's sessions and
            credentials survive.

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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import version  # noqa: E402  (sibling script: the one definition of the version model)

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




def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    current = version.read(root)
    app = current["app"]
    hot = hot_version(root / "build" / "hot-assets" / "hot.zip")
    manifest = {
        "schema": 2,
        "app": {
            "version": app,
            "versionCode": current["code"],
            "url": f"{BASE}/releases/latest/download/dsh-android.apk",
            # The shell without the runtime: a few megabytes, for phones that
            # already have the terminal — which is every phone after the first
            # install. Same APK, minus assets/payload.zip + payload.manifest.
            "slim": f"{BASE}/releases/latest/download/dsh-android-slim.apk",
            "page": f"{BASE}/releases/latest",
        },
        # The sandbox runtime has its own number: it only moves when the rootfs
        # itself changes, which is a different release from a shell change.
        # The runtime is published once per terminal version, on a release tagged
        # `t<N>`, so a shell release never has to upload 190 MB again. The URLs
        # are stable for as long as the terminal version is.
        "terminal": {
            "version": current["terminal"],
            "full": current["core"],
            "tag": f"t{current['terminal']}",
            "url": f"{BASE}/releases/download/t{current['terminal']}/payload.zip",
            "manifest": f"{BASE}/releases/download/t{current['terminal']}/payload.manifest",
        },
        "hot": {
            "version": hot,
            "url": f"{BASE}/releases/latest/download/dsh-hot.zip",
            "manifest": f"{RAW}/update.json",
        },
    }
    out = root / "update.json"
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out}: app {app} ({current['code']}), terminal t{current['terminal']}, hot {hot or '（无）'}")


if __name__ == "__main__":
    main()
