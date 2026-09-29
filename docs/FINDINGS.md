# 踩过的坑

按"下次还会踩"的顺序排。每条都是真机上定位过的，不是推测。

## 1. Android 的 SELinux 禁止 `link()`

**现象**：harness 的 `write` 工具新建文件时报错或留下悬空软链，覆盖已存在文件却正常。

**定位**（三组对照，都在设备上跑）：

```
A. 宿主 /data/local/tmp 里 ln a b          → ln_exit=1        连 shell 都不行
B. proot 内 rootfs 里 ln                  → 被 PRoot 用 .l2s. 软链冒充
C. proot 内 bind 挂载点上 ln              → Permission denied
```

不是 PRoot 的问题，是文件系统层面就不允许。于是两条路都死：不加 `--link2symlink`，真 `link()`
被拒（EACCES）；加了，PRoot 用一个指向临时目录的**相对软链**冒充，而 harness 的原子写随后会
删掉那个临时目录 —— 文件变成悬空软链，工具却报成功。

**结论**：harness 的原子写**只有"新建"这条分支用 `link()`，覆盖走 `rename()`**，所以症状才会
那么奇怪。修法是让发布路径回退：`link()` 遇到 `EACCES/EPERM/EMLINK/ENOTSUP/EXDEV` 时改用
`copyFile(src, dst, COPYFILE_EXCL)` —— 同样保证"已存在则失败"，但不需要同一个 inode 的第二个名字。

**漏掉的第二处**：会话日志（`dsh-session-persistence-jsonl`）和附件（`dsh-attachment-local`）
各自也有 `link()` 发布点，第一版补丁只覆盖了 `dsh-fs-local`，于是 `subagent` / `workflow agent()` /
`spawn_teammate` 全部新建子会话失败。现在 `patches/apply-hardlink-patch.py` 一次覆盖四处，
任何一处匹配不上就构建失败。

## 2. musl 是逆着生态走

在 Alpine（musl）上栽的三处，全是 glibc 上不存在的问题：

| 组件 | musl 下的处境 | glibc 下 |
|---|---|---|
| `node-pty` | 只有 gnu 预编译 → 自己 node-gyp 编 | 用官方预编译，零工作 |
| `node-addon-require-builtin` | **根本没发 musl 包**，包里也不带源码 → 只能写 `--expose-internals` + 纯 JS 桩顶替 | 有 `-linux-arm64-gnu` 包，直接用 |
| Alpine 的 node | `process.features.typescript === false` → `workflow` 恒失败 | 官方 node 带 TS 支持 |

换 Ubuntu 后这三处全部消失，代价是 APK 从 73 MB 涨到 143 MB。对一个跑 agent 的应用，这个交换值。

## 3. `PROOT_NO_SECCOMP=1` 是毒药

为了"兼容"随手加的这个环境变量会让 PRoot 退回纯 ptrace 路径，普通 `chdir` 都返回
`Function not implemented`（ENOSYS）。别设。

顺带：Android 没有可写的 `/tmp`，proot 必须先给 `PROOT_TMP_DIR`，否则它报
`can't create temporary directory` 之后紧跟一个**误导性的** `execve: Function not implemented`。

## 4. 模块加载失败会拖垮整个前端

dsh 的客户端插件必须导出**服务名**（`exports.inject = ["slots", "locale"]`），而不是包名：
写包名会永远 `pending (waiting for service: <包名>)`；不写则 `apply` 时 `ctx.locale` 是 undefined →
`failed`。而**一个 entry 挂掉，整个前端 boot 就白屏**。

## 5. 布局：dsh 的移动端适配确实很糙

`@deepseek-ai/dsh-client-ui-layout` 里**没有任何宽度 media query**，三栏宽度全由 JS 算
`grid-template-columns`，`SIDEBAR_AUTO_COLLAPSE = 1024`，而窄屏展开侧栏仍强制
`clamp(sidebar, 264, 420)` —— 412 px 的手机上主区只剩 148 px，中文变成一字一行。

补丁没有改它的状态机，只用 CSS 重新解释：窄屏展开时把侧栏轨宽设为 0、把侧栏变成
`position:fixed;inset:0` 的全屏抽屉。两个必须注意的点：

- 侧栏脱离文档流后，网格会**自动重排**（主列被塞进 0 px 轨道里）→ 必须显式
  `grid-column: 2` / `3` 固定主列与右栏。
- class 名是 CSS-module 哈希（`pI_x6G_sidebarCol`）→ 选择器一律用稳定后缀匹配
  `[class*="_sidebarCol"]`，否则上游一升级就全废。

## 6. 输入法 vs xterm

xterm.js 用一个隐藏 `textarea` 收键盘输入。中文输入法的候选栏和剪贴板联想会把整串候选灌进去，
xterm 再把 composition 内容当输入回放 —— 结果是一屏推荐词被"打"进终端。

解法不是去和 IME 的 composition 逻辑较劲，而是给终端配一条命令输入栏（普通 `<input>`，
输入法在这类控件里是正常工作模式），回车整行发送，顺带给 xterm 的 textarea 加上
`autocorrect=off` / `autocomplete=off` / `autocapitalize=none` / `spellcheck=false`。

## 7. 别手写 tar 解析器

第一版载荷用 tar.gz + 自己写的解析器。它在 pax **global（`g`）**头上只跳了 body 没跳 512 对齐填充，
而且普通文件条目后偶发丢填充 —— 解析错位，然后**静默吞掉后面的文件**。加校验和 + 重同步能掩盖症状，
但真正的结论是不该手写：改成 zip（用 `java.util.zip`）之后这类 bug 整类消失。

## 8. Android 的几个 API 意外

- `ZipEntry.getExternalAttributes()` **不存在**（OpenJDK 才有）。
- `Shizuku.newProcess` 在 API 13 是 **private**（官方推荐改用 user service）；这里用反射调用它
  自己的实现，避免为了跑一条命令再绑一个服务。
- 低 targetSdk 不是偷懒：SELinux 域按 targetSdk 划分，只有 legacy 域才允许 exec 应用私有目录里的
  二进制，而整个载荷（rootfs + node）就在那里。

## 9. 版本号别手工维护

用内容哈希。手工维护的版本号让人两次以为"改动没生效"——实际上应用一直在跑旧树。
后来任何载荷改动都会自动触发重新解包，同时高频改动的小文件走独立的 22 KB 热包，
避免每次都付 400 MB 的代价。

## 10. 技能目录为空的两个原因

一是 profile 里的 `customSkillDirs` 用相对 profile 目录的 `require.resolve()` 指向上游预设包，
而 profile 的 `node_modules` 里只有自己的插件 → 解析失败；二是裁剪脚本把 `*.md` 全删了，
而技能正文就是 `SKILL.md`。两个都不报错，只是技能列表空着。
