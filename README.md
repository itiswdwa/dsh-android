# dsh-android

基于 WebView 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 安卓发行版。采用 Ubuntu Proot 以增加兼容性。

把 `dsh web` 这套东西连同它需要的整套运行时（Ubuntu rootfs + Node + 依赖）打进一个 APK，
在手机本地用 PRoot 跑起来，用 WebView 当界面。**不需要 Termux、不需要 root、不依赖任何第三方 App。**

```
┌─────────────── APK (dev.dsh.android) ───────────────┐
│  MainActivity ── WebView ──► http://127.0.0.1:3080  │
│      │                                      ▲       │
│      │ 控制桥 (127.0.0.1:8399, 每启动一个 token)     │
│      ▼                                      │       │
│  libproot.so ──► Ubuntu 24.04 rootfs (filesDir)     │
│                     ├── node (官方构建) + dsh web ──┘
│                     └── pty-server.mjs ──► 终端面板
└─────────────────────────────────────────────────────┘
```

## 现在能干什么

- **完整的 Harness**：会话、工具、子代理、Agent Teams、workflow、计划模式、技能 —— 和桌面端同一套代码，只是跑在手机里。
- **终端**：左侧栏 `>_` 图标，沙箱内的真 PTY（`/dev/pts/N`），带命令输入栏（中文输入法在 xterm 里会乱灌候选，所以输入走独立输入框）。
- **挂载**：把手机上的任意文件夹挂进沙箱（SAF 选目录，解析成真实路径），agent 和终端直接读写。
- **导出**：沙箱里的文件一键复制到手机 Download；文件预览工具栏和设置页都有入口。
- **Android 特权通道**：`shiz` CLI 通过 Shizuku 以 shell 身份执行 `pm` / `am` / `settings` / `input` / `screencap` / `cmd app_function`。
- **热更新包**：22 KB 的 `dsh-hot.zip` 放进 Download 目录、重开应用即可更新插件/技能/脚本，不必重装 APK。
- **跟随系统主题**：浅色/深色自适应，连图标都会反色（浅色=白底黑鲸，深色=黑底白鲸）。

## 构建

不需要 Android Studio、不需要 Gradle。整套流水线是 aapt2 + d8 + 手写 zip 打包 + apksig v2/v3 签名：

```sh
# 1. 准备 Ubuntu 载荷（一次性，约 10 分钟）
sh scripts/prepare_rootfs.sh          # 下载 ubuntu-base + 官方 node，装依赖
# 2. 装配载荷（打补丁 + 裁剪 + 覆盖 guest 文件）
sh scripts/assemble_payload.sh
python3 scripts/make_payload_zip.py build/rootfs-ubuntu build/payload-assets/payload.zip
# 3. 出包
sh scripts/build_apk.sh               # → out/dsh-android.apk
```

依赖：`aapt2`（x86_64 glibc，经 qemu 跑）、`d8`、JDK 11、`rsvg-convert`（生成图标）。
细节见 [docs/BUILD.md](docs/BUILD.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `app/` | Android 侧：Activity、控制台、控制桥、PRoot 调用、载荷安装 |
| `payload/` | guest 侧：`start-dsh.sh`、`pty-server.mjs`、`shiz` CLI、改过的发行版文件 |
| `plugin/dsh-plugin-android/` | dsh 插件：系统提示词 + 设置页 + 终端面板 |
| `profile/` | 预置的 dsh profile（插件已装好） |
| `patches/` | 对上游源码的补丁（原子写硬链接回退、手机端布局、musl 桩） |
| `scripts/` | 全部构建流水线 |

## 设计要点

- **为什么是 Ubuntu 而不是 Alpine**：上游发布预编译二进制时默认目标是 glibc。Alpine/musl 上
  `node-pty` 没有预编译、`node-addon-require-builtin` 干脆没发 musl 包、Alpine 的 node 构建没有
  TypeScript 支持（`workflow` 直接不可用）。换成 glibc 后这三处全部归零，代价是 APK 从 73 MB 涨到 143 MB。
- **为什么 rootfs 用 zip 而不是 tar.gz**：Android 的 `java.util.zip.ZipEntry` 没有
  `getExternalAttributes()`，unix 权限和符号链接另存一份 `payload.manifest`。自己手写 tar 解析器
  在 pax global 头和填充字节上翻过车（静默吞文件），不再冒这个险。
- **为什么给 dsh 打补丁**：Android 的 SELinux 禁止 `link()`（连 shell 都不行），而 harness 的原子写
  在"新建文件"这条路径上用 `link()` 发布 —— 于是新建文件全挂。补丁让它在文件系统不支持硬链接时
  回退到 `copyFile(..., COPYFILE_EXCL)`，覆盖语义完全不变。
- **为什么有热更新包**：载荷按**内容哈希**版本化，任何改动都会触发 400 MB 重新解包。插件/技能/脚本
  这些高频改动的小文件走独立的 22 KB 覆盖包，每次启动重放。

更多细节：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/FINDINGS.md](docs/FINDINGS.md)（踩过的坑）。

## 已知限制

- 只支持 **arm64**，minSdk 26，targetSdk 28（低 targetSdk 是为了能 exec 应用私有目录里的二进制）。
- APK 143 MB，首次启动要解包约 400 MB（约 2 分钟），之后冷启动约 5 秒。
- 网络相关：手机开着 fake-IP 模式的代理时，`web_fetch` 的 SSRF 防护会拒绝所有公网域名
  （按设计如此），得用 `bash` + `node fetch` 绕过。
- Shizuku 需要用户手动授权；没授权时 `shiz` 会明确报错，不会静默失败。

## 版权

本项目是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）的非官方安卓移植，
与 DeepSeek 无关联。其中的鲸鱼标识、Ubuntu rootfs、Node 以及各 npm 依赖的版权归各自所有，
详见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 许可

[MIT](LICENSE)
