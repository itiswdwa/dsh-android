#!/bin/sh
# Publish a GitHub release: tag, notes, APK, hot package, checksums.
#
# Needs GITHUB_TOKEN with contents:write — a fine-grained token scoped to this
# repository is enough. Set it in the app under Settings → Environments; this
# script never prints it and never writes it anywhere.
#
# The asset names matter: update.json points at
#   releases/latest/download/dsh-android.apk
#   releases/latest/download/dsh-hot.zip
# so renaming them would break in-app updates.
#
# Reentrant on purpose: a run that dies between creating the release and
# uploading the assets is fixed by running the same command again.
#
# Usage: release.sh            # uses VERSION
#        release.sh 1.2.0      # bumps VERSION first
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO="${DSH_REPO:-itiswdwa/dsh-android}"
VERSION="${1:-$(cat "$ROOT/VERSION")}"

if [ "${1:-}" != "" ]; then
  echo "$VERSION" > "$ROOT/VERSION"
fi
TAG="v$VERSION"
NOTES="$ROOT/docs/releases/$TAG.md"
APK="$ROOT/out/dsh-android.apk"
HOT="$ROOT/out/dsh-hot.zip"
SUMS="$ROOT/out/SHA256SUMS"

echo "== 发布 $TAG =="
[ -f "$APK" ] || { echo "缺少 $APK，先跑 scripts/build_apk.sh" >&2; exit 1; }
[ -f "$HOT" ] || cp "$ROOT/build/hot-assets/hot.zip" "$HOT"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  cat >&2 <<EOF
没有 GITHUB_TOKEN，改用手动发布（大约三次点击）：

  1. 打开 https://github.com/$REPO/releases/new?tag=$TAG
  2. 标题填 dsh-android $VERSION，正文从 $NOTES 复制
  3. 把这两个文件拖进去，然后 Publish：
       $APK   (137 MB)
       $HOT   (几十 KB)
EOF
  exit 1
fi

AUTH="Authorization: Bearer $GITHUB_TOKEN"
ACCEPT="Accept: application/vnd.github+json"
API="https://api.github.com/repos/$REPO"

asset_id() {
  curl -sS -H "$AUTH" "$API/releases/$RELEASE_ID/assets" | python3 -c '
import json, sys
target = sys.argv[1]
for asset in json.load(sys.stdin):
    if asset.get("name") == target:
        print(asset.get("id"))
        break
' "$1"
}

body_json() {
  python3 - "$NOTES" "$TAG" <<'PY'
import json, pathlib, sys
notes, tag = pathlib.Path(sys.argv[1]), sys.argv[2]
text = notes.read_text(encoding="utf-8") if notes.is_file() else "见 README 的更新说明。"
print(json.dumps({"tag_name": tag, "name": tag, "body": text,
                  "draft": False, "prerelease": False}, ensure_ascii=False))
PY
}

BODY=$(body_json)

RELEASE_ID=$(curl -sS -H "$AUTH" -H "$ACCEPT" "$API/releases/tags/$TAG" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("id", ""))
except Exception:
    print("")
')

if [ -n "$RELEASE_ID" ]; then
  echo "   已存在（id $RELEASE_ID）：更新说明并补齐资产"
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
( cd "$(dirname "$APK")" && sha256sum "$(basename "$APK")" "$(basename "$HOT")" > "$SUMS" )

for spec in "$APK:application/vnd.android.package-archive" \
            "$HOT:application/zip" \
            "$SUMS:text/plain"; do
  file=${spec%%:*}
  type=${spec#*:}
  name=$(basename "$file")
  old=$(asset_id "$name")
  if [ -n "$old" ]; then
    curl -sS -X DELETE -H "$AUTH" "$API/releases/assets/$old" > /dev/null
  fi
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

echo "== 完成 =="
echo "https://github.com/$REPO/releases/tag/$TAG"
