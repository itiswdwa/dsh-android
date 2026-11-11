# 架构

## 进程与网络

一个应用进程里同时住着 Android 侧和沙箱侧：

```
MainActivity ─ WebView ──HTTP──► 127.0.0.1:3080   harness (node, 沙箱内)
     │                                           
     │  HTTP 127.0.0.1:8399  控制桥（每启动生成 token）
     ▼
 DshService（前台服务 + WakeLock）─► libproot.so ─► Ubuntu rootfs
                                        ├─ /opt/dsh/node_modules  harness
                                        ├─ /opt/dsh/android/start-dsh.sh
                                        └─ /opt/dsh/android/pty-server.mjs ─► 127.0.0.1:3099
```

PRoot 不建网络命名空间，所以沙箱里的服务对 WebView 就是 127.0.0.1。三个端口都在回环上，
各带一个每次启动随机生成的 token：WebView 通过注入的 `window.DshAndroid` 拿到它们，
网页之外的进程拿不到。

## 为什么是 PRoot

要在非 root 的 Android 上跑完整 Linux 用户态，可选的是 PRoot（ptrace 做系统调用路径翻译）和
Termux 那套（不适用，我们要自带发行版）。PRoot 的坑集中在两处，都在 `app/java/.../Proot.java`
里处理掉了：

- `PROOT_TMP_DIR` 必须指向应用私有目录。Android 没有可写的 `/tmp`，否则 proot 报
  `can't create temporary directory`，紧接着给出误导性的 `execve: Function not implemented`。
- **不要**设 `PROOT_NO_SECCOMP=1`。它会让 PRoot 退回纯 ptrace 慢路径，连普通 `chdir` 都返回 ENOSYS。

## 载荷：zip + manifest

rootfs 是 141 MB 压缩的 zip，冷启动首次解包到 `filesDir/distros/ubuntu/`。

Android 的 `java.util.zip.ZipEntry` **没有** `getExternalAttributes()`（那是 OpenJDK 的扩展），
所以 zip 只装内容，unix 权限和符号链接另存一份 `payload.manifest`（`mode\tpath[\tlink]`）：
先按 zip 全解成普通文件，再按 manifest 设权限、把该是软链的替换掉。

解包必须绕开两个坑，两个都会**静默**毁掉结果：

- **软链不能跟随**。`File.isDirectory()` 会解引用，早期版本因此顺着 rootfs 里指向 `/bin/busybox`
  的绝对软链走到宿主机分区去（只读，报 EROFS）；要是软链指向 `/sdcard`，就会去删用户的文件。
  现在一律先 `Files.isSymbolicLink()` 判断，是链接就只删链接本身。
- **打包时要收「指向目录的软链」**。`os.walk(followlinks=False)` 会把它们列进 `dirnames` 却不产出
  条目 —— Ubuntu 24.04 是 usrmerge（`/bin → usr/bin`），于是整个 `/bin` 没进载荷，启动时
  proot 找不到 `/bin/sh`。现在打包器有一步完整性校验：源树里任何路径没进 zip 就直接构建失败。

## 版本化：内容哈希 + 热更新包

载荷版本号是 `payload.zip` 的 sha256 前 16 位（`BuildInfo.java`，构建时生成）。手工维护版本号
翻过两次车 —— 用户那边还在跑旧树，而所有修复看起来都"没生效"。

代价是任何改动都会触发 400 MB 重新解包，所以高频改动的小文件走独立的 `assets/hot.zip`：

- 应用每次启动把 hot 包覆盖进 rootfs（`Payload.applyHot`）；
- 也接受**外部热包**：`Download/dsh-hot.zip` 或 `Documents/dsh-hot.zip`，带 `hot.json` 版本戳，
  版本不同才应用 —— 这就是"不重装 APK 也能更新"的通道；
- 包内路径必须在白名单前缀内（`opt/dsh/android/`、`opt/dsh/dsh-plugin-android/`、`etc/`、`@home/`），
  越界条目拒绝并记日志。热包是可执行内容，不能因为"来自用户"就允许它往任意路径写。

`@home/` 前缀映射到 guest 的 `/root`。这一步不能省：`/root` 是应用存储的 bind mount，
rootfs 里那份 `/root` 会被完全遮住，技能和指令只有写进 bind 的源目录才看得见。

## 控制桥

`127.0.0.1:8399` 上的一个玩具 HTTP 服务（`BridgeServer.java`），给 WebView 提供它够不到的能力：

| 端点 | 用途 |
|---|---|
| `GET /snapshot` | 服务状态、发行版列表、设置、挂载、Shizuku 状态、热包版本、日志尾部 |
| `POST /server/start\|stop\|restart` | 起停 PRoot 进程 |
| `POST /import` `/export` `/export/recent` | 导入 rootfs、导出文件到 Download |
| `POST /mounts/*` | 增删挂载、SAF 选目录并解析成真实路径 |
| `POST /shizuku/request\|exec` | Shizuku 授权与特权执行（`shiz` CLI 走这里） |
| `GET/POST /android/*` | 给插件的 Android 能力面：设备信息、剪贴板、通知、音量、亮度/旋转、免打扰、应用、分享、截屏、全局动作、系统设置页；权限按项计（`WRITE_SETTINGS`、勿扰访问、无障碍、通知），缺授权返回 `needs` |
| `GET/POST /android/biometric` | 生物识别状态与用户确认：系统 `BiometricPrompt`（Android 9+；已录入生物识别时 Android 10+ 可回退锁屏密码），同一时刻只弹一个、最多等 60 秒 |
| `POST /ai/android` | AI 访问 Android 的统一入口：按 `path` 推导 6 类能力、按对话授权后转给 `AndroidApi`；截屏落盘 `Download/` 只回路径 |
| `GET /ai/consent`、`POST /ai/consent/revoke` | 按 `sessionId` 记录能力授权（SharedPreferences 的 `ai.consent` 键）与撤销；设置页「AI 授权」读写它 |
| `POST /ai/terminal/tabs` | AI 管理 UI 终端标签页：`list` 读缓存，`open/activate/close` 入队并等页面回报（≤4 秒） |
| `GET /terminal/tabs/commands`、`POST /terminal/tabs/report` | 页面侧中继：客户端插件约每 900ms 轮询命令、回报标签页与执行结果（只靠桥令牌） |
| `GET /recovery/status` | 恢复模式状态：是否启用、实时令牌、局域网地址、三套连接命令 |
| `POST /recovery/start\|stop` | 进入/退出恢复模式（换 guest 入口脚本，因此要重启沙箱） |
| `POST /recovery/token` | 换一个新令牌（密码在 guest 的 shadow 里，重启恢复模式后生效） |
| `POST /a11y/where` | 找文字（无障碍树）或图片（多尺度卷积模板匹配），按从上到下编号返回坐标；可 `pick` + `action` 在同一次请求里点击/长按（`ui where` 走这里） |
| `POST /a11y/shot` | 截屏并保存到 `Download/dsh-shot-*.jpg`，返回文件路径（`ui shot` 走这里） |

（表里只列了主要端点；`/ball/*`、`/a11y/*`、`/haptic`、`/hot/*`、`/snapshot` 的完整字段见
`BridgeServer.java` 与 `plugin/` 的客户端。）

`/android/*` 的完整契约（端点、`needs` 取值、权限提示）见 [ANDROID-API.md](ANDROID-API.md)；
WebView 里注入的 `window.DshAndroid.version` 在 `1.2.2` 从 `1` 升到 `2` —— 插件应先判断
`version >= 2` 再调用这组端点（`1` 只保证 `base`/`token`/`pty`）。

`/android/biometric`、`/ai/*` 与 `/terminal/tabs/*` 的契约见 [AI-API.md](AI-API.md)。按对话授权存在
应用 SharedPreferences 的 `ai.consent` 键里，按 `sessionId` + 能力记录授权时间：第一次用某个能力弹一次
系统生物识别确认，通过后这个对话不再问、应用重启后仍有效，直到在 设置 → 安卓沙箱 → **AI 授权** 里
撤销（可单项、整会话或全部撤销）。它只拦 AI 入口（`/ai/*`），直接拿桥令牌调 `/android/*` 的插件
不受约束 —— 桥令牌本来就是能力边界，这一层是“AI 动手前你能看见、事后能收回”的确认与审计。

界面里那些"设置"其实全在这个桥上：dsh 的 Web UI 是唯一的前端，原生控制台只在服务没起来时露脸。

## 恢复模式：harness 之外的第二个入口

这个项目所有的修复工具原本都住在 harness 的 Web UI 里（沙箱终端是那儿的一个面板，更新、热包、
profile 修复也都在那儿）。于是 harness 一旦起不来，用户就失去了能自救的东西 —— issue #3 与 1.1.5
的全新安装问题都是这个形状。恢复模式是那个死锁的出口：

```
        DshService 看门狗：连续 3 次「进程退出且从未就绪」
                              │
                    Recovery.enter()（生成实时令牌）
                              │
        ServerBus 用 recovery.sh 而不是 start-dsh.sh 启动 PRoot
                              │
        ┌─────────────────────┴─────────────────────┐
   sshd（0.0.0.0:8022，密码 = 令牌）        pty-server.mjs 的 /recovery 页面
   → 电脑/同手机 SSH 客户端，完整 PTY        → 手机内的行模式控制台（TERM=dumb）
```

- 进入/退出都是**重启沙箱**：入口脚本在 PRoot 启动时就定了，做不到中途切换。
- 就绪不看 harness 的那条 URL，而是看 guest 打印的 `dsh-recovery: ready port=… bind=… user=root
  token-sha256=…`（`ServerBus.onLine`）；`RUNNING` 在这个状态下表示「沙箱在服务」，UI 用
  `Recovery.active()` 区分它和「harness 起来了」。
- 令牌是**每次进入重新生成**的，只在这个进程活着的时候是 root 的密码：guest 侧用 EXIT trap 还原
  shadow，应用侧在进程退出后再补一次（`ServerBus.relockRecoveryPassword`）—— 因为应用停沙箱是杀
  PRoot 进程，`--kill-on-exit` 给的是信号/强杀，脚本不一定有机会执行 trap。
- 主机密钥是**每台设备自己生成**的（存在 bind mount 的 `/root/.dsh-recovery/`），载荷里那份
  `/etc/ssh/ssh_host_*` 所有安装都一样，不能当身份用。

细节、接口与验证步骤见 [RECOVERY.md](RECOVERY.md)。

## 插件：把安卓事实交给模型

`plugin/dsh-plugin-android` 是标准的 dsh 客户端插件，两个贡献：

- **host 侧** `systemPrompt.section()` —— 往系统提示词里插一段"你在一台安卓手机的 PRoot 沙箱里"，
  写明 `/sdcard` 的可见条件、`shiz` 通道、fake-IP 代理会导致 `web_fetch` 被 SSRF 防护拒绝、
  这台设备的文件系统不支持硬链接等环境事实。
- **client 侧** 设置分区 + 终端面板（`sidebar.panellist` 图标、`main` 面板、`sidebar.right.tab.document.action`
  导出按钮）。所有数据都来自控制桥，因此在桌面浏览器里打开会优雅降级成一句说明。

## 沙箱内的终端

harness 自带终端在右侧栏，走 host 的 remote stream 管线，而且 `shells(agent)` 要求有活跃会话。
这里换成了自己的一条链路：`pty-server.mjs`（node-pty + 手写 RFC6455 WebSocket + token 鉴权 +
伺服 xterm 资源），前端面板用 xterm.js 渲染。

两处经验：输出走**二进制帧**（每块都 JSON 包一层再解析，正是大量输出时最烫的路径），
键击走 JSON 文本帧（量小，且这条路径端到端验过）。另外中文输入法会往 xterm 的隐藏
`textarea` 里灌候选词，所以输入用独立输入栏，回车整行发送。
