# Changelog

`dsh-android` 有两条发布通道，都记在这里：

- **应用版本**（`1.1.4`）—— 要重新安装 APK。界面、图标、桥接口、沙箱运行时。
- **热更新包**（`1.1.4-sp1`）—— 只换插件、技能、提示词和沙箱脚本，应用内一键应用，不必重装。
  热更新包挂在所属应用版本的 release 上，资产名 `dsh-hot.zip`。

应用版本号遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)；热更新包用
`<应用版本>-sp<序号>` 编号，序号只在同一条应用版本线内递增，不代表 SemVer 的先后关系。
本文件基于 [Keep a Changelog](https://keepachangelog.com/1.1.0/)，条目按版本倒序排列。

_1.1.3 是本文件的起点；此前的 1.1.0–1.1.2 只存在于开发过程中，没有对外发布。_

## [1.1.4-sp2] - 2026-09-30

_包含 [1.1.4-sp1] 的全部改动。_（`20ac8f9`）

### Changed

- 热更新包的版本号改用 `<应用版本>-sp<序号>`，不再显示内容哈希
- 设置页顶部的版本号不再截断到 8 个字符

## [1.1.4-sp1] - 2026-09-30

### Changed

- 「安卓沙箱」设置页改按 harness 原生设计重绘：按钮、开关、状态点、标签、卡片改用 harness
  自带的组件与主题令牌，浅色/深色与「通用设置」保持一致（`4ae032c`）
- 发行版卡片用标签标出「当前使用」与「内置」

### Fixed

- 英文界面下设置页仍显示中文：挂载的「启用/停用」与日志的空状态改用语言表

## [1.1.4] - 2026-09-29

### Fixed

- 插件更新后界面停留在旧版：应用直接写入 harness 读取插件的目录，不再经过沙箱内的复制步骤（`8efe1fd`）

### Added

- 设置页顶部常显「应用 / 热包」版本号，便于确认设备上装的是哪一版

## [1.1.3] - 2026-09-29

### Fixed

- 升级后卡在启动画面（`bbc780e`）
- 挂载不生效：读不到的源目录不再被静默丢弃，设置页会写明原因（`a2ef690`）

### Added

- 每条挂载的「测一下」按钮，在沙箱里真实列一次目标目录（`a2ef690`）
- 挂载卡片内的「重启服务以生效」按钮（`a2ef690`）

[1.1.4-sp2]: https://github.com/itiswdwa/dsh-android/releases/tag/v1.1.4
[1.1.4-sp1]: https://github.com/itiswdwa/dsh-android/releases/tag/v1.1.4
[1.1.4]: https://github.com/itiswdwa/dsh-android/releases/tag/v1.1.4
[1.1.3]: https://github.com/itiswdwa/dsh-android/releases/tag/v1.1.3
