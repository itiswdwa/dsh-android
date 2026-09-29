#!/bin/sh
# Publish a GitHub release: tag, notes, APK, hot package, checksums.
#
# Needs GITHUB_TOKEN with contents:write — a fine-grained token scoped to this
# repository is enough. Set it in the app under Settings → Environments; the
# script never prints it and never writes it anywhere.
#
# The asset names matter: update.json points at
#   releases/latest/download/dsh-android.apk
#   releases/latest/download/dsh-hot.zip
# so renaming them here would break in-app updates.
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

echo "== 发布 $TAG =="
[ -f "$APK" ] || { echo "缺少 $APK，先跑 scripts/build_apk.sh" >&2; exit 1; }
[ -f "$HOT" ] || cp "$ROOT/build/hot-assets/hot.zip" "$HOT"

# The app refuses anything but https, so a release asset is the only sane host.
if [ -z "${GITHUB_TOKEN:-}" ]; then
  cat >&2 <<EOF
没有 GITHUB_TOKEN，改用手动发布（大约三次点击）：

  1. 打开 https://github.com/$REPO/releases/new?tag=$TAG
  2. 标题填 dsh-android $VERSION，正文可以从 $NOTES 复制
  3. 把这两个文件拖进去，然后 Publish：
       $APK   (143 MB)
       $HOT   (几十 KB)
EOF
  exit 1
fi

AUTH="Authorization: Bearer $GITHUB_TOKEN"
API="https://api.github.com/repos/$REPO"

echo "== 创建 release =="
BODY=$(python3 - "$NOTES" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8") if path.is_file() else "见 README 的更新说明。"
print(json.dumps({"tag_name": "PLACEHOLDER", "name": "PLACEHOLDER", "body": text,
                  "draft": False, "prerelease": False}))
PY
)
BODY=$(printf '%s' "$BODY" | sed "s/PLACEHOLDER/$TAG/g")

RELEASE_ID=$(printf '%s' "$BODY" | curl -sS -X POST \
  -H "$AUTH" -H "Accept: application/vnd.github+json" \
  --data-binary @- "$API/releases" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))")

if [ -z "$RELEASE_ID" ]; then
  echo "创建失败（token 权限不足或 release 已存在）：" >&2
  printf '%s' "$BODY" | curl -sS -X POST -H "$AUTH" -H "Accept: application/vnd.github+json" \
    --data-binary @- "$API/releases" | head -c 400 >&2
  exit 1
fi
echo "   release id $RELEASE_ID"

echo "== 上传资产 =="
( cd "$(dirname "$APK")" && sha256sum "$(basename "$APK")" "$(basename "$HOT")" > "$ROOT/out/SHA256SUMS" )
for spec in "$APK:application/vnd.android.package-archive" \
            "$HOT:application/zip" \
            "$ROOT/out/SHA256SUMS:text/plain"; do
  file=${spec%%:*}; type=${spec#*:}
  name=$(basename "$file")
  echo "   $name ($(du -h "$file" | cut -f1))"
  curl -sS -X POST \
    -H "$AUTH" -H "Content-Type: $type" \
    --data-binary "@$file" \
    "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$name" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('     ->', d.get('browser_download_url') or d.get('message'))"
done

echo "== 完成 =="
echo "https://github.com/$REPO/releases/tag/$TAG"
