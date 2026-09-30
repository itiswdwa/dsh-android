#!/bin/sh
# Publish a HOT package update: plugins, skills, the sandbox prompt, guest scripts.
#
# A hot change is not a new app. The APK stays where it is — same version, same
# assets, already-installed users are untouched — only the mutable pointer moves:
# the dsh-hot.zip asset on the current release, plus update.json's hot entry on
# main. That is the whole difference from release.sh, and running the app cycle
# (bump VERSION -> 10 min payload -> 143 MB upload) for a plugin edit is exactly
# what this script exists to prevent.
#
# Needs GITHUB_TOKEN with contents:write — same token release.sh uses.
#
# Usage: release_hot.sh [section-file]          # default: CHANGELOG.md 里该版本的条目
#        DSH_SKIP_PUSH=1 release_hot.sh         # publish without pushing update.json
#        DSH_RELEASE_TAG=v1.2.0 release_hot.sh  # target a specific release
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${DSH_REPO:-itiswdwa/dsh-android}"
API="https://api.github.com/repos/$REPO"
BUILD="$ROOT/build"

[ -n "${GITHUB_TOKEN:-}" ] || { echo "缺少 GITHUB_TOKEN（发布需要 contents:write）" >&2; exit 1; }
AUTH="Authorization: Bearer $GITHUB_TOKEN"
ACCEPT="Accept: application/vnd.github+json"

echo "== 1/5 打包 =="
HOT="$BUILD/hot-assets/hot.zip"
python3 "$ROOT/scripts/make_hot_zip.py" "$ROOT" "$HOT"

echo "== 2/5 更新清单 =="
# Regenerated from VERSION + the zip we just built, so the hash the app compares
# against and the asset uploaded below cannot disagree.
python3 "$ROOT/scripts/make_update_manifest.py" "$ROOT"
VERSION=$(python3 -c 'import json,pathlib,sys; print(json.loads(pathlib.Path(sys.argv[1]).read_text())["hot"]["version"])' "$ROOT/update.json")
HASH=$(python3 -c '
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    print(json.loads(archive.read("hot.json")).get("hash", ""))
' "$HOT")
echo "   hot $VERSION (content $HASH)"

# Notes are rendered from CHANGELOG.md, which is the only place a release is
# described — a version without an entry cannot be published, so the file and
# the release page cannot drift apart.
if [ -n "${1:-}" ]; then
  NOTES="$1"
else
  NOTES="$BUILD/hot-notes.md"
  python3 "$ROOT/scripts/release_notes.py" "$VERSION" --channel hot > "$NOTES"
fi
echo "   正文段落 $(wc -c < "$NOTES") 字节"

echo "== 3/5 定位 release =="
RELEASE_JSON="$BUILD/release.json"
if [ -n "${DSH_RELEASE_TAG:-}" ]; then
  curl -sS -H "$AUTH" -H "$ACCEPT" "$API/releases/tags/$DSH_RELEASE_TAG" -o "$RELEASE_JSON"
else
  curl -sS -H "$AUTH" -H "$ACCEPT" "$API/releases/latest" -o "$RELEASE_JSON"
fi
python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
if "id" not in data:
    sys.exit("无法定位 release: " + json.dumps(data, ensure_ascii=False)[:300])
print("   目标 release：%s (id %s)" % (data["tag_name"], data["id"]))
' "$RELEASE_JSON"
RELEASE_ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$RELEASE_JSON")
UPLOAD=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["upload_url"].split("{")[0])' "$RELEASE_JSON")

# Replace the mutable assets. The APK is deliberately left alone: an app build
# takes ten minutes and a 143 MB upload, and nothing about a hot change needs it.
for name in dsh-hot.zip SHA256SUMS; do
  id=$(python3 -c '
import json, sys
for asset in json.load(open(sys.argv[1])).get("assets", []):
    if asset["name"] == sys.argv[2]:
        print(asset["id"]); break
' "$RELEASE_JSON" "$name")
  [ -z "$id" ] || curl -sS -X DELETE -H "$AUTH" "$API/releases/assets/$id" > /dev/null
done

echo "== 4/5 上传热包 =="
printf '   %-14s %6s  ' dsh-hot.zip "$(du -h "$HOT" | cut -f1)"
curl -sS -X POST -H "$AUTH" -H "Content-Type: application/zip" \
  --data-binary "@$HOT" "$UPLOAD?name=dsh-hot.zip" \
  | python3 -c '
import json, sys
data = json.load(sys.stdin)
print(data.get("browser_download_url") or data.get("message"))
'

# Checksums cover the APK too, and that asset is not re-uploaded here — its
# digest comes from the asset API instead of a 143 MB download.
mkdir -p "$ROOT/out"
SUMS="$ROOT/out/SHA256SUMS"
{
  python3 -c '
import json, sys
for asset in json.load(open(sys.argv[1])).get("assets", []):
    if asset["name"] == "dsh-android.apk" and asset.get("digest"):
        print("%s  dsh-android.apk" % asset["digest"].removeprefix("sha256:"))
' "$RELEASE_JSON"
  printf '%s  dsh-hot.zip\n' "$(sha256sum "$HOT" | cut -d' ' -f1)"
} > "$SUMS"

echo "== 5/5 更新正文与校验和 =="
BODY=$(python3 "$ROOT/scripts/hot_release_body.py" "$RELEASE_JSON" "$NOTES")
printf '%s' "$BODY" | curl -sS -X PATCH -H "$AUTH" -H "$ACCEPT" --data-binary @- \
  "$API/releases/$RELEASE_ID" > /dev/null
curl -sS -X POST -H "$AUTH" -H "Content-Type: text/plain" \
  --data-binary "@$SUMS" "$UPLOAD?name=SHA256SUMS" > /dev/null
echo "   $(basename "$SUMS")"

if [ "${DSH_SKIP_PUSH:-}" = "1" ]; then
  echo "== 完成（清单未推送）=="
  echo "   DSH_SKIP_PUSH=1，记得自己把 update.json 推到 main，否则应用看不到这一包"
else
  echo "== 推送清单 =="
  # update.json is what the app polls; the release assets are already live, so
  # pushing last keeps the manifest from ever pointing at a missing asset.
  sh "$ROOT/scripts/sync_repo.sh" "热更新包 $VERSION" | tail -1
  echo "   update.json 已推送"
fi

echo "== 完成 =="
echo "https://github.com/$REPO/releases"
echo "应用内：设置 → 安卓沙箱 → 检查更新 → 应用热更新（热包 $VERSION）"
