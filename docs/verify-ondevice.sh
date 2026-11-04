#!/bin/sh
# verify-ondevice.sh — 发布后真机验证清单（**只读**）
#
# 这个脚本只做读取与判断：不安装、不重启、不写 prefs、不改任何设备文件。
# 需要人眼或点击的项标成 MANUAL，并给出照做步骤。
# 唯一会"动一下"的是 --haptic：它会打一次 POST /haptic，手机会轻震一下（默认不跑）。
# 它也不打印任何 token：bridge token 只在环境变量里，snapshot 的 log 字段（含会话 token）不读。
#
# 用法（在设备沙箱里跑）：
#   sh docs/verify-ondevice.sh            # 全部只读项 + 人工项清单
#   sh docs/verify-ondevice.sh --haptic   # 额外验触感路由（会震一下）
#
# 输出约定：每项给出「期望 / 实际 / 结果」，末尾给汇总与"失败请贴什么"。
# 任何一项 FAIL 都不影响后面的项。
set -u

# ---- 本版期望值：发布新版本时改这一段 --------------------------------------
EXPECT_APP=1.2.2            # VERSION
EXPECT_CODE=10217           # VERSION_CODE（1.2.2 高危策略重发：10216 作废）
EXPECT_PKG_HOT=1.2.2-t3-sp0 # APK 内建热包（build_apk.sh 用 --base，恒 sp0）
# 这一版还没发过热包，所以"应用后应看到"就是内建那份；两者相同时下面的检查
# 会把"什么都没应用"当作正确状态（而不是当成漏更新）。
EXPECT_HOT=1.2.2-t3-sp0
EXPECT_MARKET_MD5=d6bb2e46139ebbd3b217bc8efbd562bc   # @local/dsh-market/client.js
EXPECT_PNPM=12.11.2
EXPECT_PNPM_MD5=f20469f02b54169cc9ed50abb5b80b7f  # 载荷里那份二进制的 md5（解开软链后算）
# ---------------------------------------------------------------------------

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PKG=dev.dsh.android
HAPTIC=0
[ "${1:-}" = "--haptic" ] && HAPTIC=1

PASS=0; FAIL=0; MANUAL=0; SKIP=0
pass()   { PASS=$((PASS+1));   printf '  [PASS] %s\n' "$1"; }
fail()   { FAIL=$((FAIL+1));   printf '  [FAIL] %s\n' "$1"; printf '         期望：%s\n' "$2"; printf '         实际：%s\n' "$3"; }
manual() { MANUAL=$((MANUAL+1)); printf '  [MANUAL] %s\n' "$1"; printf '         步骤：%s\n' "$2"; printf '         期望：%s\n' "$3"; }
skip()   { SKIP=$((SKIP+1));   printf '  [SKIP] %s\n' "$1"; printf '         原因：%s\n' "$2"; }
head1()  { printf '\n=== %s\n' "$1"; }

# --- bridge helpers (token stays in the environment; never printed) ----------
SNAP=/tmp/verify-ondevice-snapshot.json
fetch_snapshot() {
  node -e '
    const bu=process.env.DSH_ANDROID_BRIDGE_URL, bt=process.env.DSH_ANDROID_BRIDGE_TOKEN;
    if (!bu || !bt) { process.exit(3); }
    fetch(bu+"/snapshot",{headers:{"x-dsh-token":bt}}).then(r=>r.text()).then(t=>process.stdout.write(t))
      .catch(()=>process.exit(4));
  ' > "$SNAP" 2>/dev/null
}
field() { python3 -c "
import json,sys
try: d=json.load(open('$SNAP'))
except Exception: print(''); sys.exit(0)
v=d.get('$1','')
print(json.dumps(v, ensure_ascii=False) if isinstance(v,(dict,list)) else ('' if v is None else str(v)))" ; }

if ! fetch_snapshot; then
  echo "!! 拿不到 bridge /snapshot（App 没在跑，或 DSH_ANDROID_BRIDGE_URL/TOKEN 不在环境里）" >&2
  echo "   下面的只读项仍会尝试，但多数会 SKIP。" >&2
fi

APP_VER=$(field appVersion)
HOT_VER=$(field hotVersion)
PKG_HOT=$(field packagedHotVersion)
TERM_VER=$(field terminalVersion)
PAYLOAD_BUNDLED=$(field payloadBundled)
TERM_READY=$(field terminalReady)

printf 'dsh-android %s 真机验证（只读）\n' "$EXPECT_APP"
printf '快照基线：appVersion=%s hotVersion=%s packagedHotVersion=%s terminal=%s payloadBundled=%s terminalReady=%s\n' \
  "$APP_VER" "$HOT_VER" "$PKG_HOT" "$TERM_VER" "$PAYLOAD_BUNDLED" "$TERM_READY"

# --- 1. 安装确认 -------------------------------------------------------------
head1 "1. 安装确认（versionName / versionCode）"
DUMPSYS=$(shiz dumpsys package "$PKG" 2>/dev/null | grep -E 'versionName=|versionCode=' | head -2)
VN=$(printf '%s\n' "$DUMPSYS" | sed -n 's/.*versionName=\([^ ]*\).*/\1/p' | head -1)
VC=$(printf '%s\n' "$DUMPSYS" | sed -n 's/.*versionCode=\([0-9]*\).*/\1/p' | head -1)
printf '  命令：shiz dumpsys package %s | grep -E "versionName|versionCode"\n' "$PKG"
printf '  实际：versionName=%s versionCode=%s\n' "${VN:-<空>}" "${VC:-<空>}"
if [ "$VN" = "$EXPECT_APP" ] && [ "$VC" = "$EXPECT_CODE" ]; then
  pass "已装上 $EXPECT_APP（$EXPECT_CODE）"
else
  fail "还没装上 $EXPECT_APP" "versionName=$EXPECT_APP versionCode=$EXPECT_CODE" "versionName=${VN:-<空>} versionCode=${VC:-<空>}"
  printf '         失败请贴：上面两行 + 你装的是哪个包（slim / full）\n'
fi
if [ "$APP_VER" = "$EXPECT_APP" ]; then pass "快照 appVersion=$EXPECT_APP"; else
  fail "快照 appVersion 不是 $EXPECT_APP" "$EXPECT_APP" "${APP_VER:-<空>}（装包并重启 App 后应变成 $EXPECT_APP）"; fi

# --- 2. 热包版本初值 ---------------------------------------------------------
head1 "2. 热包版本（hotVersion / packagedHotVersion）"
printf '  期望：packagedHotVersion=%s（APK 内建），hotVersion=%s（应用热更新后）\n' "$EXPECT_PKG_HOT" "$EXPECT_HOT"
printf '  实际：packagedHotVersion=%s hotVersion=%s\n' "${PKG_HOT:-<空>}" "${HOT_VER:-<空>}"
case "$PKG_HOT" in
  "$EXPECT_PKG_HOT") pass "内建热包版本正确" ;;
  *) fail "内建热包版本不对" "$EXPECT_PKG_HOT" "${PKG_HOT:-<空>}" ;;
esac
case "$HOT_VER" in
  "")
    # 本版还没发过热包时，设备的正确状态就是"什么都没应用"——内建的那份就是当前版。
    if [ "$EXPECT_HOT" = "$EXPECT_PKG_HOT" ]; then
      pass "尚未应用热包（本版内建 $EXPECT_PKG_HOT 即当前版）"
    else
      manual "还没应用热包" "设置 → 安卓沙箱 → 检查更新 → 应用热更新" "应用后应变成 $EXPECT_HOT"
    fi ;;
  "$EXPECT_HOT") pass "已应用热包 $EXPECT_HOT（设备确实吃到了这次有效更新）" ;;
  "$EXPECT_APP"-t*-sp*) manual "热包版本是 ${HOT_VER}" "设置 → 安卓沙箱 → 检查更新 → 应用热更新" "应用后应变成 $EXPECT_HOT" ;;
  *) manual "热包版本是 ${HOT_VER:-<空>}" "装 $EXPECT_APP 后进 设置 → 安卓沙箱 → 检查更新，应出现 $EXPECT_HOT" "$EXPECT_HOT" ;;
esac

# --- 3. pnpm -----------------------------------------------------------------
head1 "3. pnpm（只有全量包或重下过 runtime 才有）"
PNPM_LINK=$(command -v pnpm 2>/dev/null || true)
PNPM_FORM="缺失"
PNPM_SIZE=""
PNPM_MD5=""
if [ -n "$PNPM_LINK" ]; then
  if [ -L "$PNPM_LINK" ]; then PNPM_FORM="软链（旧形态/手工装）"; else PNPM_FORM="单文件（载荷形态）"; fi
  PNPM_SIZE=$(stat -Lc %s "$PNPM_LINK" 2>/dev/null || echo "?")
  PNPM_MD5=$(md5sum "$PNPM_LINK" 2>/dev/null | cut -d' ' -f1)
fi
PNPM_VER=$([ -n "$PNPM_LINK" ] && pnpm -v 2>/dev/null | head -1 || true)
printf '  命令：command -v pnpm && pnpm -v && md5sum $(command -v pnpm) && ls -l $(command -v pnpm)\n'
printf '  实际：path=%s\n        form=%s  size=%s bytes  md5=%s  version=%s\n' \
  "${PNPM_LINK:-<无>}" "$PNPM_FORM" "${PNPM_SIZE:-}" "${PNPM_MD5:-<无>}" "${PNPM_VER:-<无>}"
printf '  期望：单文件（非软链）· 43,403,704 bytes · md5=%s · pnpm -v = %s\n' "$EXPECT_PNPM_MD5" "$EXPECT_PNPM"
printf '  关键前提：pnpm 被热包**排除**（HOT_EXCLUDED），只能来自载荷；而载荷只在\n'
printf '            "磁盘上的运行时不是本 APK 自带的那份" 时才会解包（PayloadMarker）。\n'
printf '            payloadBundled=%s ⇒ %s\n' "$PAYLOAD_BUNDLED" \
  "$([ "$PAYLOAD_BUNDLED" = "True" ] || [ "$PAYLOAD_BUNDLED" = "true" ] && echo '全量包（自带载荷）' || echo '瘦包（无载荷，靠下载 runtime）')"
if [ "$PNPM_MD5" = "$EXPECT_PNPM_MD5" ] && [ "$PNPM_FORM" = "单文件（载荷形态）" ] && [ "$PNPM_VER" = "$EXPECT_PNPM" ]; then
  pass "pnpm 是载荷那份（单文件、md5 与大小都对）"
elif [ "$PNPM_MD5" = "$EXPECT_PNPM_MD5" ] && [ "$PNPM_FORM" = "软链（旧形态/手工装）" ]; then
  fail "pnpm 内容对但形态是软链（旧形态/手工装），说明载荷没有覆盖它" \
       "单文件 43,403,704 bytes（载荷解包后 clearLink 会把软链换成真文件）" \
       "$PNPM_LINK -> $(readlink "$PNPM_LINK" 2>/dev/null)  size=$(stat -c %s "$PNPM_LINK" 2>/dev/null) bytes"
  printf '         失败请贴：ls -l %s；ls -lL %s；ls -la /.payload-*；shiz dumpsys package %s | grep -E "versionName|versionCode"\n' \
    "$PNPM_LINK" "$PNPM_LINK" "$PKG"
elif [ -z "$PNPM_LINK" ]; then
  if [ "$PAYLOAD_BUNDLED" = "True" ] || [ "$PAYLOAD_BUNDLED" = "true" ]; then
    fail "全量包已装但 pnpm 不在" "/usr/local/bin/pnpm 存在" "找不到（看 /.payload-* 标记与解包日志）"
  else
    skip "pnpm 不在（本机是瘦包安装）" "已知限制：pnpm 随运行时包发；瘦包升级不会重下 payload。要 pnpm 请装 dsh-android.apk（全量包，~197 MB）"
  fi
elif [ "$PNPM_VER" != "$EXPECT_PNPM" ]; then
  fail "pnpm 版本不对" "$EXPECT_PNPM" "$PNPM_VER"
else
  fail "pnpm 内容对不上载荷那份" "md5=$EXPECT_PNPM_MD5" "md5=${PNPM_MD5:-<无>} form=$PNPM_FORM"
fi

# --- 4. applyHot 重放（六步 + 反向用例） -------------------------------------
head1 "4. applyHot 重放六步（MANUAL：需要应用热包 + 完全退出重开）"
PLUGIN_GUEST=/root/.dsh/profiles/web/node_modules/dsh-plugin-android/lib/client.js
printf '  现在三份 client.js 的 md5（第 2 步的"记下 A"）：\n'
for f in "$SCRIPT_DIR/../plugin/dsh-plugin-android/lib/client.js" \
         /opt/dsh/dsh-plugin-android/lib/client.js "$PLUGIN_GUEST"; do
  [ -f "$f" ] && printf '    %s  %s\n' "$(md5sum "$f" | cut -d' ' -f1)" "$f"
done
manual "热包重放（正向用例）" \
"① 设置 → 安卓沙箱 → 检查更新 → **应用热更新**（$EXPECT_HOT）—— 注意：热包不会自动应用，必须点这一下；② 记下上面 profile 那份 client.js 的 md5=A；③ 从最近任务里划掉 App（完全退出）再打开；④ 再算一次 md5，应仍=A；⑤ 看 /snapshot 的 hotVersion 仍=$EXPECT_HOT；⑥ 日志里应有 hot replay: re-applied" \
"④ md5 不变；⑤ 仍是 sp1；⑥ 日志见 hot replay: re-applied"
manual "热包重放（反向用例：装新 APK 后应丢弃更旧的热包）" \
"用一份比 APK 内建更旧的热包重复上面流程（或直接看装完新 APK 的首次启动日志）" \
"日志应出现 hot replay: dropped <旧版本> (baked <新版本>)，文件回到 APK 内建那份"
printf '  日志命令（只读）：shiz logcat -d -s dsh | grep -E "hot replay|applyHot" | tail -20\n'
printf '  ⑥ 的期望行：hot replay: re-applied %s (N files) after the baked overlay\n' "$EXPECT_HOT"

# --- 5. #3 全新安装闸门（本机不做） ------------------------------------------
head1 "5. issue #3 全新安装闸门（**需要一次性实例/清数据的设备，未在本机执行**）"
manual "清数据后的首次启动" \
"① 备份好用户数据；② 设置 → 应用 → DSH → 存储 → 清除数据；③ 打开 App 等它起完；④ 设置页应出现「安卓沙箱」，左栏应有「终端」按钮；⑤ 日志里应有 start-dsh: repair-profile: … 与 android-sandbox 相关行" \
"④ 两个入口都在；⑤ 没有 fallback-seeded、更没有缺插件行"
manual "已经装坏的机器被自愈（同一个 #3 的第二种情形）" \
"在 profile 缺 package.json 或 cordis.patch.yml 缺 android-sandbox 的机器上启动一次" \
"启动后 profile 被补齐（缺哪行补哪行），插件入口回来"

# --- 6. #1 侧边栏 ⋯ 菜单（人眼） ---------------------------------------------
head1 "6. issue #1 侧边栏 ⋯ 菜单（MANUAL，必须人眼看）"
manual "会话行右侧三个点" \
"① 打开左侧抽屉；② 点某个会话右侧的「⋯」；③ 菜单应保持展开；④ 再点会话行本体" \
"③ 菜单不消失、不进会话；④ 正常进入该会话且抽屉收起"

# --- 7. 触感 -----------------------------------------------------------------
head1 "7. 触感（POST /haptic）"
if [ "$HAPTIC" = "1" ]; then
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -X POST \
    -H "x-dsh-token: ${DSH_ANDROID_BRIDGE_TOKEN:-}" "${DSH_ANDROID_BRIDGE_URL:-}/haptic" 2>/dev/null || echo 000)
  printf '  命令：POST %s/haptic\n  实际：HTTP %s（手机会轻震一下）\n' "${DSH_ANDROID_BRIDGE_URL:-<无>}" "$CODE"
  [ "$CODE" = "200" ] && pass "触感路由可用（200）" || fail "触感路由不可用" "HTTP 200" "HTTP $CODE（旧版本上是 404，装了 $EXPECT_APP 才会是 200）"
else
  manual "触感路由" "重跑本脚本加 --haptic（会震一下）：sh docs/verify-ondevice.sh --haptic" "HTTP 200"
fi
manual "功能键行的轻震" "点终端底部功能键行的任意键（Esc/Tab/Ctrl/方向/粘贴），并连续快速点同一个键" \
"每下都有一次短震；连点不应变成一次长震"

# --- 8. 插件市场（新版） -----------------------------------------------------
head1 "8. 插件市场（新版，含真机修的 4 个 bug）"
MARKET_GUEST=/root/.dsh/profiles/web/node_modules/@local/dsh-market/client.js
MARKET_MD5=$([ -f "$MARKET_GUEST" ] && md5sum "$MARKET_GUEST" | cut -d' ' -f1 || echo "")
printf '  命令：md5sum %s\n  实际：%s\n  期望：%s（新版）\n' "$MARKET_GUEST" "${MARKET_MD5:-<文件不存在>}" "$EXPECT_MARKET_MD5"
if [ "$MARKET_MD5" = "$EXPECT_MARKET_MD5" ]; then
  pass "设备上的市场是新版（含 4 个真机修复）"
elif [ -z "$MARKET_MD5" ]; then
  fail "设备上没有市场包" "文件存在且 md5=$EXPECT_MARKET_MD5" "不存在（应用 $EXPECT_HOT 热包后会写入）"
else
  fail "设备上的市场是旧版" "$EXPECT_MARKET_MD5" "$MARKET_MD5（应用 $EXPECT_HOT 热包即可更新）"
fi
CAT=$(curl -sS -o /tmp/verify-catalog.json -w '%{http_code}' --max-time 10 \
  "http://127.0.0.1:3080/dsh-market/catalog" 2>/dev/null || echo 000)
printf '  GET /dsh-market/catalog → HTTP %s\n' "$CAT"
if [ "$CAT" = "200" ]; then
  python3 -c "
import json
d=json.load(open('/tmp/verify-catalog.json'))
for k in ('official','online','installed'):
    print(f'    {k}: {len(d.get(k) or [])} 条')
print('    errors:', (d.get('errors') or 'none'))" 2>/dev/null || printf '    （返回体不是预期 JSON）\n'
  pass "市场目录路由可用"
else
  manual "市场目录路由返回 HTTP $CAT" "重启 App 后在页面里打开「插件市场」标签页；若标签页在，路由就会带会话鉴权返回 200（命令行不带会话时可能是 404/401，属正常）" "标签页出现，页面显示「官方随包 / 在线目录 / 已安装」三组"
fi
manual "真的从市场装一个插件" "右栏「插件市场」→ 挑一个无害的（如 @deepseek-ai/dsh-acp-app）→ Install；装完看 profile 的 dependencies 与 dsh.profile.bundles" \
"装完出现在「已安装」，profile 里两处都写进去了；失败时是面板里一句可读报错（不是白屏）"
manual "失败路径" "断网后点 Install" "面板里出现 Failed: … 之类的可读报错，页面不白屏"

# --- 9. 已知缺口核对 ---------------------------------------------------------
head1 "9. 已知缺口：全量包的运行时种子里是上一版市场"
printf '  判据（两条都满足即"设备最终是新版"）：\n'
printf '    a) /snapshot hotVersion = %s（热包生效）\n    b) %s 的 md5 = %s\n' "$EXPECT_HOT" "$MARKET_GUEST" "$EXPECT_MARKET_MD5"
printf '  说明：装 dsh-android.apk（全量，种子里的市场是上一版）或旧 runtime 的设备，\n'
printf '        第一次启动会应用 %s 热包，把市场覆盖成新版；a+b 即证明已完成。\n' "$EXPECT_HOT"
if [ "$HOT_VER" = "$EXPECT_HOT" ] && [ "$MARKET_MD5" = "$EXPECT_MARKET_MD5" ]; then
  pass "设备最终是新版（a+b 都满足）"
else
  manual "设备最终版本待确认" "应用 $EXPECT_HOT 热包后重跑本脚本" "a+b 都满足"
fi

# --- 附加：profile 行是否齐全（只读，脚本可判） ------------------------------
head1 "附加. profile 行是否齐全（#3 的另一半 + 三个内置插件）"
PROFILE=/root/.dsh/profiles/web
for name in "@local/agent-browser-viewer" "@local/dsh-ball-summarizer" "@local/dsh-market"; do
  if grep -q "$name" "$PROFILE/package.json" 2>/dev/null; then pass "package.json 有 $name"; else fail "package.json 缺 $name" "依赖 + bundles 两处都有" "没找到"; fi
done
if grep -q "android-sandbox" "$PROFILE/cordis.patch.yml" 2>/dev/null; then pass "cordis.patch.yml 有 android-sandbox 行"; else
  fail "cordis.patch.yml 缺 android-sandbox 行" "有这一行（插件才会注册）" "没找到（启动时会由 repair-profile 补齐）"; fi

# --- 汇总 --------------------------------------------------------------------
printf '\n================ 汇总 ================\n'
printf 'PASS=%s FAIL=%s MANUAL=%s SKIP=%s\n' "$PASS" "$FAIL" "$MANUAL" "$SKIP"
printf '1.2.2 新增的插件 Android 接口（/android/*）另跑：\n'
printf '  node docs/verify-android-api.mjs          # 只读\n'
printf '  node docs/verify-android-api.mjs --full   # 含 toast/震动/通知/截屏等可见副作用\n'
printf '失败/人工项请把本脚本的整段输出贴回来（脚本不会打印 bridge token，也没有改动设备）。\n'
printf '注：本脚本只读；唯一会动手的是 --haptic（轻震一下）。\n'
exit 0
