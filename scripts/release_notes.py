#!/usr/bin/env python3
"""Render release notes from CHANGELOG.md.

The changelog is the single place a release is described — the GitHub release
body is generated from it, so the two can never disagree. This is the tool the
release scripts call, and it refuses to render a version the changelog does not
have: publishing without an entry is exactly how a release ends up described
only by its commit log.

Three renderings, because a release page has to answer three different questions:

  app          what changed in this app version (the release's own notes)
  hot          what one hot package changed
  hot-history  every hot package published under one app version, newest first —
               a page that shows only the newest would erase the previous ones
               the moment the next one ships

Writing rules, for whoever edits CHANGELOG.md next (Keep a Changelog + Common
Changelog, which this project follows):

  * group by Added / Changed / Fixed / Removed / Security, newest version first;
  * one bullet per change, phrased as the impact on someone using the app — say
    what was broken and what it does now, not which function was edited;
  * drop the noise: build scripts, refactors and dotfiles are not release notes;
  * never write the same change in two places: the file and the release page are
    the same text.

Usage: release_notes.py <version> [--channel app|hot|hot-history] [--root DIR]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

APP_FOOTER = """**安装**：下载本页的 `dsh-android.apk`，覆盖安装即可；会话、API Key、挂载与设置都会保留。
首次启动需要解包内置运行时（约 2 分钟），之后冷启动约 5 秒。完整说明见 [README](README.md)。
"""

HOT_FOOTER = """**应用**：设置 → 安卓沙箱 → 检查更新 → 应用热更新。
也可以把 `dsh-hot.zip` 放进手机的 `Download` 目录，重开应用即可。
"""

HEADING = re.compile(r"^##\s+\[?([^\]]+?)\]?(?:\s+-\s+(.*))?$")
DEFINITION = re.compile(r"^\[([^\]]+)\]:\s*(\S+)\s*$")
REFERENCE = re.compile(r"\[([^\]]+)\]")


class Changelog:
    """Every entry in CHANGELOG.md, in file order (newest first)."""

    def __init__(self, path: Path) -> None:
        self.path = path
        lines = path.read_text(encoding="utf-8").splitlines()
        self.definitions = {
            m.group(1): m.group(2) for m in (DEFINITION.match(line) for line in lines) if m
        }
        self.entries: list[tuple[str, str, str]] = []
        version = date = ""
        body: list[str] = []
        for line in lines:
            heading = HEADING.match(line)
            if heading is not None:
                if version:
                    self.entries.append((version, date, self._finish(body)))
                version = heading.group(1).strip()
                date = (heading.group(2) or "").strip()
                body = []
                continue
            if version and DEFINITION.match(line) is None:
                body.append(line)
        if version:
            self.entries.append((version, date, self._finish(body)))

    def _finish(self, body: list[str]) -> str:
        """Trim the body and inline the reference definitions it uses.

        Definitions live once at the bottom of the file, but a link only resolves
        inside the document that carries it — a release page is its own document.
        """
        text = "\n".join(body).strip()
        used = [name for name in dict.fromkeys(REFERENCE.findall(text)) if name in self.definitions]
        if used:
            text += "\n\n" + "\n".join(f"[{name}]: {self.definitions[name]}" for name in used)
        return text

    def versions(self) -> list[str]:
        return [version for version, _date, _body in self.entries]

    def entry(self, version: str) -> tuple[str, str]:
        for found, date, body in self.entries:
            if found == version:
                return body, date
        sys.exit(f"CHANGELOG.md 里没有 {version} 的条目（现有：{'、'.join(self.versions())}）\n"
                 f"先写条目再发版 —— 更新日志是唯一的事实来源。")

    def hot_versions(self, app: str) -> list[str]:
        """Hot packages of one app version, newest (highest sp) first."""
        prefix = f"{app}-sp"

        def sp(version: str) -> int:
            return int(version.rsplit("-sp", 1)[1])

        return sorted((v for v in self.versions() if v.startswith(prefix)), key=sp, reverse=True)


def heading(version: str, date: str) -> str:
    return f"## [{version}] - {date}" if date else f"## [{version}]"


def render(changelog: Changelog, version: str, channel: str) -> str:
    if channel == "app":
        body, _date = changelog.entry(version)
        return f"# dsh-android {version}\n\n{body}\n\n---\n\n{APP_FOOTER}".rstrip()

    if channel == "hot":
        body, date = changelog.entry(version)
        return f"## 热更新包 {version}\n\n{body}\n\n---\n\n{HOT_FOOTER}".rstrip()

    if channel == "hot-history":
        packages = changelog.hot_versions(version)
        if not packages:
            return f"<!-- no hot package published for {version} yet -->"
        sections = []
        for package in packages:
            body, date = changelog.entry(package)
            sections.append(f"{heading(package, date)}\n\n{body}")
        return "\n\n".join(sections) + f"\n\n---\n\n{HOT_FOOTER}".rstrip()

    sys.exit(f"未知的 channel：{channel}（可用 app / hot / hot-history）")


def main() -> None:
    # Hand-rolled: the script runs before the release scripts, which are POSIX sh
    # on a phone — one less dependency, one less thing to miss in a fresh sandbox.
    channel, root_arg, versions = "app", None, []
    options = sys.argv[1:]
    index = 0
    while index < len(options):
        arg = options[index]
        if arg in ("--channel", "--root"):
            if index + 1 >= len(options):
                sys.exit(f"{arg} 需要一个值")
            if arg == "--channel":
                channel = options[index + 1]
            else:
                root_arg = options[index + 1]
            index += 2
            continue
        if arg.startswith("-"):
            sys.exit(__doc__)
        versions.append(arg)
        index += 1

    if len(versions) != 1:
        sys.exit(__doc__)
    root = Path(root_arg) if root_arg is not None else Path(__file__).resolve().parent.parent
    print(render(Changelog(root / "CHANGELOG.md"), versions[0], channel))


if __name__ == "__main__":
    main()
