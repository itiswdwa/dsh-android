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

## 10. PRoot 的 link2symlink 还会打中 git（和 rm）

同一个根因，换了个受害者：**在这个沙箱里跑 git，提交会"成功"但对象是坏的**。

git 写 loose object 时用 `link()` 保证"不覆盖已存在的对象"，于是被 PRoot 换成指向
`.l2s.tmp_obj_*` 的软链；git 随即删掉临时文件，对象就悬空了 —— 下一次操作报
`fatal: bad object HEAD`。仓库能克隆、能提交、甚至能推送（推的时候目标还在），坏的是之后。

修法是让 git 不走 link 路径：

```sh
git config core.createObject rename
```

验证方式是构建后 `git fsck`（干净才算过），`scripts/sync_repo.sh` 里已经固化。

顺带一个连带损失：**`rm -rf` 删不掉这些悬空软链**（`rm` 先 `stat`，而 `stat` 就 EPERM），
目录因此清理不掉、也替换不掉。`scripts/force_rmtree.py` 用 `os.unlink()` 绕过（它不先 stat）。

另外，`git clean -xfd` 和 `git clean -Xfd` 差一个大小写，前者会把**还没 add 的新文件**一起删掉 ——
同步脚本里踩过，注释也写在那儿了。

## 11. 技能目录为空的两个原因

一是 profile 里的 `customSkillDirs` 用相对 profile 目录的 `require.resolve()` 指向上游预设包，
而 profile 的 `node_modules` 里只有自己的插件 → 解析失败；二是裁剪脚本把 `*.md` 全删了，
而技能正文就是 `SKILL.md`。两个都不报错，只是技能列表空着。

## 12. Android 不让应用建硬链接，于是沙箱里的 apt/dpkg 是坏的

**现象**（用户手机上的原话）：`apt install git` 报 `E: dpkg was interrupted, you must manually
run 'dpkg --configure -a'`；照着跑，`dpkg --configure -a` 报

```
dpkg: error: error creating new backup file '/var/lib/dpkg/status-old': Permission denied
```

提示符是 `root@localhost`，所以第一反应是"权限不对" —— 不是。

**定位**：

- 这句话对得上 dpkg 源码 `lib/dpkg/atomic-file.c` 的 `atomic_file_backup()`：
  ```c
  if (unlink(name_old) && errno != ENOENT)
      ohshite(_("error removing old backup file '%s'"), name_old);
  if (link(file->name, name_old) && errno != ENOENT)
      ohshite(_("error creating new backup file '%s'"), name_old);   /* ← 死在这里 */
  ```
  失败的是 `link(status, status-old)`，errno = EACCES。dpkg 每写一次数据库都要走这一步，
  所以任何 `apt install` 都必然失败；失败后数据库停在半途，提示你 `--configure -a`，再失败 —— 死循环。
- 报的是"创建"而不是"删除"：`unlink(status-old)` 那步要么成功要么 ENOENT（被容忍），
  说明目录可写、新建普通文件也没问题，**被拒的只是"硬链接"这个操作**。
- 根因和 §1 是同一个：Android 不给应用进程 `link` 权限。应用故意不传 PRoot 的
  `--link2symlink`（它把 link() 变成指向临时对象的软链，会留下悬空文件），所以 guest 里的
  `link()` 就是真系统调用，被平台拒掉 —— 诚实地失败，但 dpkg 吃不消。

**修法**：`payload/opt/dsh/android/linkfix.c`，编译成 `liblinkfix.so`，由 rootfs 里的
`/etc/ld.so.preload` 全局加载（guest 内每个动态链接的程序都会带上它）：

| 拦截 | 行为 |
|---|---|
| `link` / `linkat` | 真系统调用优先；EACCES/EPERM 时退回复制：目标已存在则失败、保留权限位、源是软链就照抄软链 |
| `chown` / `lchown` / `fchown` / `fchownat` | 沙箱内本来就是"root"的约定，内核不让应用把文件送给别的 uid → 直接报告成功 |
| `stat` / `lstat` / `fstat` / `fstatat` | 复制不会让源 inode 的链接数上升，而 shadow 的 `do_lock_file()` 正是靠 `link()` 之后 `st_nlink == 2` 判断锁是否被占 → 对我们刚给过第二个名字的 inode 如实多报一个链接 |

要点是**没有 libc 依赖**（只有原始系统调用 + 一个 `__errno_location`）：这东西 preload 进每个进程，
少一个符号就少一种"整个沙箱起不来"的可能。

**验证**：用 `LINKFIX_FORCE_COPY=1` 把"内核拒绝硬链接"强制成真（每次 link 都走复制路径），
在 chroot 里对交付的那份 rootfs 跑通了：

```
apt-get update                                                        ✓
apt-get install git curl python3 openssh-server sudo tmux htop less   ✓
addgroup（openssh 的 postinst）                                        ✓ 建出 _ssh 组
```

**代价**：两个名字不再共享同一份 inode。包管理器、git、harness 的原子写只需要"第二个名字"
和"目标已存在就失败"这两条语义，所以不受影响；真依赖共享 inode 的用法（把硬链接当引用计数
或写时复制使）在沙箱里得不到。
