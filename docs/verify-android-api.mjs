#!/usr/bin/env node
/**
 * verify-android-api.mjs — 1.2.2 新增的 `/android/*` 与 AI 接口真机冒烟。
 *
 * 默认只读：只 GET 端点，不改音量/亮度/免打扰，不发通知、不截屏、不写剪贴板。
 * 不调用 `/ai/android`、`/ai/terminal/tabs`：默认 `read`/`terminal` 是低危不会弹窗，但用户可能把它们
 * 设为高危，脚本不冒弹指纹的风险。只读项覆盖 `/android/biometric`（状态）、`/ai/consent`
 * （授权列表 + 高危集合 `risk`）与 `/terminal/tabs/commands`（终端标签中继状态）。
 * 加 `--full` 才会做有可见副作用的项（toast / 震动 / 写剪贴板 / 发一条通知 / 截屏），
 * 全部在检查后自行撤销（通知取消、剪贴板写回原值、亮度写回原值）；`--full` 还会多跑
 * 两个不弹指纹的深度只读检查（biometric 状态自洽、终端中继再读一次）。
 *
 * 在设备沙箱里跑：
 *   node docs/verify-android-api.mjs
 *   node docs/verify-android-api.mjs --full
 *
 * 令牌来源与 `shiz`/`ui` 一致：环境变量 DSH_ANDROID_BRIDGE_URL/TOKEN，
 * 或 /etc/dsh-android/bridge.env。令牌不会被打印。
 *
 * 退出码：0 全过 / 1 有 FAIL / 2 连不上桥。
 */
import { existsSync, readFileSync } from "node:fs";

const EXPECT_APP = "1.2.2";
// 1.2.2 重做：只有高危能力才确认；10216 / 10215 作废，以 10217 为准（VERSION_CODE）。
const EXPECT_CODE = 10217;
const EXPECT_API = 2;
/** GET /ai/consent 的固定能力表（与 docs/AI-API.md §2 一致）。 */
const EXPECT_CAPABILITIES = ["read", "clipboard", "notify", "control", "screenshot", "terminal"];
/** 默认高危集合；设备上被用户改过时不强求等于它。 */
const DEFAULT_RISK = ["clipboard", "control", "screenshot"];
const FULL = process.argv.includes("--full");

function bridge() {
  const url = process.env.DSH_ANDROID_BRIDGE_URL;
  const token = process.env.DSH_ANDROID_BRIDGE_TOKEN;
  if (url && token) return { url, token };
  for (const path of ["/etc/dsh-android/bridge.env", "/root/.dsh-android-bridge.env"]) {
    if (!existsSync(path)) continue;
    const values = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
    if (values.DSH_ANDROID_BRIDGE_URL && values.DSH_ANDROID_BRIDGE_TOKEN) {
      return { url: values.DSH_ANDROID_BRIDGE_URL, token: values.DSH_ANDROID_BRIDGE_TOKEN };
    }
  }
  return null;
}

const found = bridge();
if (found === null) {
  console.error("!! 找不到控制桥（DSH_ANDROID_BRIDGE_URL/TOKEN，或 /etc/dsh-android/bridge.env）");
  process.exit(2);
}

async function call(path, body) {
  const response = await fetch(found.url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: Object.assign(
      { "X-Dsh-Token": found.token },
      body === undefined ? null : { "Content-Type": "application/json" }
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`桥返回的不是 JSON：${text.slice(0, 160)}`);
  }
}

let pass = 0;
let fail = 0;
let skip = 0;

function ok(name, detail) {
  pass++;
  console.log(`  [PASS] ${name}${detail ? "  " + detail : ""}`);
}

function bad(name, expected, actual) {
  fail++;
  console.log(`  [FAIL] ${name}`);
  console.log(`         期望：${expected}`);
  console.log(`         实际：${actual}`);
}

function skipped(name, why) {
  skip++;
  console.log(`  [SKIP] ${name}${why ? "  " + why : ""}`);
}

function check(name, condition, expected, actual) {
  if (condition) ok(name, typeof actual === "string" ? actual : "");
  else bad(name, expected, String(actual));
}

async function main() {
  console.log(`dsh-android ${EXPECT_APP} /android 接口冒烟（${FULL ? "含副作用项" : "只读"}）`);

  console.log("\n=== 1. 发现与信息");
  const discovery = await call("/android");
  check("GET /android 可用", discovery.ok === true, "ok:true", JSON.stringify(discovery).slice(0, 160));
  check("API 版本", discovery.api === EXPECT_API, String(EXPECT_API), String(discovery.api));
  const endpointList = Array.isArray(discovery.endpoints) ? discovery.endpoints : [];
  check("端点清单", endpointList.length >= 18, ">=18 个端点", `${endpointList.length} 个`);
  check("清单含 /android/biometric", endpointList.some((item) => item && item.path === "/android/biometric"),
    "包含 /android/biometric", JSON.stringify(endpointList.map((item) => item && item.path)).slice(0, 240));

  const info = await call("/android/info");
  check("GET /android/info 可用", info.ok === true, "ok:true", JSON.stringify(info).slice(0, 160));
  check("应用版本", info.app && info.app.version === EXPECT_APP, EXPECT_APP,
    info.app ? String(info.app.version) : "<无 app>");
  check("构建号", info.app && info.app.versionCode === EXPECT_CODE, String(EXPECT_CODE),
    info.app ? String(info.app.versionCode) : "<无 app>");
  const capabilities = info.capabilities || {};
  for (const key of ["accessibility", "overlay", "writeSettings", "dnd", "notifications",
    "vibrate", "clipboard", "share", "apps", "screenshot", "biometric", "storage"]) {
    if (typeof capabilities[key] !== "boolean") {
      bad(`capabilities.${key}`, "boolean", String(capabilities[key]));
    }
  }
  ok("能力矩阵字段完整", "12 个 boolean");
  console.log(`         能力：${JSON.stringify(capabilities)}`);

  const permissions = await call("/android/permissions");
  check("GET /android/permissions 可用", permissions.ok === true && permissions.granted !== undefined,
    "ok:true 且带 granted", JSON.stringify(permissions).slice(0, 160));

  console.log("\n=== 2. 只读状态端点");
  const volume = await call("/android/volume");
  check("GET /android/volume", volume.ok === true && volume.streams && volume.streams.music,
    "ok:true 且带 streams.music", JSON.stringify(volume).slice(0, 160));
  const display = await call("/android/display");
  check("GET /android/display", display.ok === true && display.brightness && display.rotation,
    "ok:true 且带 brightness/rotation", JSON.stringify(display).slice(0, 160));
  const dnd = await call("/android/dnd");
  check("GET /android/dnd", dnd.ok === true && typeof dnd.granted === "boolean",
    "ok:true 且带 granted", JSON.stringify(dnd).slice(0, 160));
  const notifications = await call("/android/notify");
  check("GET /android/notify", notifications.ok === true && Array.isArray(notifications.notifications),
    "ok:true 且带 notifications[]", JSON.stringify(notifications).slice(0, 160));
  const apps = await call("/android/apps?limit=3");
  check("GET /android/apps?limit=3", apps.ok === true && Array.isArray(apps.apps) && apps.apps.length > 0,
    "ok:true 且至少 1 个应用", JSON.stringify(apps).slice(0, 200));

  console.log("\n=== 3. AI 授权与终端中继（只读，不弹指纹）");
  // GET 状态永远不会弹窗；POST /android/biometric 才弹，所以这里只做 GET。
  const biometric = await call("/android/biometric");
  check("GET /android/biometric 只读状态",
    biometric.ok === true && typeof biometric.available === "boolean"
      && typeof biometric.enrolled === "boolean" && typeof biometric.deviceSecure === "boolean",
    "ok:true 且 available/enrolled/deviceSecure 为 boolean",
    JSON.stringify(biometric).slice(0, 240));
  check("biometric.mode 合法", ["biometric", "credential", "none"].includes(biometric.mode),
    "biometric / credential / none", String(biometric.mode));
  if (typeof capabilities.biometric === "boolean") {
    check("capabilities.biometric 与状态一致", capabilities.biometric === biometric.available,
      "与 /android/biometric.available 相同",
      `${capabilities.biometric} vs ${biometric.available}`);
  }

  // /ai/consent 是设置页读接口，不需要 session、不弹窗。
  const consent = await call("/ai/consent");
  const consentCapabilities = consent && Array.isArray(consent.capabilities) ? consent.capabilities : [];
  check("GET /ai/consent 只读列表",
    consent.ok === true && Array.isArray(consent.sessions),
    "ok:true 且 sessions[]", JSON.stringify(consent).slice(0, 240));
  check("授权能力表齐全",
    EXPECT_CAPABILITIES.every((name) => consentCapabilities.includes(name)),
    EXPECT_CAPABILITIES.join(","), consentCapabilities.join(",") || "<空>");
  check("授权条目形状", consent.sessions.every((entry) => entry && typeof entry.session === "string"
    && Array.isArray(entry.grants)), "每项含 session 与 grants[]",
    JSON.stringify(consent.sessions).slice(0, 240));

  // 高危集合：GET /ai/consent 自带 risk；默认是 clipboard/control/screenshot，
  // 但用户可以改，所以“默认值”这一条只在确实没改过时才 PASS，改过就记为 SKIP。
  const consentRisk = consent && Array.isArray(consent.risk) ? consent.risk : null;
  check("GET /ai/consent 带 risk", consentRisk !== null, "risk 数组",
    JSON.stringify(consent).slice(0, 240));
  if (consentRisk !== null) {
    check("risk 只含已知能力",
      consentRisk.every((capability) => EXPECT_CAPABILITIES.includes(capability)),
      EXPECT_CAPABILITIES.join(","), consentRisk.join(",") || "<空>");
    check("risk 长度不超 6", consentRisk.length <= EXPECT_CAPABILITIES.length,
      `<= ${EXPECT_CAPABILITIES.length}`, String(consentRisk.length));
    const isDefaultRisk = consentRisk.length === DEFAULT_RISK.length
      && DEFAULT_RISK.every((capability) => consentRisk.includes(capability));
    if (isDefaultRisk) {
      ok("默认高危含 clipboard/control/screenshot", consentRisk.join(","));
    } else {
      skipped("默认高危集合", "设备上的高危集合被改过：" + (consentRisk.join(",") || "<空>"));
    }
  }

  // 页面侧中继：只靠桥令牌、不弹窗。会取走队列里待执行的命令（通常为空）。
  const relay = await call("/terminal/tabs/commands");
  const relayState = relay && relay.state;
  check("GET /terminal/tabs/commands 只读中继",
    relay.ok === true && Array.isArray(relay.commands) && relayState !== null
      && typeof relayState === "object" && Array.isArray(relayState.tabs),
    "ok:true 且 commands[]/state.tabs[]", JSON.stringify(relay).slice(0, 280));
  // 不调用 /ai/android、/ai/terminal/tabs：默认 read/terminal 低危不弹，但用户可能把它们设为高危，
  // 脚本不冒弹指纹的风险。

  if (FULL) {
    check("biometric 状态自洽",
      biometric.available === (biometric.sdk >= 28 && biometric.enrolled === true),
      "available = sdk>=28 && enrolled",
      `sdk=${biometric.sdk} enrolled=${biometric.enrolled} available=${biometric.available}`);
    const relayAgain = await call("/terminal/tabs/commands");
    check("终端中继可重复读取",
      relayAgain.ok === true && relayAgain.state && Array.isArray(relayAgain.state.tabs),
      "ok:true 且 state.tabs[]", JSON.stringify(relayAgain).slice(0, 200));
  } else {
    skipped("biometric 状态自洽 / 终端中继重复读取", "加 --full 才跑这两个深度只读检查");
  }

  console.log("\n=== 4. 无障碍相关");
  if (!capabilities.accessibility) {
    skipped("GET /android/foreground", "无障碍未开启（设置 → 安卓沙箱 → 手机助手）");
    skipped("POST /android/global", "无障碍未开启");
  } else {
    const foreground = await call("/android/foreground");
    check("GET /android/foreground", foreground.ok === true && typeof foreground.package === "string",
      "ok:true 且带 package", JSON.stringify(foreground).slice(0, 200));
    if (!FULL) {
      skipped("POST /android/global", "会切走当前界面，只在 --full 时跑");
    } else {
      const home = await call("/android/global", { action: "home" });
      check("POST /android/global home", home.ok === true, "ok:true", JSON.stringify(home).slice(0, 160));
    }
  }

  console.log("\n=== 5. 副作用项");
  if (!FULL) {
    skipped("toast / 震动 / 剪贴板 / 通知 / 截屏 / 亮度", "加 --full 才跑");
    skipped("AI 截屏落盘与保留 20 张", "需要 /ai/android 的按对话授权（会弹指纹），本脚本不弹");
  } else {
    const toast = await call("/android/toast", { text: "DSH Android API 冒烟：toast 正常" });
    check("POST /android/toast", toast.ok === true, "ok:true", JSON.stringify(toast).slice(0, 160));

    if (capabilities.vibrate) {
      const vibrate = await call("/android/vibrate", { ms: 60 });
      check("POST /android/vibrate", vibrate.ok === true, "ok:true", JSON.stringify(vibrate).slice(0, 160));
    } else {
      skipped("POST /android/vibrate", "设备无马达");
    }

    const original = await call("/android/clipboard");
    const sample = `dsh-android ${EXPECT_APP} clipboard check ${Date.now()}`;
    const wrote = await call("/android/clipboard", { text: sample });
    check("POST /android/clipboard 写入", wrote.ok === true, "ok:true", JSON.stringify(wrote).slice(0, 160));
    const read = await call("/android/clipboard");
    if (typeof original.text === "string") {
      await call("/android/clipboard", { text: original.text }).catch(() => {});
    }
    check("GET /android/clipboard 读回", read.ok === true,
      "ok:true", JSON.stringify(read).slice(0, 160));
    if (read.text !== sample) {
      skipped("剪贴板读回内容", "Android 10+ 后台读剪贴板为空是系统限制");
    } else {
      ok("剪贴板读写一致");
    }

    const posted = await call("/android/notify", {
      id: 999, title: "DSH Android API 冒烟", text: "这条通知会立刻撤回", ongoing: false
    });
    check("POST /android/notify", posted.ok === true, "ok:true", JSON.stringify(posted).slice(0, 160));
    const listed = await call("/android/notify");
    const hasIt = Array.isArray(listed.notifications)
      && listed.notifications.some((item) => item.id === 999);
    check("通知出现在列表里", hasIt, "列表含 id=999", JSON.stringify(listed.notifications || []).slice(0, 200));
    const cancelled = await call("/android/notify/cancel", { id: 999 });
    check("POST /android/notify/cancel", cancelled.ok === true, "ok:true", JSON.stringify(cancelled).slice(0, 160));

    if (capabilities.screenshot) {
      const shot = await call("/android/screenshot", { quality: 60, maxWidth: 480, maxHeight: 960 });
      const looksLikeImage = shot.ok === true && typeof shot.image === "string" && shot.image.length > 1000;
      check("POST /android/screenshot", looksLikeImage, "ok:true 且带 base64 图像",
        JSON.stringify({ ok: shot.ok, bytes: shot.bytes, width: shot.width, height: shot.height, error: shot.error }));
      skipped("AI 截屏落盘与保留 20 张", "需要 /ai/android 的按对话授权（会弹指纹），本脚本不弹");
    } else {
      skipped("POST /android/screenshot", "无障碍未开启或 Android < 11");
      skipped("AI 截屏落盘与保留 20 张", "截图本身不可用");
    }

    if (display.brightness && display.brightness.writable === true) {
      const same = await call("/android/display", { brightness: display.brightness.percent });
      check("POST /android/display（写回原亮度）", same.ok === true, "ok:true", JSON.stringify(same).slice(0, 160));
    } else {
      skipped("POST /android/display brightness", "没有「修改系统设置」权限");
    }
  }

  console.log(`\n汇总：PASS ${pass} / FAIL ${fail} / SKIP ${skip}`);
  if (fail > 0) {
    console.log("失败时请把这一整段输出连同 /snapshot 的 appVersion/appVersionCode 一起贴出来。");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`!! 冒烟脚本异常：${error && error.message ? error.message : error}`);
  process.exit(1);
});
