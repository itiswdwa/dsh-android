# AI 接口与按对话授权（1.2.2）

> 这版在原有 `/android/*` 之上加三块：**生物识别**、**终端标签页管理**、**按对话（sessionId）
> 的高危能力授权与生物识别确认**。全部经控制桥（`127.0.0.1:8399`，`X-Dsh-Token`）；响应仍是
> `{ok:true,...}` / `{ok:false,error,hint?,needs?}`。
>
> 版本：仍为 `1.2.2`，`VERSION_CODE=10217`（10216 / 10215 作废）。`window.DshAndroid.version`
> 仍是 `2`——它描述的是 `/android/*` 那层接口面；AI 端点用 `GET /android/info` 的
> `app.versionCode`（≥ `10217`）或直接探测路径判断（JSON 面的未知路径是 HTTP 200 + `{ok:false}`，不是 404）。
>
> **边界**：授权只作用于 AI 入口（`/ai/android`、`/ai/terminal/tabs`）里**被用户设为高危**的能力；
> 低危能力直接放行、不弹窗。直接拿桥令牌调 `/android/*` 的插件不受这层约束——桥令牌本来就是
> 能力边界；这一层是“高位操作动手前你能看见、事后能收回”的确认与审计，不是权限隔离。详见 §5。

## 1. 生物识别

### `GET /android/biometric`

```json
{ "ok": true, "sdk": 37, "available": true, "enrolled": true, "deviceSecure": true,
  "mode": "biometric", "message": "" }
```

- `available`：现在就能弹生物识别确认（Android 9+ 且录入过指纹/人脸）。只设了锁屏密码、没录
  指纹/人脸时是 `false`（应用不做普通确认框降级），此时 `mode` 为 `credential`、
  `deviceSecure` 为 `true`；
- `mode`：`biometric` / `credential` / `none`；
- `message`：给人看的原因，可用时为空串；Android 9 以下 `available` 为 `false`、`mode` 为 `none`；
- 这个端点不需要按对话授权。

### `POST /android/biometric`

```json
{ "title": "可选的标题", "subtitle": "可选的副标题", "description": "可选的说明" }
→ { "ok": true, "authenticated": true }
→ { "ok": false, "authenticated": false, "error": "用户取消或验证失败" }
→ { "ok": false, "authenticated": false, "error": "…", "hint": "…", "needs": "biometric" }
```

- 走系统 `BiometricPrompt`：Android 9 只允许生物识别；Android 10+ 在已录入生物识别时允许回退到
  设备凭据（锁屏密码/图案）；
- **标题由应用统一加「DSH 请求：」前缀**（幂等：调用方已经带了就不重复加），`title` 为空时用
  「验证身份」。`title`/`subtitle`/`description` 都会去掉换行、压成单行，**每行最多 120 字符**
  （超长截断）——插件不能拿它画一整屏假系统弹窗；
- 同一时刻只弹一个（第二个请求返回「另一次生物识别确认正在进行，请稍后再试」），bridge 最多等
  60 秒；
- 应用不在前台时会先尝试把 DSH 带到前台，2 秒内没回来就报错「DSH 不在前台，无法显示生物识别
  确认；请先回到 DSH 页面再试」；
- 用户取消 / 验证失败 / 超时只返回可读 `error`（`needs` 为空，重试即可）；设备不支持时
  `needs: "android9"`、没录入时 `needs: "biometric"`，并给设置路径；
- 这个端点本身就是一次用户确认，**不需要按对话授权**；AI 侧的 `android_biometric` 工具直接调它。
  高危能力的确认弹窗是另一个流程，标题同样带前缀，见 §2；
- 完整的错误语义（含"什么时候带 `needs`"）同样适用于 `docs/ANDROID-API.md` §3。

## 2. 按对话授权（只对高危能力）

### 2.1 哪些能力需要确认

授权只对**用户勾选为「高危」**的能力生效。低危能力直接放行：**不弹窗、不记录授权**。
默认高危是 `clipboard`、`control`、`screenshot`；`read`、`notify`、`terminal` 默认低危。

| capability | 中文名（弹窗/设置页用） | 覆盖的端点 | 默认 |
|---|---|---|---|
| `read` | 读取设备与状态 | `/android`；`/android/info` `/android/permissions` `/android/foreground`；`/android/volume` `/android/display` `/android/dnd` `/android/apps` `/android/notify` 的 GET | 低危 |
| `clipboard` | 剪贴板 | `/android/clipboard` | **高危** |
| `notify` | 提示与通知 | `/android/toast` `/android/vibrate` `/android/notify` POST `/android/notify/cancel` | 低危 |
| `control` | 操作手机设置 | `/android/volume` `/android/display` `/android/dnd` 的 POST；`/android/share` `/android/open` `/android/global`；`/android/apps` POST；`POST /android/permissions` | **高危** |
| `screenshot` | 截屏 | `/android/screenshot` | **高危** |
| `terminal` | 终端标签页 | `/ai/terminal/tabs` | 低危 |

- **高危能力**：第一次用于某个对话时弹一次系统生物识别确认，通过后这个对话不再询问，
  直到在设置里撤销；应用重启后仍有效；
- **低危能力**：直接执行，不弹窗、不写入授权记录；即使之前被授权过，也不再询问；
- **高危集合由用户随时改**：`设置 → 安卓沙箱 → AI 授权` 顶部就是 6 个「高危能力」开关，
  勾选 = 该能力需要按对话确认；保存后写进 `ai.risk`，并**清掉不再高危的旧授权**（那些授权
  已经没有意义，设置页也不会再列）；
- **撤销只针对高危授权**：低危能力没有授权记录，也就没有可撤销的东西；切到低危后旧授权会被
  自动清理。

### 2.2 存储

高危授权（应用 SharedPreferences，键 `ai.consent`，值是下面这段 JSON 字符串；
`title`/`updatedMs` 记录对话标题与最后一次授权时间）：

```json
{ "sessions": { "<sessionId>": { "title": "对话标题", "updatedMs": 1760000000000,
  "grants": { "clipboard": 1760000000000, "screenshot": 1760000000000 } } } }
```

高危集合（应用 SharedPreferences，键 `ai.risk`，字符串数组；缺失或损坏时回退默认值）：

```json
["clipboard", "control", "screenshot"]
```

- 授权按 `sessionId` 隔离；**子代理有自己的 `exec.agent.id`，等于另一个对话**，要重新确认；
- 授权没有过期时间，应用重启后仍有效，只能在设置里撤销；
- 空数组是合法设置：表示"没有任何能力需要确认"，此时所有 AI 调用都直接放行。

### 2.3 首次确认的文案（仅高危能力）

- 标题固定为 `DSH 请求：允许这个对话使用「<中文名>」？`；
- 副标题为 `对话：<会话标题，取不到就用 session 前 8 位>`；
- 说明为 `确认后这个对话不再询问，可在 设置 → 安卓沙箱 → AI 授权 撤销。`；
- 三行都会去换行、压成单行、每行最多 120 字符；`sessionTitle` 在存储/展示前最多 60 字符；
- 同一时刻只弹一个，应用不在前台时先尝试把 DSH 带到前台（失败就返回可读错误，不阻塞 60 秒）；
- **拒绝/取消/验证失败/超时**返回
  `{ok:false, error:"用户拒绝了这个对话的授权", needs:"consent", capability, session}`；
- 生物识别不可用（没录入指纹/人脸，或只有锁屏密码）→ `needs:"biometric"` 并给设置路径；
  Android 9 以下 → `needs:"android9"`；这时高危能力用不了，但低危能力照常放行。

### `GET /ai/consent`（设置页读，不需要 session）

```json
{ "ok": true,
  "capabilities": ["read","clipboard","notify","control","screenshot","terminal"],
  "risk": ["clipboard", "control", "screenshot"],
  "sessions": [ { "session": "…", "title": "…", "updatedMs": 0,
                  "grants": [ { "capability": "clipboard", "grantedMs": 0 } ] } ] }
```

- `risk`：当前高危集合，顺序固定为 `read` / `clipboard` / `notify` / `control` / `screenshot` /
  `terminal` 的相对顺序；可能是空数组（什么都不需要确认）；
- `sessions` 只列**有授权记录**的会话，按 `updatedMs` 从新到旧；`title` 可能为空串
  （调用方没报过标题）。正常只有高危能力会产生授权；从旧构建升级来的设备如果还留着低危能力的
  旧记录，会在下一次保存高危集合（`POST /ai/consent/risk`）时被清掉；
- 会暴露对话标题，这只给本机设置页用（见 §5 的边界说明）。

### `POST /ai/consent/revoke`

```json
{ "session": "…", "capability": "clipboard" }   // 或 { "session": "…" } 或 { "all": true }
→ { "ok": true, "revoked": 1, "message": "已撤销" }
```

- `revoked` 是撤销掉的「会话 × 高危能力」授权条数；没有匹配时 `revoked: 0`、
  `message: "没有匹配的授权"`；
- 未知 capability 返回 `{ok:false,error:"未知的能力：…"}` 并列出可用值；既没 `session` 也没 `all`
  返回 `{ok:false,error:"要撤销什么？"}`；
- 撤销后，如果该能力仍是高危，这个对话下次调用会重新弹确认。

### `POST /ai/consent/risk`（改高危集合）

```json
{ "capabilities": ["clipboard", "control", "screenshot"] }
→ { "ok": true, "risk": ["clipboard","control","screenshot"], "message": "已保存高危能力设置" }
```

- `capabilities` 必填数组；**空数组合法**（表示什么都不需要确认）；
- 只接受 6 个已知 capability；未知值报错并列出可用列表；数组里不能有 `null`；
- 重复项去掉、顺序按 §2.1 表归一；保存到 `ai.risk`；
- 保存时**清掉不再高危的旧授权**（某个会话因此没有授权了，就整条从 `ai.consent` 移除）；
- 这个接口不需要 session，设置页专用。

### `POST /ai/android`（AI 访问 Android 的统一入口）

```json
{ "session": "<sessionId>", "sessionTitle": "可选的对话标题",
  "path": "/android/clipboard", "method": "POST", "query": "", "body": { "text": "你好" } }
→ AndroidApi 的原始响应 + { "capability": "clipboard" }
```

- `session` 必填（通常是工具调用所在的 `exec.agent.id`），缺了直接报错；`sessionTitle` 可选；
- `path` 只允许 `/android` 或 `/android/*`；`/android/biometric` **不能**经这里调（它自己弹窗，
  直接 `POST /android/biometric`）；
- `method` 缺省 `POST`，只接受 `GET` / `POST`；`query` 是原样查询串（开头的 `?` 会被去掉），
  例如 `/android/apps` 的 `system=1&q=微&limit=50`；`body` 必须是 JSON 对象（省略等同 `{}`）；
- **`method=GET` 时 `body` 必须为空**（省略或 `{}`），带字段会被直接拒绝：
  `{ok:false, error:"GET 不能带请求体", hint:"读用 query，写把 method 设为 POST"}`。这个校验在
  弹授权之前做——GET 不能借请求体夹带写操作绕过这个对话的 `read` 授权；
- 按 §2.1 表推导 capability；没被映射的 path 直接拒绝（`{ok:false,error:"AI 无权调用 …"}`），
  不会退化成"无授权直接执行"；
- **该能力是高危且这个对话还没授权** → 弹生物识别确认；通过后执行；拒绝则返回
  `needs:"consent"`（带 `capability`/`session`）。低危能力直接执行，不弹窗、不记录授权；
- 执行结果（`ok` 或接口报错）都会带上 `capability` 字段，便于工具侧提示；校验阶段的错误
  （缺 `session`/`path`、`method` 非法、`GET` 带请求体、path 未映射）不带 `capability`；
- **截图特例**：`path:/android/screenshot`（默认高危）成功时，应用把 JPEG 存到共享存储
  `Download/dsh-shot-<毫秒时间戳>-<序号>.jpg`，返回 `{ok:true, capability:"screenshot",
  file:"/sdcard/Download/…", mime, width, height, bytes, tookMs}`，并**去掉 base64 的 `image`**
  （避免几百 KB 进模型上下文）。文件名带序号，同一毫秒的两张不会互相覆盖；
- **截图保留策略**：`Download/` 下的 `dsh-shot-*.jpg` **只保留最近 20 张**，更旧的自动删除
  （删除失败会被忽略，不影响本次截屏）；共享存储不可用 / 写不进去时返回
  `{ok:false,error,hint,capability:"screenshot"}`，不会退回 base64；
- 请求体不是合法 JSON 时，桥返回 `{ok:false,error:"请求体不是合法 JSON"}`（HTTP 200）。

## 3. 终端标签页

UI 终端（client 插件）的标签页是**页面内状态**；应用侧只做**中继**，缓存页面最近一次上报的快照。
标签页是全局资源：任何对话都能列出、切走或关闭你正在用的标签页（`terminal` 默认低危、直接放行；
如果用户把它设为高危，就要按对话确认）。

### `POST /ai/terminal/tabs`（AI）

```json
{ "session": "…", "sessionTitle": "…", "action": "list|open|activate|close", "id": "可选" }
→ { "ok": true, "tabs": [ { "id": "…", "title": "终端 1", "active": true } ],
    "activeId": "…", "count": 1, "stale": false }
```

- `terminal` 默认低危，直接执行；**只有用户把它设为高危时**才按 §2 弹一次确认；
- `action=list` 直接返回应用缓存；`stale:true` 表示页面从未上报，或超过 15 秒没上报；
  `active` 由当前 `activeId` 派生，`count` 是 `tabs.length`；
- `action=open` 不需要 `id`（新开一个）；`action=activate|close` 的 `id` 是**标签页 id**（先 `list` 拿）；
- `open/activate/close` 会入队等页面执行，最多等 4 秒：页面没响应（App 后台被冻结）返回
  `{ok:false, error:"终端页面没有响应：请回到 DSH 页面再试", needs:"foreground"}`；页面执行失败
  （标签页已满 4 个、没有这个标签页等）返回页面的可读 `error`，**不**带 `needs`；
- 页面长时间不取命令、队列积压到上限时返回「终端页面还没处理完上一条命令，请稍后再试」。

### 页面侧端点（client 插件轮询，鉴权只靠 bridge token）

```json
GET /terminal/tabs/commands
→ { "ok": true, "commands": [ { "id": 1, "action": "open", "target": "" } ],
    "state": { "tabs": [ { "id": "…", "title": "终端 1", "status": "ready" } ],
               "activeId": "…", "updatedMs": 0 } }

POST /terminal/tabs/report
{ "tabs": [ { "id": "…", "title": "终端 1", "status": "ready" } ], "activeId": "…",
  "results": [ { "id": 1, "ok": true, "error": "" } ] }
→ { "ok": true }
```

- **两个 id 别混**：页面命令里的 `id` 是**命令号**（整数），`target` 才是标签页 id；
  AI 请求里的 `id` 是标签页 id。命令只交一次，5 秒内没被取走会过期（等待方收到"命令已过期"）；
- 页面每约 900ms 拉一次（隐藏时也继续，浏览器会节流）；执行后**必须**回报 `results`
  （按命令号），应用据此唤醒等待中的 `/ai/terminal/tabs`；
- 中继在**插件加载时就安装**，不等 `window.DshAndroid` 注入完成；桥暂时不可用时按 3 秒 / 10 秒
  退避重试，恢复后自动继续（自愈）。空闲时每约 5 秒强制回报一次（心跳，同一份 tabs 也发），
  应用据此清掉 `stale`；
- `tabs` 上报会**整体替换**应用缓存（只保留 id/title/status），`activeId` 以页面为准（空串表示没有
  活动标签）；只有 `results` 的回报也可以，用来唤醒等待方；
- 页面只执行 `open`/`activate`/`close`；`list` 只读应用缓存，不会下发到页面；
- 页面自己的限额与错误：最多 4 个标签（「标签页已满（最多 4 个）」）、没有终端服务
  （「打不开新标签页：本页没有终端服务（需要从 DSH 应用打开本页）」）、未知标签页
  （「没有这个标签页」）、缺 `target`（「activate/close 缺少目标标签页 id」）。

## 4. 给 AI 的工具

host 插件 `plugin/dsh-plugin-android` 注册 7 个普通工具；`execute` 里用 `exec.agent.id` 作为
`session`，`sessionTitle` 取会话标题（取不到就不带）。工具失败抛 `Error`（可读中文，模型能看到）。
每个工具的 description 都写明其 capability **“若用户把 X 设为高危能力才需要确认，否则直接放行”**。

| 工具 | 参数 | 说明 |
|---|---|---|
| `android_info` | `{}` | 设备/屏幕/电池/网络/存储 + 能力矩阵（`read`，默认低危） |
| `android_clipboard` | `{action:"get"\|"set", text?}` | 读/写剪贴板（`clipboard`，默认高危） |
| `android_notify` | `{action:"toast"\|"notify"\|"cancel"\|"vibrate", text?, title?, id?, all?, ms?}` | 提示/通知/取消/震动（`notify`，默认低危） |
| `android_control` | `{action:"volume"\|"brightness"\|"dnd"\|"share"\|"open"\|"global"\|"apps", params?:{}}` | 改设置/拉起/全局（`control`，默认高危），`params` 直接透传给对应端点 |
| `android_screenshot` | `{}` | 截屏并保存文件，返回路径与尺寸（`screenshot`，默认高危） |
| `android_biometric` | `{reason?}` | 主动要求指纹/人脸确认；`reason` 显示为弹窗副标题（每次都会弹，不占按对话授权） |
| `terminal_tabs` | `{action:"list"\|"open"\|"activate"\|"close", id?}` | 终端标签页（`terminal`，默认低危） |

`android_control` 的 `params` 按 `action` 对应到：`volume` → `/android/volume`、`brightness` →
`/android/display`、`dnd` → `/android/dnd`、`share` → `/android/share`、`open` → `/android/open`、
`global` → `/android/global`、`apps` → `/android/apps`（字段见 `docs/ANDROID-API.md` §4）。

`android_notify` 的 `cancel` 必须给 `id` 或 `all:true` 之一：两个都没有时工具侧直接报错
（「android_notify 的 cancel 需要 id（取消哪条通知）或 all=true（取消全部插件通知）」），
不会把空请求发到应用再报一次。

时间与输出：

- 工具调 `/ai/android`、`/ai/terminal/tabs`；`android_biometric` 直连 `/android/biometric`；
- 普通调用超时 20 秒；这个对话还没有该能力授权记录时 70 秒（高危会借此弹确认；低危虽然不弹，
  也沿用这个预算）；生物识别工具固定 70 秒；插件会先 `GET /ai/consent`（5 秒预算）判断；
- 非 `ok` 的响应统一变成 `Error`：原始 `error` + 能力中文名 + `needs` 对应的下一步；
- 工具输出是 `{ok:true, ...原始结果}`；`render` 把结果序列化成一段 JSON（超过约 16KB 截断）。

## 5. 安全边界与已知限制

**边界**（重要）：

- 授权只作用于 AI 入口（`/ai/android`、`/ai/terminal/tabs`）的高危能力。持有桥令牌的代码本来就
  能直接调 `/android/*`，不受这层约束——所以它是"高危操作动手前让你看见、事后能收回"的确认与
  审计，不是权限隔离；
- `/ai/android` 的 `session` 由调用方自报（工具里就是 `exec.agent.id`）；应用按它记账，不做会话身份
  校验。对恶意插件没有防护意义（它们可以直接用 `/android/*`），目的是让模型的高危操作可被确认、可被撤销；
- 低危能力不弹窗、不留记录，也就没有“被撤销”的概念；把某个能力从高危改成低危时，旧授权会被清掉；
- `POST /android/biometric` 的 `title/subtitle/description` 由调用方提供，属于不可信文案——应用会
  统一加「DSH 请求：」前缀、压成单行并截断到 120 字符，但内容本身仍不可信；插件不要用它冒充系统提示；
- `GET /ai/consent` 会返回对话标题与当前高危集合，只存本机、只给设置页用；`/ai/*` 与
  `/terminal/tabs/*` 的所有失败都是 HTTP 200 + `{ok:false,...}`（令牌错误才是 401）。

**限制**：

| 限制 | 原因 |
|---|---|
| Android 8（API 26/27）用不了**高危** AI 操作 | 生物识别需要 `BiometricPrompt`（Android 9 / API 28+），高危能力拿不到授权；默认低危的 `read`/`notify`/`terminal` 仍可直接用 |
| 只设了锁屏密码、没录指纹/人脸时用不了**高危** AI 操作 | 确认走生物识别，不做普通确认框降级（`needs:"biometric"`）；低危能力不受影响 |
| 应用不在前台时确认弹窗可能弹不出来 | Android 10+ 后台启动限制；会先尝试把 DSH 带到前台，2 秒失败 |
| 终端标签页命令要页面在前台响应 | 标签页是页面内状态，应用只做中继；4 秒超时返回 `needs:"foreground"` |
| AI 截屏文件只保留最近 20 张 | `Download/dsh-shot-*.jpg` 超出部分自动删除；更早的图找不回来 |
| 通知与终端标签页是全局资源 | 授权按对话隔离（仅高危），但资源不隔离：一个对话能取消别的对话发的通知/关掉用户正用的标签页 |
| 高危授权没有过期时间 | 应用重启后仍有效，只能在设置里撤销；低危能力没有授权记录 |

## 6. 变更记录

- `1.2.2`（`versionCode` 10217，10216 / 10215 作废）：新增 `/android/biometric`；AI 侧新增
  `/ai/android`、`/ai/consent`、`/ai/consent/revoke`、`/ai/consent/risk`、`/ai/terminal/tabs` 与
  页面中继 `/terminal/tabs/commands`、`/terminal/tabs/report`；**按对话授权只对用户勾选为高危的
  能力生效**（默认 `clipboard`/`control`/`screenshot`；`read`/`notify`/`terminal` 默认低危直接放行）；
  `GET /ai/consent` 带 `risk`，`POST /ai/consent/risk` 可改高危集合；7 个 `android_*` /
  `terminal_tabs` 工具、按对话的生物识别确认与设置页「AI 授权」；`/android/*` 端点由 17 个增至 18 个。
- 同版补丁（10216 起，10217 保留）：`/ai/android` 的 `GET` 带请求体直接拒绝（不再能借只读授权夹带
  写操作）；生物识别弹窗标题统一加「DSH 请求：」并做去换行/截断；AI 截屏只保留最近 20 张；
  插件到控制桥的请求默认 5 秒超时，终端标签页中继启动即装并有 5 秒心跳。
