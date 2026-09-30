#!/usr/bin/env python3
"""Render one release's notes from CHANGELOG.md.

The changelog is the single place a release is described — the GitHub release
body is generated from it, so the two can never disagree. This is the tool the
release scripts call, and it refuses to render a version the changelog does not
have: publishing without an entry is exactly how a release ends up described
only by its commit log.

Writing rules, for whoever edits CHANGELOG.md next (Keep a Changelog + Common
Changelog, which this project follows):

  * one line per change, phrased as the impact on someone using the app, not as
    a step in the source history;
  * group by Added / Changed / Fixed / Removed / Security, and drop the noise —
    build scripts, refactors and dotfiles are not release notes;
  * the same text serves the file and the release page; nothing release-specific
    is written anywhere else.

Usage: release_notes.py <version> [--channel app|hot] [--root DIR]
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


def read_entry(changelog: Path, version: str) -> tuple[str, str]:
    """The notice/groups body of one version, and the date from its heading.

    Reference definitions live once at the bottom of the file, but a link only
    resolves inside the document that carries its definition — so the ones the
    entry actually uses are appended to the rendered body.
    """
    lines = changelog.read_text(encoding="utf-8").splitlines()
    definitions = {m.group(1): m.group(2) for m in (DEFINITION.match(line) for line in lines) if m}
    body: list[str] = []
    date = ""
    inside = False
    for line in lines:
        heading = HEADING.match(line)
        if heading is not None:
            if inside:
                break
            if heading.group(1).strip() == version:
                inside = True
                date = (heading.group(2) or "").strip()
            continue
        if inside and DEFINITION.match(line) is None:
            body.append(line)
    if not inside:
        available = "、".join(
            m.group(1).strip() for m in (HEADING.match(line) for line in lines) if m is not None
        )
        sys.exit(f"CHANGELOG.md 里没有 {version} 的条目（现有：{available}）\n"
                 f"先写条目再发版 —— 更新日志是唯一的事实来源。")
    text = "\n".join(body).strip()
    used = [name for name in dict.fromkeys(REFERENCE.findall(text)) if name in definitions]
    if used:
        text += "\n\n" + "\n".join(f"[{name}]: {definitions[name]}" for name in used)
    return text, date


def main() -> None:
    # Hand-rolled: the script must run before the release scripts, which are
    # POSIX sh calling it on a phone — one less dependency, one less thing to
    # miss when the sandbox is rebuilt.
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

    if len(versions) != 1 or channel not in ("app", "hot"):
        sys.exit(__doc__)

    root = Path(root_arg) if root_arg is not None else Path(__file__).resolve().parent.parent
    version = versions[0]
    body, _date = read_entry(root / "CHANGELOG.md", version)
    if channel == "hot":
        title, footer = f"## 热更新包 {version}", HOT_FOOTER
    else:
        title, footer = f"# dsh-android {version}", APP_FOOTER
    print(f"{title}\n\n{body}\n\n---\n\n{footer}".rstrip())


if __name__ == "__main__":
    main()
