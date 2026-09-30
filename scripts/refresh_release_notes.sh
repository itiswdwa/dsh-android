#!/bin/sh
# Rewrite the bodies of already-published releases from CHANGELOG.md.
#
# Repair tool: a release page written before the notes had a format carries copy
# that exists nowhere else, and a changelog entry fixed after publication never
# reaches the release page on its own. Both are re-rendered from the file that
# does hold the truth, through the same path the release scripts use.
#
# Usage: refresh_release_notes.sh 1.1.3 1.1.4 ...   (needs GITHUB_TOKEN)
#        HOT_TAG=1.1.4 …                            (which release carries the hot package)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${DSH_REPO:-itiswdwa/dsh-android}"
API="https://api.github.com/repos/$REPO"
[ -n "${GITHUB_TOKEN:-}" ] || { echo "缺少 GITHUB_TOKEN" >&2; exit 1; }
AUTH="Authorization: Bearer $GITHUB_TOKEN"
ACCEPT="Accept: application/vnd.github+json"

# The newest hot package in the changelog; the file is latest-first.
HOT_VERSION=$(python3 - "$ROOT/CHANGELOG.md" <<'PY'
import sys
for line in open(sys.argv[1], encoding="utf-8"):
    if not line.startswith("## "):
        continue
    text = line[3:].strip()
    version = text[1:text.index("]")] if text.startswith("[") else text.split(" ")[0]
    if "-sp" in version:
        print(version)
        break
PY
)
HOT_TAG="${HOT_TAG:-$(cat "$ROOT/VERSION")}"

echo "== 重新渲染已发布的 release 正文 =="
for version in "$@"; do
  echo "   v$version"
  # One payload per release: app notes first, then the hot section for whichever
  # release carries it. Composing the whole body at once is what keeps repeated
  # runs from stacking separators.
  python3 - "$ROOT" "$version" "$([ "$version" = "$HOT_TAG" ] && echo "$HOT_VERSION")" <<'PY' > "$ROOT/build/release-body.json"
import json, subprocess, sys

root, version, hot_version = sys.argv[1], sys.argv[2], sys.argv[3]

def render(ver, channel):
    return subprocess.run(
        ["python3", root + "/scripts/release_notes.py", ver, "--channel", channel],
        capture_output=True, text=True, check=True).stdout.strip()

body = render(version, "app")
if hot_version:
    body += "\n\n---\n\n<!-- hot-notes -->\n\n" + render(hot_version, "hot")
print(json.dumps({"body": body + "\n"}, ensure_ascii=False))
PY
  ID=$(curl -sS -H "$AUTH" -H "$ACCEPT" "$API/releases/tags/v$version" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  curl -sS -X PATCH -H "$AUTH" -H "$ACCEPT" --data-binary "@$ROOT/build/release-body.json" \
    "$API/releases/$ID" | python3 -c '
import json, sys
data = json.load(sys.stdin)
print("      " + (data.get("html_url") or json.dumps(data, ensure_ascii=False)[:200]))
'
done

echo "== 完成 =="
echo "https://github.com/$REPO/releases"
