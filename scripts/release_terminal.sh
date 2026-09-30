#!/bin/sh
# Publish the sandbox runtime for one terminal version (release tag `t<N>`).
#
# The rootfs is ~190 MB and only changes when the terminal version does, while
# the shell changes often. Keeping them in one artifact meant every shell release
# re-uploaded the runtime; the version model separates them, so they are published
# separately too:
#
#   t<N>        payload.zip + payload.manifest   — the runtime, tagged by terminal
#   v<app>      dsh-android.apk + slim + hot     — the shell
#
# update.json points terminal.url at `releases/download/t<N>/payload.zip`, a URL
# that stays valid as long as the terminal version does. The slim shell downloads
# it on first use; a phone that installed the full APK already has it.
#
# Needs GITHUB_TOKEN with contents:write (same token as release.sh).
#
# Usage: release_terminal.sh            # uses ROOTFS_VERSION
#        release_terminal.sh 3          # claims a new terminal version
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${DSH_REPO:-itiswdwa/dsh-android}"
API="https://api.github.com/repos/$REPO"

VERSION="${1:-$(cat "$ROOT/ROOTFS_VERSION")}"
if [ "${1:-}" != "" ]; then
  echo "$VERSION" > "$ROOT/ROOTFS_VERSION"
fi
TAG="t$VERSION"
PAYLOAD="$ROOT/build/payload-assets/payload.zip"
MANIFEST="$ROOT/build/payload-assets/payload.manifest"

[ -n "${GITHUB_TOKEN:-}" ] || { echo "缺少 GITHUB_TOKEN（发布需要 contents:write）" >&2; exit 1; }
AUTH="Authorization: Bearer $GITHUB_TOKEN"
ACCEPT="Accept: application/vnd.github+json"

echo "== 运行时 t$VERSION =="
[ -f "$PAYLOAD" ] || { echo "缺少 $PAYLOAD：先跑 assemble_payload.sh + make_payload_zip.py" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "缺少 $MANIFEST" >&2; exit 1; }
du -h "$PAYLOAD" | cut -f1 | sed 's/^/   载荷 /'

# The runtime list is part of the release: whatever ships must be reproducible
# from the repository. assemble_payload.sh copies both trees, so the build tree
# is the source and the payload is the artefact.
NOTES="$ROOT/docs/releases/terminal-$VERSION.md"
BODY=$(python3 - "$TAG" "$VERSION" "$NOTES" <<'PY'
import json, pathlib, sys
tag, version, notes = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3])
text = notes.read_text(encoding="utf-8") if notes.is_file() else (
    f"沙箱运行时 t{version}。\n\n"
    "这是 `dsh-android-slim.apk` 首次启动时会下载的那份 rootfs（Ubuntu + Node + dsh + 常用工具），"
    "已经装过完整 APK 的设备不需要它。\n")
print(json.dumps({"tag_name": tag, "name": tag, "body": text,
                  "draft": False, "prerelease": False}, ensure_ascii=False))
PY
)

RELEASE_ID=$(curl -sS -H "$AUTH" -H "$ACCEPT" "$API/releases/tags/$TAG" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("id", ""))
except Exception:
    print("")
')

if [ -n "$RELEASE_ID" ]; then
  echo "   已存在（id $RELEASE_ID）：更新说明与资产"
  printf '%s' "$BODY" | curl -sS -X PATCH -H "$AUTH" -H "$ACCEPT" \
    --data-binary @- "$API/releases/$RELEASE_ID" > /dev/null
else
  RELEASE_ID=$(printf '%s' "$BODY" | curl -sS -X POST -H "$AUTH" -H "$ACCEPT" \
    --data-binary @- "$API/releases" | python3 -c '
import json, sys
data = json.load(sys.stdin)
print(data.get("id", ""))
if not data.get("id"):
    print(data, file=sys.stderr)
')
  [ -n "$RELEASE_ID" ] || { echo "创建失败" >&2; exit 1; }
  echo "   新建 release id $RELEASE_ID"
fi

echo "== 上传资产 =="
SUMS="$ROOT/out/SHA256SUMS-terminal"
( cd "$(dirname "$PAYLOAD")" && sha256sum "$(basename "$PAYLOAD")" "$(basename "$MANIFEST")" > "$SUMS" )

for spec in "$PAYLOAD:application/zip" "$MANIFEST:text/plain" "$SUMS:text/plain"; do
  file=${spec%%:*}; type=${spec#*:}; name=$(basename "$file")
  old=$(curl -sS -H "$AUTH" "$API/releases/$RELEASE_ID/assets" | python3 -c '
import json, sys
for asset in json.load(sys.stdin):
    if asset.get("name") == sys.argv[1]:
        print(asset.get("id")); break
' "$name")
  [ -z "$old" ] || curl -sS -X DELETE -H "$AUTH" "$API/releases/assets/$old" > /dev/null
  printf '   %-18s %6s  ' "$name" "$(du -h "$file" | cut -f1)"
  curl -sS -X POST -H "$AUTH" -H "Content-Type: $type" \
    --data-binary "@$file" \
    "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$name" \
    | python3 -c '
import json, sys
data = json.load(sys.stdin)
print(data.get("browser_download_url") or data.get("message"))
'
done

echo "== 更新清单 =="
# The manifest carries the terminal URL, so it has to be regenerated and pushed
# once the assets exist (a shell release keeps the same terminal entry).
sh "$ROOT/scripts/sync_repo.sh" "运行时 t$VERSION" | tail -1

echo "== 完成 =="
echo "https://github.com/$REPO/releases/tag/$TAG"
