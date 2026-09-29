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
