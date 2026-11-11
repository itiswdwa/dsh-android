# Android 接口（给插件）

`1.2.2` 起，DSH 的插件可以在**不装第二只 App、不要 root** 的前提下调用一组 Android 能力：
剪贴板、通知、音量、亮度、免打扰、应用、分享、截屏、全局动作、系统设置页、生物识别……
它们由应用侧的控制桥（`127.0.0.1:8399`）统一暴露，客户端插件（WebView 里的页面）和
沙箱里的 host 插件（Node 进程）走的是**同一组 HTTP 端点**。

这篇文档是这组接口的契约：端点、请求/响应、需要的系统权限，以及失败时怎么读取原因。
改接口时先改这里，再改 `app/java/dev/dsh/android/AndroidApi.java`（路由在
`BridgeServer.java`，权限跳转在 `MainActivity.java`，无障碍动作在 `Assist.java`）。
生物识别与给 AI 的按对话授权（`/ai/*`、`/terminal/tabs/*`）见 [AI-API.md](AI-API.md)。

---

## 1. 怎么连

控制桥只监听 `127.0.0.1`，每个请求带应用启动时随机生成的令牌：

| 位置 | 怎么拿 |
|---|---|
| 网页（客户端插件） | 应用注入的 `window.DshAndroid = { base, token, version, ... }`；`base` 形如 `http://127.0.0.1:8399` |
| 沙箱（host 插件 / shell） | 应用启动沙箱时注入的环境变量 `DSH_ANDROID_BRIDGE_URL`、`DSH_ANDROID_BRIDGE_TOKEN`（`shiz` / `ui` / `ball` 也读 `/etc/dsh-android/bridge.env`，设备上存在就用） |
| 已运行的会话 | `GET /snapshot` 里的 `bridge.url` / `bridge.token` |

请求头：`X-Dsh-Token: <token>`；POST 再加 `Content-Type: application/json`。
**401 只表示令牌错**；`/android/*`、`/ai/*`、`/terminal/tabs/*` 这些 JSON 面上的所有其它结果
（包括参数错误和未知的 JSON 面路径）都是 **HTTP 200** + `{ok:false,error,hint?,needs?}`，成败看
响应里的 `ok`（请求体不是合法 JSON 时也是 200 + `{ok:false,error:"请求体不是合法 JSON"}`）。
只有完全不在这些前缀下的路径才返回 **404**，可以用它探测某个端点存不存在。

`window.DshAndroid.version` 在 `1.2.2` 从 `1` 升到 `2`——老版本只保证 `base`/`token`/`pty`，
新插件应该先看 `version >= 2`（或先请求 `/android`）再使用下面的端点。它描述的是 `/android/*`
这层接口面，**仍是 `2`**；要判断这台设备有没有 `1.2.2` 的全部新端点（生物识别、`/ai/*`），看
`GET /android/info` 的 `app.versionCode`（本版 `10218`），或直接探测路径（404 = 没有）。

### 通用响应

成功：

```json
{ "ok": true, "message": "已提示", "...": "各端点自己的字段" }
```

失败（缺权限、设备不支持、参数不对）：

```json
{
  "ok": false,
  "error": "改亮度需要「修改系统设置」权限",
  "hint": "打开设置 → 应用 → DSH → 修改系统设置，或先请求 /android/permissions",
  "needs": "write_settings"
}
```

- `error`：给用户看的一句话；
- `hint`：下一步怎么办（可选）；
- `needs`：缺的是哪一类授权/条件，取值见 §3（可选）。

把异常翻译成这种结构的是 `AndroidApi.Failure`；`BridgeServer` 兜住其余异常，写成
`{ok:false,error:"..."}`。

### 最小客户端

```js
const api = globalThis.DshAndroid;
if (!api || api.version < 2) throw new Error("需要 1.2.2 及以上的 DSH Android");

async function android(path, body) {
  const response = await fetch(api.base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: Object.assign(
      { "X-Dsh-Token": api.token },
      body === undefined ? null : { "Content-Type": "application/json" }
    ),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) throw Object.assign(new Error(data.error), data);
  return data;
}

await android("/android/toast", { text: "来自插件的问候" });
```

沙箱里（host 插件、脚本）可以直接用环境变量：

```sh
curl -s -H "X-Dsh-Token: $DSH_ANDROID_BRIDGE_TOKEN" \
  "$DSH_ANDROID_BRIDGE_URL/android/info" | python3 -m json.tool

curl -s -X POST -H "X-Dsh-Token: $DSH_ANDROID_BRIDGE_TOKEN" \
  -H 'Content-Type: application/json' -d '{"text":"构建完成"}' \
  "$DSH_ANDROID_BRIDGE_URL/android/toast"
```

---

## 2. 发现与能力

### `GET /android`

接口清单，插件用它判断“这个版本的 App 有没有这个端点”。

```json
{
  "ok": true,
  "api": 2,
  "app": "1.2.2",
  "terminal": "3",
  "endpoints": [
    { "path": "/android/info", "method": "GET", "summary": "设备、应用、网络、电池、存储与能力矩阵" },
    { "path": "/android/biometric", "method": "GET/POST", "summary": "生物识别状态 / 用户确认（API 28+）" }
  ]
}
```

清单共 **18 条**（含 `/android/biometric`）。

### `GET /android/info`

一次拿齐“这是台什么设备、现在什么状态、我能做什么”。每个子对象内部出错只会缺字段，不会整个请求失败。

```json
{
  "ok": true,
  "api": 2,
  "app": {
    "package": "dev.dsh.android",
    "version": "1.2.2",
    "versionCode": 10218,
    "terminal": "3",
    "hot": "1.2.2-t3-sp2"
  },
  "device": {
    "brand": "Xiaomi", "manufacturer": "Xiaomi", "model": "25091RP04C",
    "device": "xaga", "product": "xaga", "android": "17", "sdk": 37,
    "abi": "arm64-v8a", "locale": "zh-CN", "timezone": "Asia/Shanghai",
    "uptimeSeconds": 1234567, "kernel": "4.19.191-gki"
  },
  "screen": {
    "width": 1080, "height": 2400, "densityDpi": 440, "density": 2.75,
    "rotation": 0, "rotationDegrees": 0, "refreshRate": 60.0,
    "brightnessPercent": 62, "autoBrightness": false, "keepScreenOn": false
  },
  "battery": {
    "percent": 82, "charging": false, "status": "discharging", "plugged": "none",
    "temperatureC": 31.2, "voltageMv": 4200, "health": "good", "powerSave": false
  },
  "memory": { "totalBytes": 0, "availBytes": 0, "lowMemory": false, "thresholdBytes": 0 },
  "storage": {
    "internal": { "totalBytes": 0, "freeBytes": 0 },
    "shared":   { "path": "/storage/emulated/0", "totalBytes": 0, "freeBytes": 0 }
  },
  "network": {
    "connected": true, "type": "wifi", "metered": false,
    "validated": true, "vpn": false, "ipv4": "192.168.1.5"
  },
  "capabilities": {
    "accessibility": true, "overlay": true, "writeSettings": false, "dnd": false,
    "notifications": true, "vibrate": true, "clipboard": true,
    "share": true, "apps": true, "screenshot": true, "mediaKeys": true,
    "biometric": true, "storage": true, "microphone": false,
    "batteryOptimizationIgnored": false,
    "shizuku": { "installed": true, "granted": true }
  }
}
```

`network.type`：`wifi` / `cellular` / `ethernet` / `vpn` / `bluetooth` / `other` / `none`。
`battery.status`：`charging` / `discharging` / `full` / `not_charging` / `unknown`。
`capabilities.biometric`：现在就能弹生物识别确认（Android 9+ 且录入过指纹/人脸，见 §4.14）。

### `GET /android/permissions`

权限矩阵 + 给人看的授权提示。字段与 `/android/info` 的 `capabilities` 一致，
另加 `hints`（每个未授权项对应的系统路径）：

```json
{
  "ok": true,
  "granted": {
    "accessibility": true, "overlay": false, "writeSettings": false,
    "dnd": false, "notifications": true, "microphone": false,
    "biometric": false, "storage": true, "batteryOptimizationIgnored": false,
    "shizuku": { "installed": true, "granted": true }
  },
  "hints": {
    "accessibility": "设置 → 无障碍 → 已下载的服务 → DSH 手机助手",
    "writeSettings": "设置 → 应用 → DSH → 修改系统设置",
    "dnd": "设置 → 通知 → 勿扰 → 授予 DSH 权限",
    "battery": "设置 → 电池 → 应用耗电管理 → DSH → 不限制"
  }
}
```

### `POST /android/permissions`

打开系统授权页（或弹运行时权限）。`request` 取值：

| 值 | 行为 |
|---|---|
| `accessibility` | 打开「已下载的服务 / 无障碍」列表 |
| `overlay` | 打开「显示在其他应用上层」 |
| `microphone` | 运行时请求录音权限 |
| `write_settings` | 打开「修改系统设置」 |
| `dnd` | 打开「勿扰权限」 |
| `notification` | 打开本应用的通知设置 |
| `battery` | 请求忽略电池优化 |
| `shizuku` | 请求 Shizuku 授权 |

```json
{ "ok": true, "requested": "write_settings", "message": "已打开系统页面" }
```

授权回来后用 `GET /android/permissions` 复查（页面切回来通常已经生效）。
生物识别不是权限页能开的（要去系统里录入指纹/人脸），见 §3 的 `android9` / `biometric`。

---

## 3. `needs` 取值

`needs` 说明缺什么。**系统授权类**可以直接交给 `POST /android/permissions` 的 `request` 打开系统页；
**非系统授权类**（设备能力/系统版本/对话授权/前后台状态）只能按说明解决，喂给 `/android/permissions` 没有意义。

系统授权类：

| `needs` | 含义 | 对应 `request` |
|---|---|---|
| `accessibility` | 无障碍服务没开（截屏、读屏、全局动作都靠它） | `accessibility` |
| `overlay` | 显示在其他应用上层（悬浮球 / 后台拉起界面） | `overlay` |
| `microphone` | 录音 | `microphone` |
| `write_settings` | 改系统亮度、自动亮度、旋转需要 | `write_settings` |
| `dnd_access` | 改免打扰过滤级别需要 | `dnd` |
| `notification` | 通知被系统关掉 | `notification` |
| `battery` | 电池优化（保活） | `battery` |
| `shizuku` | Shizuku 不可用/未授权 | `shizuku` |

非系统授权类（不要喂给 `/android/permissions`）：

| `needs` | 含义 | 怎么解决 |
|---|---|---|
| `android11` | 截屏 / 系统截屏需要 Android 11（API 30）及以上 | 升级系统；否则功能不可用 |
| `android12` | `dismiss_notifications`（收起通知栏）需要 Android 12（API 31）及以上 | 同上 |
| `android9` | 生物识别需要 Android 9（API 28）及以上 | 同上 |
| `biometric` | 设备没有可用的生物识别（没录入指纹/人脸；只设了锁屏密码不算） | 在系统设置里录入指纹/人脸 |
| `consent` | 这个高危能力还没被当前对话授权（用户拒绝/取消，或在设置里撤销了）；低危能力不会返回它 | 重新发一次 AI 调用会再弹确认；撤销位置与高危集合见 [AI-API.md](AI-API.md) |
| `foreground` | DSH 页面不在前台/被系统冻结，终端标签页命令等不到页面响应 | 回到 DSH 页面再试 |

---

## 4. 端点

### 4.1 剪贴板 —— `GET/POST /android/clipboard`

```json
GET  → { "ok": true, "text": "现在剪贴板里的文字" }
POST { "text": "要写进去的文字" }
     → { "ok": true, "message": "已写入剪贴板" }
```

限制：Android 10 起，应用不在前台时读剪贴板可能拿到空串（系统限制，不是接口错误）；
写不受影响。剪贴板可能含密码/验证码，插件不要在日志或模型上下文里回显。

### 4.2 轻提示 —— `POST /android/toast`

```json
{ "text": "已保存", "long": false }
→ { "ok": true, "message": "已提示" }
```

`long: true` 对应 `Toast.LENGTH_LONG`。不打断用户，也不需要通知权限。

### 4.3 震动 —— `POST /android/vibrate`

```json
{ "pattern": [0, 120, 80, 120] }
或 { "ms": 120, "amplitude": 200 }
→ { "ok": true, "durationMs": 320 }
```

`pattern` 单位毫秒，奇数下标是震动时长、偶数下标是间隔（整段用系统默认振幅）；`ms` 单发时可用 `amplitude` 0–255 指定强度，省略用系统默认。
需要设备有马达（`capabilities.vibrate`）。

### 4.4 通知 —— `GET/POST /android/notify`、`POST /android/notify/cancel`

发的是**本应用名下的普通通知**（不占前台服务的位置），走独立通道 `dsh-plugins`：

```json
POST /android/notify
{ "id": 1, "title": "构建完成", "text": "APK 已生成", "ongoing": false, "progress": 100 }
→ { "ok": true, "id": 1, "message": "已发出通知" }

GET /android/notify
→ { "ok": true, "notifications": [
      { "id": 1, "title": "构建完成", "text": "APK 已生成", "ongoing": false, "postedMs": 1760000000000 }
  ] }

POST /android/notify/cancel
{ "id": 1 }            // 或 { "all": true }
→ { "ok": true, "message": "已取消 1 条" }
```

- `id` 1–999，同一 `id` 再发一次就是**原地更新**；插件侧 id 会映射到应用内的 10000+id，不会碰到服务通知。
- **`id` 越界会直接报错**，`notify` 和 `cancel` 都不会静默截断；`cancel` 既没 `id` 也没 `all: true` 时同样报错。
- `progress` 0–100 可选；带进度时自动 `onlyAlertOnce`，不会每帧响。
- 点通知打开 DSH 应用。
- `silent: true` 走低重要度的 `dsh-plugins-quiet` 通道（不发声、不弹横幅）；
- 需要通知未被系统关闭（`capabilities.notifications`）；失败时 `needs: "notification"`。

### 4.5 音量与媒体键 —— `GET/POST /android/volume`

```json
GET → {
  "ok": true,
  "ringerMode": "normal",
  "streams": {
    "music":        { "percent": 50, "index": 7, "max": 15, "muted": false },
    "ring":         { "percent": 40, "index": 4, "max": 10, "muted": false },
    "alarm":        { "percent": 80, "index": 8, "max": 10, "muted": false },
    "notification": { "percent": 40, "index": 4, "max": 10, "muted": false },
    "call":         { "percent": 30, "index": 3, "max": 10, "muted": false }
  }
}
```

POST 支持四种写法（可组合，先音量、再铃声模式、最后媒体键）：

```json
{ "stream": "music", "percent": 30, "showUi": true }
{ "stream": "music", "adjust": "up" }          // up / down / mute / unmute
{ "ringer": "silent" }                          // normal / vibrate / silent
{ "media": "next" }                             // play / pause / toggle / next / previous / stop
→ GET 的完整状态 + { "message": "已调整 music" }
```

- `ringerMode` 可能被「勿扰」或 OEM 策略固定在某一档，返回的是**实际生效值**。
- 媒体键通过 `AudioManager.dispatchMediaKeyEvent` 发给当前媒体会话，不保证每个 App 都响应。

### 4.6 屏幕 —— `GET/POST /android/display`

```json
GET → {
  "ok": true,
  "brightness": { "percent": 50, "raw": 128, "max": 255, "estimated": false, "auto": false, "writable": false },
  "rotation":   { "auto": true, "user": 0, "current": 0, "degrees": 0 },
  "screen":     { "width": 1080, "height": 2400, "densityDpi": 440, "refreshRate": 60.0 },
  "keepScreenOn": false
}
```

POST（按需组合，一次可以改多项）：

```json
{ "brightness": 40 }                    // 0–100，自动置为手动模式
{ "auto": true }                        // 自动亮度
{ "rotation": "auto" }                  // auto / portrait / landscape / reverse-portrait / reverse-landscape
{ "keepOn": true }                      // 应用在前台时保持屏幕常亮
→ GET 的完整状态 + { "message": "已更新显示设置" }
```

- 亮度、自动亮度、旋转写系统设置，需要「修改系统设置」；未授权返回 `needs: "write_settings"`。
- `brightness.estimated: true` 表示这台 ROM 读不到系统亮度量程，`percent` 是按回退量程估算的；
  此时写亮度的响应消息会注明「量程为估算值，可能不准」。
- `keepOn` 只作用于 DSH 窗口，退出应用即失效，不需要权限。
- `rotation` 的具体方向是**尽力而为**：部分厂商 ROM 会忽略 `USER_ROTATION`。

### 4.7 免打扰 —— `GET/POST /android/dnd`

```json
GET  → { "ok": true, "granted": true, "filter": "all" }
POST { "filter": "priority" }
     → { "ok": true, "granted": true, "filter": "priority", "message": "免打扰已切换" }
```

`filter`：`all`（全部允许）/ `priority`（仅优先）/ `alarms`（仅闹钟）/ `none`（完全静默）。
需要勿扰访问权限，否则 `needs: "dnd_access"`。

### 4.8 应用 —— `GET/POST /android/apps`

```json
GET /android/apps?system=0&q=微&limit=200
→ {
  "ok": true, "count": 42, "matched": 42, "returned": 1,
  "apps": [
    { "package": "com.tencent.mm", "label": "微信", "versionName": "8.0.50",
      "versionCode": 2600, "system": false, "enabled": true }
  ]
}

POST /android/apps { "action": "launch", "package": "com.tencent.mm" }
→ { "ok": true, "message": "已启动 微信" }
```

- `system=1` 才包含系统应用，默认只列用户装的；`q` 同时匹配应用名与包名；`limit` 默认 200、上限 1000。
- `count` / `matched` 是匹配总数，`returned` 是这次实际返回的条数（受 `limit` 限制，两者可能不同）。
- `action`：`launch`（有启动界面才成功）/ `details`（应用详情页）/ `uninstall`（系统卸载确认框，**不会静默卸载**）。
- 列应用在低端机上可能要几百毫秒，别在轮询里反复调用。

### 4.9 分享 —— `POST /android/share`

```json
{ "text": "看这个：https://example.com", "title": "分享到" }
→ { "ok": true, "message": "已打开分享面板" }
```

走系统分享面板，用户自己选目标；接口只负责把内容递过去。

### 4.10 前台应用 —— `GET /android/foreground`

```json
{ "ok": true, "package": "com.tencent.mm", "app": "微信", "class": "com.tencent.mm.ui.LauncherUI", "own": false }
```

靠无障碍读当前活动窗口，需要无障碍服务（`needs: "accessibility"`）；锁屏或无窗口时 `package` 为空串。

### 4.11 截屏 —— `POST /android/screenshot`

```json
{ "quality": 75, "maxWidth": 1080, "maxHeight": 2400 }
→ {
  "ok": true, "mime": "image/jpeg", "width": 1080, "height": 2400,
  "bytes": 321000, "tookMs": 210,
  "image": "<JPEG 的 base64，不带 data: 前缀>"
}
```

- 用无障碍服务的 `takeScreenshot`（Android 11 / API 30+），需要无障碍已开启，否则 `needs: "accessibility"`；
  系统版本不够时 `needs: "android11"`。
- 无障碍已开但系统拒绝截屏（例如服务被系统停用）时同样返回 `needs: "accessibility"`，
  `hint` 会让你去「设置 → 安卓沙箱 → 手机助手」关掉再打开；截得太频繁会返回"系统限制截屏频率，
  等一秒再试"（没有 `needs`）。
- 默认按 `maxWidth/maxHeight` 等比缩小、JPEG 质量 75，避免把几 MB 的原图塞进模型上下文。
- 截屏可能包含密码、聊天记录，属于敏感数据，插件必须自己决定是否展示/存储。
- 给 AI 用时不要走这里（base64 会进模型上下文）：走 `/ai/android`，它会存成文件只回路径，
  且只保留最近 20 张 `Download/dsh-shot-*.jpg`（更旧的自动删除），见 [AI-API.md](AI-API.md)。

### 4.12 全局动作 —— `POST /android/global`

```json
{ "action": "home" }
→ { "ok": true, "message": "已执行 home" }
```

| `action` | 动作 | 最低版本 |
|---|---|---|
| `back` / `home` / `recents` / `notifications` | 返回 / 主屏 / 最近任务 / 通知栏 | 26 |
| `lock` | 锁屏 | 28 |
| `quick_settings` | 快捷设置面板 | 26 |
| `power_dialog` | 长按电源键菜单 | 26 |
| `split_screen` | 分屏 | 26 |
| `screenshot` | 系统截屏 | 30 |
| `dismiss_notifications` | 收起通知栏 | 31 |

需要无障碍服务；系统版本不够时 `screenshot` 返回 `needs: "android11"`、`dismiss_notifications`
返回 `needs: "android12"`，`lock` 在 Android 9 以下只返回可读错误（没有可补的授权）。
（更细的点击、滑动、输入、读屏仍走原来的 `/a11y/*`，见 `ARCHITECTURE.md`。）

### 4.13 打开东西 —— `POST /android/open`

```json
{ "url": "https://example.com" }        // 只允许 http / https / mailto / tel
{ "package": "com.tencent.mm" }
{ "settings": "wifi" }
→ { "ok": true, "message": "已打开 WLAN 设置" }
```

`settings` 取值：`home`、`wifi`、`bluetooth`、`data`、`airplane`、`location`、`display`、
`sound`、`battery`、`app`、`notification`、`accessibility`、`overlay`、`write_settings`、
`dnd`、`storage`、`developer`。

### 4.14 生物识别 —— `GET/POST /android/biometric`

`GET` 查状态：

```json
{ "ok": true, "sdk": 37, "available": true, "enrolled": true,
  "deviceSecure": true, "mode": "biometric", "message": "" }
```

- `available`：现在就能弹生物识别确认（Android 9+ 且录入过指纹/人脸）。**只设了锁屏密码、没录指纹/人脸时
  `available` 是 `false`**，`mode` 为 `credential`、`deviceSecure` 为 `true`（应用不做"普通确认框"降级）；
- `mode`：`biometric` / `credential` / `none`；`message` 是给人看的原因，可用时为空串；
  Android 9 以下 `available` 为 `false`、`mode` 为 `none`，`message` 说明需要 Android 9。

`POST` 弹系统确认：

```json
{ "title": "可选的标题", "subtitle": "可选的副标题", "description": "可选的说明" }
→ { "ok": true, "authenticated": true }
→ { "ok": false, "authenticated": false, "error": "用户取消或验证失败" }
→ { "ok": false, "authenticated": false, "error": "…", "hint": "…", "needs": "biometric" }
```

- 走系统 `BiometricPrompt`：Android 9 上只允许生物识别；Android 10+ 在已录入生物识别时允许回退到
  设备凭据（锁屏密码/图案）；
- **标题由应用统一加「DSH 请求：」前缀**（幂等：已带就不重复加），`title` 为空时用「验证身份」；
  `title`/`subtitle`/`description` 都会去掉换行、压成单行，**每行最多 120 字符**（超长截断）；
- 同一时刻只弹一个，bridge 最多等 60 秒；应用不在前台时会先尝试把 DSH 带到前台，2 秒内没回来就报错
  「DSH 不在前台，无法显示生物识别确认；请先回到 DSH 页面再试」；
- 用户取消 / 验证失败 / 超时只返回可读 `error`（`needs` 为空，重试即可）；设备不支持时
  `needs: "android9"`、没录入时 `needs: "biometric"`，并给设置路径；
- 这个端点本身就是一次用户确认，**不需要按对话授权**；AI 侧的同名工具直接调它，
  而按对话授权的确认弹窗标题同样由应用生成并带前缀，见 [AI-API.md](AI-API.md)。

---

## 5. 权限与隐私

这组接口是**桥令牌的能力延伸**：能读 `window.DshAndroid`（或 guest 的 `DSH_ANDROID_BRIDGE_*` 环境变量）的
代码，就能用它们。装进来的第三方插件因此也拿得到——这是设计目标，不是漏洞；但要注意：

- 桥上所有端点只监听回环，令牌每启动一次重新生成；
- 剪贴板、通知、前台应用、截屏是**用户隐私面**，插件应当“用户可见、用户可预期”地使用，
  不要把内容写进日志、不要上传；
- 生物识别只用于"用户本人确认"：应用不采集也不保存指纹/人脸数据，弹窗和校验都由系统完成；
- `/android/biometric` 的标题/说明由调用方提供，属于不可信文案——应用会统一加「DSH 请求：」
  前缀、压单行并截断到 120 字符，但内容本身仍不可信；插件别用它冒充系统提示；
- 给 AI 用的按对话授权（`/ai/*`）只作用于**用户勾选为高危**的能力（默认 剪贴板 / 操作手机设置 /
  截屏；`read`、`notify`、`terminal` 默认低危直接放行、不留记录）：高危能力首次使用弹生物识别确认、
  按对话记住，可在 设置 → 安卓沙箱 → **AI 授权** 调整高危集合并撤销；它只拦 AI 入口，
  直接调 `/android/*` 的插件不受约束（桥令牌仍是能力边界），契约见 [AI-API.md](AI-API.md)；
- AI 截屏会落盘到共享存储的 `Download/`，只保留最近 20 张 `dsh-shot-*.jpg`，更旧的自动删除；
- 卸载应用只能拉起系统确认框；不存在静默安装/卸载；
- 改亮度/旋转、免打扰、后台拉起界面都受系统授权约束，接口只负责转达与解释原因；
- 新增端点时同时更新 `GET /android` 的清单与本文档，否则老插件会靠“试”来发现。

---

## 6. 已知限制

| 限制 | 原因 |
|---|---|
| 后台读剪贴板可能是空串 | Android 10+ 只允许有焦点的应用读 |
| 通知/截屏在无障碍关闭时不可用 | 依赖 `AccessibilityService` |
| 改亮度/旋转要求「修改系统设置」 | `WRITE_SETTINGS` 是特殊权限，不能运行时弹窗 |
| 免打扰要求「勿扰访问」 | 系统策略权限 |
| 从后台打开 Activity 在部分 ROM 上被拒 | Android 10+ 后台启动限制；有悬浮窗权限时通常放行 |
| 截屏在 Android 11 以下不可用 | `takeScreenshot` 是 API 30 才有的系统接口 |
| 应用列表可能包含被禁用的应用 | `enabled: false`，由调用方自己过滤 |
| 生物识别要 Android 9+ 且录入过指纹/人脸 | 系统 `BiometricPrompt` 是 API 28 才有；只有锁屏密码不能当确认方式 |
| 没有生物识别的设备用不了 AI 操作 | 按对话授权要求生物识别确认（见 [AI-API.md](AI-API.md)），拿不到授权 |
| AI 截屏文件只保留最近 20 张 | `Download/dsh-shot-*.jpg` 超出部分自动删除；更早的图找不回来 |
| 终端标签页命令要 DSH 页面在前台响应 | 标签页是页面内状态，应用只做中继 |

---

## 7. 变更记录

- `1.2.2`（`versionCode` 10218，10217 / 10216 / 10215 作废）：`/android/*` 契约未变；本次只改了
  agent `ui` 工具与编译 API（compileSdk 35，targetSdk 仍 28），以及导航栏分隔线跟随主题。
- `1.2.2`（`versionCode` 10217，10216 / 10215 作废）：新增 `/android`、`/android/info`、`/android/permissions`、
  `/android/clipboard`、`/android/toast`、`/android/vibrate`、`/android/notify`、
  `/android/notify/cancel`、`/android/volume`、`/android/display`、`/android/dnd`、`/android/apps`、
  `/android/share`、`/android/foreground`、`/android/screenshot`、`/android/global`、`/android/open`、
  `/android/biometric`（共 18 个）；`window.DshAndroid.version` 升到 `2`；无障碍服务声明
  `canTakeScreenshot`；AI 侧的 `/ai/android`、`/ai/consent`、`/ai/consent/revoke`、
  `/ai/consent/risk`、`/ai/terminal/tabs` 与页面中继 `/terminal/tabs/commands`、
  `/terminal/tabs/report` 见 [AI-API.md](AI-API.md)（按对话授权只对用户设为高危的能力生效）。
