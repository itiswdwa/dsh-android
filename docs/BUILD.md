# 构建

全流程不依赖 Android Studio / Gradle：`aapt2` + `javac` + `d8` + 手写 zip 打包 + `apksig` 签名。

## 依赖

| 工具 | 说明 |
|---|---|
| `aapt2` | 资源编译与链接。x86_64 glibc 二进制，在 arm64 上经 `qemu-x86_64` 跑 |
| `d8` | 来自 `r8.jar`，把 class 文件变成 dex |
| JDK 11 | `javac` / `keytool` |
| `rsvg-convert` | 把 `assets/whale.svg` 光栅化成图标（`librsvg`） |
| `python3` + Pillow | 打包、图标合成、载荷校验 |
| `qemu-x86_64` + 一份 glibc 环境 | 只为跑 aapt2；`QEMU_LD_PREFIX` 指向解出来的 Debian 库目录 |

路径都写在 `scripts/build_apk.sh` 顶部（`ANDROID_JAR` / `AAPT2` / `D8` / `APKSIG`），按自己的环境改。

## 三步

```sh
# 1) 准备 rootfs（下载 + 装依赖 + 裁剪，约 10 分钟）
sh scripts/prepare_rootfs.sh

# 2) 装配载荷：打上游补丁 → 覆盖 guest 文件 → 播种 profile → 打包
sh scripts/assemble_payload.sh
python3 scripts/make_payload_zip.py build/rootfs-ubuntu build/payload-assets/payload.zip

# 3) 出包（自动生成 BuildInfo + hot.zip + 图标，然后签名）
sh scripts/build_apk.sh            # → out/dsh-android.apk
```

## 各步骤在做什么

### 载荷

- `prepare_rootfs.sh`：取 `ubuntu-base` arm64 + 官方 Node tarball，把 harness 按目标平台装进去。
  **关键**：在 musl 主机上装 glibc 目标的依赖要显式指定平台，否则 npm 会按宿主 libc 挑预编译：

  ```sh
  npm i --os=linux --cpu=arm64 --libc=glibc @deepseek-ai/dsh
  ```

- `assemble_payload.sh`：把 `payload/` 覆盖到 rootfs、装插件、播种 profile（`/opt/dsh/dsh-home-seed`）、
  应用上游补丁，最后做一遍完整性自检（缺文件直接失败）。

- `make_payload_zip.py`：打成 zip + manifest。**打包后会校验源树里每个路径都进了 zip** ——
  早期漏掉 usrmerge 的软链目录（整个 `/bin`）就是这么发现的。

### APK

1. `aapt2 compile` → `aapt2 link`（同时用 `--java` 生成 `R.java`）。
2. 生成 `BuildInfo.java`（载荷 sha256 前 16 位，作为版本号）与 `hot.zip`。
3. `javac`（源码 + `R.java`）→ `d8` → `classes.dex`。
4. `pack_apk.py` 手写 zip：`resources.arsc` 必须 **STORED 且 4 字节对齐**（否则 Android 11+ 拒装），
   `.so` 用 4096 对齐，已经压缩过的载荷（zip/gz）不再二次压缩。
5. `Sign.java` 只签 **v2 + v3**：v1 会重写 zip、把对齐搞坏。

> 对齐断言要检查**数据偏移**，不是 local header 偏移 —— 这里错过一次，打包器自己会打脸。

## 提交改动

源码树就是脚本所在的位置（`build_apk.sh` / `assemble_payload.sh` / `sync_repo.sh` 都按自己
`$0` 的上级目录定位），git 检出默认放在同级的 `dsh-android-repo/`；两者都可以用
`DSH_SRC_DIR` / `DSH_REPO_DIR` 覆盖。
一条命令同步 + 提交 + 推送：

```sh
sh scripts/sync_repo.sh "这次改了什么"
```

它顺手处理的三个本沙箱特有的坑（原因见 [FINDINGS.md](FINDINGS.md#10-proroot-的-link2symlink-还会打中-git和-rm)）：

- `git config core.createObject rename` —— 否则 PRoot 的 link2symlink 会让 loose object 悬空；
- 用 `git clean -Xfd`（大写）只清生成物，别把还没 add 的新源码删掉；
- remote 固定用 SSH（沙箱里的是部署密钥，HTTPS 会要一个读不到的用户名）。

构建产物、图标、载荷、签名密钥都不进仓库。

## 发版：先想清楚是哪一种

两条通道的成本差三个数量级，选错一次就是十分钟加 143 MB 白跑：

| 改了什么 | 走哪条 | 命令 | 代价 |
|---|---|---|---|
| 插件（界面、提示词）、技能、`payload/opt` 里的沙箱脚本 | **热更新** | `sh scripts/release_hot.sh` | 约 1 分钟，80 KB |
| 应用 Java 代码、资源、图标、载荷里的 rootfs（新装的包/依赖） | **应用更新** | `make_payload_zip` → `build_apk.sh` → `sh scripts/release.sh` | 约 15 分钟，143 MB |

也就是说：**只改 `plugin/` 或 `payload/` 时不要碰 `VERSION`，也不要重新出 APK**。
`release_hot.sh` 会把新热包挂到*当前*那版 release 上（APK 资产原地不动），重新生成
`update.json` 的 `hot` 段，把 release 的 `<!-- hot-notes -->` 段落重渲染（**该应用版本下所有热包的条目，
按 sp1、sp2……的发布先后** —— 只显示最新一包，等于下一包一发出来就把上一包的说明从页面上抹掉），最后推送清单
—— 顺序是先上资产再推清单，所以应用永远不会读到一个指向不存在文件的清单。

应用更新才需要抬 `VERSION`；`release.sh` 可重入，中途断掉再跑一次即可补齐资产。
出包的完整步骤见上面的[三步](#三步)。

### 发布说明写在 CHANGELOG.md，别处不写第二份

release 正文由根目录 [CHANGELOG.md](../CHANGELOG.md) 渲染而来（`scripts/release_notes.py`），
**版本在 CHANGELOG.md 里没有条目就发不出去** —— 这是有意的：只要允许"发布时再写一份"，
就一定会出现正文讲一遍、变更日志讲另一遍、两边都跟代码对不上的局面。

写条目时遵守两条外部规范：[Keep a Changelog](https://keepachangelog.com/1.1.0/) 管格式
（`## [版本] - YYYY-MM-DD`、`Added / Changed / Fixed / Removed / Security`、版本倒序），
[Common Changelog](https://common-changelog.org/) 管内容：

- **一条一行**，写"对用户意味着什么"，不是"源码里改了哪一步"；
- 分组归类；相关改动合并成一条，互相抵消的改动直接不写；
- **不写噪音**：构建脚本、重构、dotfile、文档格式这类与使用者无关的改动不进发布说明
  （它们属于 commit，不属于 release note）；
- 破坏性改动以 `**Breaking:**` 开头并排在各组最前；
- 面向使用者措辞 —— 判断标准是"拿到新版本的人读这一行能不能知道要不要升级、会看到什么变化"。

示例见 CHANGELOG.md 里 1.1.3 起的四条。**不要**在发布说明里写调试过程、复现路径、
"我一开始搞错了什么"这类内容 —— 那是 commit message 和 docs/FINDINGS.md 的活。

### 版本编号：三段

一个版本由三部分组成，因为它们变化的理由、发货的通道都不一样：

| 段 | 例子 | 是什么 | 怎么更新 |
|---|---|---|---|
| 应用 | `1.1.5` | 外壳：Java、资源、内置载荷的构建来源 | 装新 APK |
| 终端 | `t2` | 沙箱里的运行时：rootfs、node、dsh、装进去的工具 | 换载荷，也就是装新 APK |
| 热包 | `sp0` | 装在已发布外壳之上的插件/技能/沙箱脚本；`0` 表示没有 | 应用内一键应用 |

写在一起就是 `1.1.5-t2-sp0`（设置页顶部显示的就是这一串）。三段各自记账：

- `VERSION` —— 应用版本；`ROOTFS_VERSION` —— 终端版本；`HOT` —— 上一次在这里打的热包
  （`{app, terminal, sp, hash}`，随源码提交）。
- 渲染、比较、记账一律走 `scripts/version.py`，别处不要再拼版本字符串。

**终端版本不跟着应用版本走。** 只改界面、不动运行时，终端号保持不变（`1.1.6-t2`）；
换了一版 rootfs（新装的包、新的兼容层）才 +1（`1.1.7-t3`）。

**热包只在它所属的那条线上生效**：`<应用>-t<终端>-sp<n>`。应用版本或终端版本一变，
热包序号从 `sp1` 重新起算 —— 一个热包只应该贴在它当初构建时对应的那份运行时上。

**热包要归并到下一个版本。** 发出新外壳时，之前所有热包的内容必须已经在内置载荷里
（`assemble_payload.sh` 拷的就是工作树里的 `plugin/`、`payload/`，所以正常流程天然满足），
新外壳内置的那份记作 `sp0`。否则会出现"装了新 APK 反而回到旧插件"。

序号推进规则（`make_hot_zip.py` 的 `next_sp`）：

- 内容没变 → 沿用原号（重复构建不跳号，否则每台设备都会重新弹一次更新）；
- 内容变了、线没变 → 号 +1；
- 线变了 → 热包从 `sp1` 起，应用包烘进去的那份从 `sp0` 起。

包内 `hot.json` 同时记 `hash`（去掉 `hot.json` 自身后的内容 sha256 前 16 位）——
不再用于显示，但排查"两台设备的插件是不是同一份"时是最快的判据。

`HOT` 是唯一的账本，它不知道的事就是没发生过：**从别处（手打的包、另一台机器）发过热包之后，
要手工把那一包补进 `HOT`，否则下一包会从当前号重新开始、和历史对不上**。

## 签名

`keystore/dsh.p12` 由 `build_apk.sh` 首次运行时生成（口令写在脚本里的 `KS_PASS`）。
**这个文件是应用身份，绝对不要提交或分享**：泄露之后任何人都能签出系统认可的"升级包"。
`.gitignore` 已经排除 `keystore/`。

自己发版请换成自己的密钥；换了密钥就等于换了应用身份，旧版本无法覆盖安装。

## 上机

```sh
# 有 Shizuku 时最省事
android-shizuku-cli exec 'cp /sdcard/Download/dsh-android.apk /data/local/tmp/ && pm install -r /data/local/tmp/dsh-android.apk'
```

没有 Shizuku 就把 APK 拷到手机，用文件管理器点安装（记得允许"未知来源"）。

## 调试

- 应用日志：设置 → 安卓沙箱 → 日志面板（同时写在 `files/logs/server.log`）。
- harness 自己的启动诊断写在 guest 的 `~/.dsh/logs/startup-*.log`。
- 终端里可以直接进沙箱看现场：`ls /opt/dsh`、`cat /root/.dsh/profiles/web/cordis.patch.yml`。
