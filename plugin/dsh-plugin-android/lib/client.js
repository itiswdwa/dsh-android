/**
 * dsh-plugin-android — browser half.
 *
 * Registers one settings section ("安卓沙箱") into the stock settings shell via
 * the public slot API:
 *
 *   settings.section   list slot; the shell renders the active row's component
 *                      inside the settings panel and passes { close }
 *
 * Everything it shows comes from the DSH Android app's loopback control bridge.
 * The app injects `window.DshAndroid = { base, token, version }` into the
 * WebView, so the same page opened in a desktop browser degrades to an honest
 * "not running in the app" notice instead of failing.
 */
window.__ModuleLoader__.load({
	id: "dsh-plugin-android",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const h = react.createElement;

		const NS = "settings.android";
		const zh = {
			nav: "沙箱设置",
			navBall: "悬浮球",
			navVersion: "版本更新",
			navAi: "AI 授权",
			aiTitle: "AI 授权",
			aiIntro: "只有你勾选为「高危」的能力才需要按对话确认：第一次用于某个对话时要求指纹或人脸确认一次，之后同一个对话不再询问；未勾选的能力直接放行。判定规则与撤销都在这一页。",
			aiRiskTitle: "高危能力（需要指纹/人脸确认）",
			aiRiskIntro: "勾选的能力第一次用于某个对话时会要求确认；未勾选的直接放行。这里改的是判定规则，已产生的授权在下方撤销。",
			aiRiskSaved: "已保存",
			aiRiskFailed: "保存失败：{error}",
			aiRiskUnsupported: "当前应用版本较旧：所有能力都会按对话确认；更新应用后才能自定义高危集合",
			aiPrivacy: "这一页会列出对话标题，只保存在这台手机上、仅本机可见。",
			aiSessions: "已授权的对话",
			aiEmpty: "还没有高危授权记录",
			aiUnknownSession: "（未命名对话）",
			aiUpdated: "最近使用：{time}",
			aiSessionId: "会话 ID",
			aiGrantedAt: "授权于 {time}",
			aiRevoke: "撤销",
			aiRevokeSession: "撤销这个对话",
			aiRevokeAll: "撤销全部",
			aiRevokeAllConfirm: "确认撤销全部",
			aiCancel: "取消",
			aiRevoked: "已撤销 {count} 项",
			aiRevokeFailed: "撤销失败：{error}",
			aiLoadFailed: "读取授权失败：{error}",
			aiUnavailable: "如果一直失败，可能是应用还不是 1.2.2，或这个页面不在 DSH 应用里。",
			aiRefresh: "刷新",
			aiNoCapabilities: "这个对话还没有授权任何能力。",
			aiAllNote: "撤销全部会清空所有对话的授权记录；高危能力下次首次调用时会重新确认。",
			aiCap_read: "读取设备与状态",
			aiCap_clipboard: "剪贴板",
			aiCap_notify: "提示与通知",
			aiCap_control: "操作手机设置",
			aiCap_screenshot: "截屏",
			aiCap_terminal: "终端标签页",
			ballTitle: "悬浮球外观",
			ballRunning: "运行中",
			ballStopped: "已关闭",
			ballHint: "球的设置与原生面板共用同一份数据；关掉后仍可在这里重新打开。",
			ballShow: "显示悬浮球",
			ballShowDesc: "关闭后随时可以在这一项重新打开。",
			ballShown: "悬浮球已开启",
			ballHidden: "悬浮球已关闭",
			ballSize: "大小",
			ballPick: "选择图片",
			ballClear: "恢复默认图片",
			ballFailed: "操作失败",
			ballGrant: "去授权",
			ballStatusRow: "显示状态行",
			ballStatusRowDesc: "关掉后球上只留鲸鱼和环，不显示文字。",
			ballThinkRow: "显示「思考中」",
			ballThinkRowDesc: "关掉后思考时不出现文字（环仍可显示）。",
			ballRingRow: "显示进度环",
			ballRingRowDesc: "关掉后不转圈。",
			ballLinesRow: "气泡最多行数",
			ballLinesRowDesc: "1–3 行。",
			ballResetRow: "重置球的位置",
			ballResetDone: "已重置到默认位置",
			ballOverlay: "悬浮窗权限（显示在其他应用上层）",
			ballOverlayOk: "已授予",
			ballOverlayMissing: "未授予 —— 没有它悬浮球无法显示",
			groupRuntime: "运行环境",
			groupUpdates: "更新与诊断",
			groupSettings: "设置",
			groupAccess: "权限与助手",
			title: "安卓沙箱",
			subtitle: "DeepSeek Harness 运行在手机内的 PRoot 沙箱里，这一页控制那个沙箱。",
			noBridge: "当前页面没有连到 DSH Android 应用（在电脑浏览器里打开时正常）。请用手机上的 DSH 应用打开本页。",
			status: "服务",
			distros: "发行版",
			settings: "设置",
			log: "日志",
			shizuku: "Shizuku（Android 特权通道）",
			mounts: "挂载",
			mountHint: "把手机上的文件夹挂进沙箱。改动在服务重启后生效。",
			mountPick: "选择文件夹挂载",
			mountHost: "手机上的路径",
			mountGuest: "沙箱内路径",
			mountAdd: "添加",
			mountEmpty: "还没有挂载。选一个文件夹，agent 和终端就能直接读写它。",
			mountMissing: "（路径已不存在）",
			mountApply: "重启服务使其生效",
			mountTest: "测一下",
			mountRestart: "重启服务以生效",
			mountRestarted: "已请求重启，几秒后再看沙箱里的目录",
			export: "导出",
			verLine: "%s · %s",
			hotTitle: "热更新包",
			hotCurrent: "当前：内置 %s",
			hotApplied: "已导入外部包 %s",
			hotBakedIn: "内置热包",
			hotImported: "已导入外部热包",
			hotHint: "热更新只在你要求时发生：点「检查更新」用线上的包，或用「选择本地热包」挑一个手机里的 dsh-hot.zip。应用不再自动读取 Download 目录。",
			updCheck: "检查更新",
			updChecking: "检查中…",
			updLatest: "已是最新（%s）",
			updFailed: "检查失败：%s（也可以选一个本地的 dsh-hot.zip 应用）",
			updHotTitle: "热更新可用 · %s",
			updHotHint: "插件、技能、提示词、沙箱脚本，约 %s KB，一键应用",
			updHotApply: "应用热更新",
			updHotApplied: "已应用，重开应用生效",
			updAppTitle: "重要更新可用 · v%s",
			updAppHint: "外壳（界面、图标、新接口），%s MB，需要安装新 APK；会话、密钥、设置都会保留",
			updAppDownload: "前往下载",
			updChannels: "当前：应用 %s · 热包 %s",
			exportTitle: "导出到手机",
			exportPath: "沙箱内路径",
			exportRecent: "最近的文件",
			exportHint: "导出到手机的 Download 目录，再用别的应用打开或分享。需要存储权限。",
			exportEmpty: "（最近没有可导出的文件）",
			start: "启动",
			stop: "停止",
			restart: "重启",
			openBrowser: "浏览器打开",
			import: "导入 rootfs",
			select: "选中",
			remove: "删除",
			save: "保存",
			saveCommand: "保存命令",
			command: "启动命令",
			port: "端口",
			chrome: "状态栏与任务栏",
			chromeHint: "自动＝纯色，与页面连成一片（默认，绝无色带）。选「亚克力」则让上下两条栏透出壁纸并模糊；深色壁纸下会更暗，建议配亮色壁纸。",
			chromeAuto: "自动",
			chromeAcrylic: "亚克力",
			chromeSolid: "纯色",
			apiKey: "DeepSeek API Key",
			share: "共享手机存储到 /sdcard",
			keepAwake: "后台保活",
			autoRestart: "异常退出后自动重启",
			refresh: "刷新",
			clear: "清空",
			request: "请求授权",
			run: "运行",
			testCommand: "测试命令（以 Android shell 身份执行）",
			running: "运行中",
			stopped: "已停止",
			starting: "启动中",
			failed: "启动失败",
			granted: "已授权",
			denied: "未授权",
			unavailable: "未安装/不可用",
			busy: "处理中…",
			termTitle: "终端",
			termClear: "清屏",
			termSend: "发送",
			termPaste: "粘贴",
			termInputHint: "在这里输入命令，回车发送（输入法在这条栏里才正常）",
			termConnected: "已连接",
			termConnecting: "正在连接…",
			termDisconnected: "连接已断开",
			termUnavailable: "终端不可用：本页没有连到 DSH Android 应用的沙箱 PTY 服务（在电脑浏览器里打开时正常）。",
			termReconnect: "重连",
			termError: "终端错误",
			termExited: "进程已退出（{code}）",
			termInputLabel: "终端输入",
			termCopy: "复制",
			termCopied: "已复制",
			termCopyHint: "先在屏幕上长按选中要复制的文字",
			termPasteHint: "读不到剪贴板，请长按终端里的输入区粘贴",
			termJumpToBottom: "回到最新输出",
			termTabName: "终端 {n}",
			termNewTab: "新建终端",
			termCloseTab: "关闭这个终端",
			termTabLimit: "最多同时开 {max} 个终端，先关掉一个",
			termKeyEsc: "Esc 键",
			termKeyTab: "Tab 键",
			termKeyCtrl: "Ctrl 组合键：点一下点亮，再按一个字母",
			termKeyLeft: "光标左移",
			termKeyUp: "上一条命令",
			termKeyDown: "下一条命令",
			termKeyRight: "光标右移",
			termKeyInterrupt: "中断当前命令（Ctrl+C）",
			termKeyboardHint: "键盘被收起了：点一下终端再输入",
			inUse: "当前使用",
			builtIn: "内置",
			saved: "已保存",
			logEmpty: "（无输出）",
			mountEnable: "启用",
			mountDisable: "停用",
			mountDisabled: "已停用",
			ballDisabled: "已停用",
			phoneTitle: "手机助手",
			phoneHint: "打开下面几项，就能直接让助手看屏幕、点按钮、在别的应用里打字。",
			phoneScreen: "无障碍（读屏、点击、输入）",
			phoneOverlay: "悬浮窗（悬浮球）",
			phoneMic: "麦克风（语音输入）",
			phoneGrant: "去开启",
			phoneAllowed: "已允许",
			phoneDenied: "未允许",
			phoneBall: "悬浮球",
			phoneBallHint: "按住说话（松开即发送），点一下在旁边弹出输入框；拖动可移动，消息会在球上方冒泡显示。",
			phoneBallLook: "外观",
			phoneBallLookHint: "这里改的是球的样子和大小；球体本身的材质、阴影与原生动效在外壳里，热包换不掉。",
			phoneBallSize: "大小",
			phoneBallSizeHint: "40–120 dp；松手即生效（球会重画一次）。",
			phoneBallSizeSmall: "小",
			phoneBallSizeMedium: "标准",
			phoneBallSizeLarge: "大",
			phoneBallSizeHuge: "特大",
			phoneBallImage: "图标",
			phoneBallBuiltin: "内置（大肥鱼）",
			phoneBallPick: "选择图片…",
			phoneBallImageHint: "预设随热包下发，是矢量图，放到多大都清晰；也可以自己挑一张 PNG/JPG。",
			phoneBallCustom: "自定义图片：",
			phoneBallPresetDeep: "深海鲸",
			phoneBallPresetLine: "线条鲸",
			phoneBallPresetSpark: "灵动",
			phoneBallPresetBuiltin: "内置",
			phoneBallPresetMissing: "预设文件还没在沙箱里（先在设置 →「检查更新」应用一次热包）。",
			phoneBallOn: "已开启",
			phoneBallOff: "已关闭",
			phoneEnable: "开启",
			phoneDisable: "关闭",
			phoneCurrent: "当前：应用 %s · 终端 t%s · 热包 %s",
			phoneTerminal: "终端更新可用 · t%s（需要安装新的 APK）",
			hotPick: "选择本地热包…",
			termMissing: "运行时未安装",
			termMissingHint: "这个外壳不含运行时（rootfs），需要单独下载一次：点下面「下载运行时」，约 %s MB，直接下到 App 私有目录——你不用自己找位置、不用解压、不用手动导入。下完会自动导入，看到「已安装」后终端即可使用；失败会在这里写明原因（网络 / 空间不足 / 校验失败），再点一次重试即可。",
			termDownload: "下载运行时",
			hotPicked: "已选文件：%s",
			portHint: "沙箱内 dsh web 监听的端口；改动在服务重启后生效。",
			apiKeyHint: "以 DEEPSEEK_API_KEY 注入沙箱环境；留空则沿用沙箱里已有的配置。"
		};
		const en = {
			nav: "Sandbox",
			navBall: "Floating ball",
			navVersion: "Version and updates",
			navAi: "AI permissions",
			aiTitle: "AI permissions",
			aiIntro: "Only the capabilities you mark as high risk need a per-conversation confirmation: the first use in a conversation asks for a fingerprint or face confirmation, and that conversation is not asked again; unchecked capabilities pass directly. The rule and the revokes both live on this page.",
			aiRiskTitle: "High-risk capabilities (fingerprint/face confirmation)",
			aiRiskIntro: "A checked capability asks for confirmation the first time it is used in a conversation; unchecked ones are allowed directly. This changes the rule; existing grants are revoked below.",
			aiRiskSaved: "Saved",
			aiRiskFailed: "Could not save: {error}",
			aiRiskUnsupported: "This app version is older: every capability asks for confirmation per conversation. Update the app to customize the high-risk set.",
			aiPrivacy: "This page lists conversation titles; they are kept only on this phone and visible only to you.",
			aiSessions: "Conversations with permissions",
			aiEmpty: "No high-risk grants yet.",
			aiUnknownSession: "(untitled conversation)",
			aiUpdated: "Last used: {time}",
			aiSessionId: "Session ID",
			aiGrantedAt: "Granted {time}",
			aiRevoke: "Revoke",
			aiRevokeSession: "Revoke this conversation",
			aiRevokeAll: "Revoke all",
			aiRevokeAllConfirm: "Confirm revoke all",
			aiCancel: "Cancel",
			aiRevoked: "Revoked {count}",
			aiRevokeFailed: "Revoke failed: {error}",
			aiLoadFailed: "Could not read permissions: {error}",
			aiUnavailable: "If this keeps failing, the app may predate 1.2.2, or this page is not inside the DSH app.",
			aiRefresh: "Refresh",
			aiNoCapabilities: "No capability is granted to this conversation yet.",
			aiAllNote: "Revoke all clears every conversation's grants; high-risk capabilities ask again the next time they are used.",
			aiCap_read: "Device and status",
			aiCap_clipboard: "Clipboard",
			aiCap_notify: "Toasts and notifications",
			aiCap_control: "Phone settings",
			aiCap_screenshot: "Screenshots",
			aiCap_terminal: "Terminal tabs",
			ballTitle: "Floating ball appearance",
			ballRunning: "Running",
			ballStopped: "Off",
			ballHint: "The native panel and this page share the same values; switching the ball off can always be undone here.",
			ballShow: "Show the floating ball",
			ballShowDesc: "Turn it back on from this same row at any time.",
			ballShown: "Ball shown",
			ballHidden: "Ball hidden",
			ballSize: "Size",
			ballPick: "Pick an image",
			ballClear: "Reset the image",
			ballFailed: "Failed",
			ballGrant: "Grant it",
			ballStatusRow: "Show the status line",
			ballStatusRowDesc: "Off: only the whale and the ring, no text.",
			ballThinkRow: "Show \"thinking\"",
			ballThinkRowDesc: "Off: no text while thinking (the ring can stay).",
			ballRingRow: "Show the progress ring",
			ballRingRowDesc: "Off: it does not spin.",
			ballLinesRow: "Bubble lines",
			ballLinesRowDesc: "1 to 3 lines.",
			ballResetRow: "Reset the ball's position",
			ballResetDone: "Back at the default position",
			ballOverlay: "Display over other apps",
			ballOverlayOk: "Granted",
			ballOverlayMissing: "Not granted - the ball cannot be shown without it",
			groupRuntime: "Runtime",
			groupUpdates: "Updates and diagnostics",
			groupSettings: "Settings",
			groupAccess: "Access and assistants",
			title: "Android sandbox",
			subtitle: "DeepSeek Harness runs inside a PRoot sandbox on this phone; this page controls that sandbox.",
			noBridge: "This page is not connected to the DSH Android app (expected in a desktop browser). Open it from the DSH app on the phone.",
			status: "Server",
			distros: "Distributions",
			settings: "Settings",
			log: "Log",
			shizuku: "Shizuku (privileged Android channel)",
			mounts: "Mounts",
			mountHint: "Folders on the phone, visible inside the sandbox. Changes apply after a server restart.",
			mountPick: "Pick a folder",
			mountHost: "Phone path",
			mountGuest: "Sandbox path",
			mountAdd: "Add",
			mountEmpty: "No mounts yet. Pick a folder and the agent and terminal can read and write it directly.",
			mountMissing: "(path no longer exists)",
			mountApply: "Restart the server to apply",
			mountTest: "Test",
			mountRestart: "Restart the server to apply",
			mountRestarted: "Restart requested; check the directory in a few seconds",
			export: "Export",
			verLine: "%s · %s",
			hotTitle: "Hot package",
			hotCurrent: "packaged %s",
			hotApplied: "imported %s",
			hotBakedIn: "baked-in",
			hotImported: "imported",
			hotHint: "A hot package is applied only when you ask: fetch the published one, or pick a dsh-hot.zip from the phone. The app no longer scans Download by itself.",
			updCheck: "Check for updates",
			updChecking: "Checking…",
			updLatest: "Up to date (%s)",
			updFailed: "Check failed: %s (you can still apply a local dsh-hot.zip)",
			updHotTitle: "Hot update available · %s",
			updHotHint: "Plugins, skills, prompt and sandbox scripts — about %s KB, one tap",
			updHotApply: "Apply hot update",
			updHotApplied: "Applied; reopen the app to load it",
			updAppTitle: "App update available · v%s",
			updAppHint: "The shell (UI, icon, new endpoints), %s MB, needs a new APK install; sessions, keys and settings are kept",
			updAppDownload: "Open download page",
			updChannels: "Installed: app %s · hot %s",
			exportTitle: "Export to phone",
			exportPath: "Sandbox path",
			exportRecent: "Recent files",
			exportHint: "Copies to the phone's Download folder so another app can open or share it. Needs storage access.",
			exportEmpty: "(nothing recent to export)",
			start: "Start",
			stop: "Stop",
			restart: "Restart",
			openBrowser: "Open in browser",
			import: "Import rootfs",
			select: "Use",
			remove: "Delete",
			save: "Save",
			saveCommand: "Save command",
			command: "Start command",
			port: "Port",
			chrome: "Status and navigation bars",
			chromeHint: "Auto is a flat colour that matches the page - the default, never a band. Acrylic lets the bars show the blurred wallpaper; it looks darker over a dark wallpaper, so a bright one shows it best.",
			chromeAuto: "Auto",
			chromeAcrylic: "Acrylic",
			chromeSolid: "Solid",
			apiKey: "DeepSeek API key",
			share: "Share phone storage at /sdcard",
			keepAwake: "Keep alive in background",
			autoRestart: "Restart after a crash",
			refresh: "Refresh",
			clear: "Clear",
			request: "Request access",
			run: "Run",
			testCommand: "Test command (runs as the Android shell user)",
			running: "running",
			stopped: "stopped",
			starting: "starting",
			failed: "failed",
			granted: "granted",
			denied: "not granted",
			unavailable: "unavailable",
			busy: "working…",
			termTitle: "Terminal",
			termClear: "Clear",
			termSend: "Send",
			termPaste: "Paste",
			termInputHint: "Type the command here — Enter sends it. The IME behaves in this field.",
			termConnected: "connected",
			termConnecting: "connecting…",
			termDisconnected: "disconnected",
			termUnavailable: "Terminal unavailable: this page is not connected to the DSH Android sandbox PTY service (expected in a desktop browser).",
			termReconnect: "Reconnect",
			termError: "terminal error",
			termExited: "Process exited ({code})",
			termInputLabel: "Terminal input",
			termCopy: "Copy",
			termCopied: "Copied",
			termCopyHint: "Long-press the screen to select text first",
			termPasteHint: "Clipboard unavailable — long-press the terminal to paste",
			termJumpToBottom: "Jump to latest output",
			termTabName: "Terminal {n}",
			termNewTab: "New terminal",
			termCloseTab: "Close this terminal",
			termTabLimit: "At most {max} terminals at once — close one first",
			termKeyEsc: "Escape key",
			termKeyTab: "Tab key",
			termKeyCtrl: "Ctrl chord: tap to arm, then a letter",
			termKeyLeft: "Move cursor left",
			termKeyUp: "Previous command",
			termKeyDown: "Next command",
			termKeyRight: "Move cursor right",
			termKeyInterrupt: "Interrupt (Ctrl+C)",
			termKeyboardHint: "Keyboard dismissed — tap the terminal to type again",
			inUse: "in use",
			builtIn: "bundled",
			saved: "Saved",
			logEmpty: "(no output)",
			mountEnable: "Enable",
			mountDisable: "Disable",
			mountDisabled: "disabled",
			ballDisabled: "disabled",
			phoneTitle: "Phone assistant",
			phoneHint: "Grant the three below and the agent can read the screen, tap controls and type into other apps.",
			phoneScreen: "Accessibility (read screen, tap, type)",
			phoneOverlay: "Draw over other apps (the floating ball)",
			phoneMic: "Microphone (voice input)",
			phoneGrant: "Grant",
			phoneAllowed: "granted",
			phoneDenied: "not granted",
			phoneBall: "Floating ball",
			phoneBallHint: "Hold to talk (sending on release); tap for an input box beside it. Drag to move; the bubble above it reports what happened.",
			phoneBallLook: "Appearance",
			phoneBallLookHint: "This changes the mark and the size only; the ball's material, shadow and native motion live in the shell, where a hot package cannot reach.",
			phoneBallSize: "Size",
			phoneBallSizeHint: "40–120 dp, applied on release (the ball is redrawn once).",
			phoneBallSizeSmall: "Small",
			phoneBallSizeMedium: "Standard",
			phoneBallSizeLarge: "Large",
			phoneBallSizeHuge: "Huge",
			phoneBallImage: "Picture",
			phoneBallBuiltin: "Built-in whale",
			phoneBallPick: "Choose a picture…",
			phoneBallImageHint: "The presets ship with the hot package as vectors, so they stay sharp at any size; a PNG/JPG works too.",
			phoneBallCustom: "Custom picture: ",
			phoneBallPresetDeep: "Deep whale",
			phoneBallPresetLine: "Outline whale",
			phoneBallPresetSpark: "Spark",
			phoneBallPresetBuiltin: "Built-in",
			phoneBallPresetMissing: "Presets are not in the sandbox yet — apply the hot package once (Settings → Check for updates).",
			phoneBallOn: "on",
			phoneBallOff: "off",
			phoneEnable: "Turn on",
			phoneDisable: "Turn off",
			phoneCurrent: "Installed: app %s · terminal t%s · hot %s",
			phoneTerminal: "Terminal update available · t%s (needs a new APK)",
			hotPick: "Pick a local package…",
			termMissing: "Runtime not installed",
			termMissingHint: "This shell carries no rootfs: download it once (about %s MB). Later shell updates are then a few megabytes.",
			termDownload: "Download runtime",
			hotPicked: "Picked: %s",
			portHint: "Port dsh web listens on inside the sandbox; changes apply after a restart.",
			apiKeyHint: "Injected into the sandbox as DEEPSEEK_API_KEY; leave blank to keep whatever the sandbox already has."
		};

		/* ====================================================================
		 * Page chrome
		 * --------------------------------------------------------------------
		 * The settings shell hands a section only `{ close }` and renders it in
		 * the content column: every heading, row and control on this page is the
		 * registrant's own, so "matching the shell" is a discipline the page has
		 * to keep by itself. It keeps it three ways:
		 *
		 *   atoms    Button / Switch / StateDot / Tag come from
		 *            @deepseek-ai/dsh-client-ui-primitives, so hover, active,
		 *            focus ring, disabled state and aria roles are upstream's.
		 *   tokens   colours are --dsw-* only — no literals — so light/dark and
		 *            any future retheme need no code here.
		 *   layout   the shapes the native pages use: an 18px/600 heading over a
		 *            13px tertiary intro, flat `.dsa-field` rows split by 0.5px
		 *            hairlines, and settings-card surfaces for grouped items.
		 *
		 * The primitives package is a static-table module in the shell's frozen
		 * seed (PLATFORM_MODULES), so requiring it adds no graph edge. It is
		 * resolved defensively anyway: a missing atom must degrade to plain
		 * chrome, never take the plugin — and with it the whole front-end boot —
		 * down.
		 * ================================================================ */

		const primitives = (() => {
			try {
				return require("@deepseek-ai/dsh-client-ui-primitives");
			} catch (error) {
				return null;
			}
		})();

		function fallbackButton(props) {
			const rest = Object.assign({}, props);
			delete rest.children;
			return h("button", Object.assign({ type: "button", className: "dsa-plainButton" }, rest), props.children);
		}

		function fallbackSwitch(props) {
			const disabled = props.disabled === true;
			return h("button", {
				type: "button",
				role: "switch",
				"aria-checked": props.checked === true,
				"aria-label": props.label,
				"aria-disabled": disabled ? "true" : "false",
				disabled,
				className: "dsa-plainSwitch",
				onClick: disabled || typeof props.onChange !== "function" ? undefined : () => props.onChange(!props.checked)
			}, h("span", { className: "dsa-plainThumb" }));
		}

		function fallbackStateDot(props) {
			return h("span", { className: "dsa-plainDot", "data-state": props.state, "aria-hidden": "true" });
		}

		function fallbackTag(props) {
			return h("span", { className: "dsa-plainTag" }, props.children);
		}

		/**
		 * Take one atom from the shared library, or the local stand-in.
		 *
		 * Presence, not `typeof === "function"`: Button is a forwardRef
		 * component, which is a React element type *object*, so a function test
		 * silently rejects exactly the atoms that matter most.
		 */
		function atom(name, fallback) {
			if (primitives === null) return fallback;
			const found = primitives[name];
			return found === undefined || found === null ? fallback : found;
		}

		const Button = atom("Button", fallbackButton);
		const Switch = atom("Switch", fallbackSwitch);
		const StateDot = atom("StateDot", fallbackStateDot);
		const Tag = atom("Tag", fallbackTag);

		const STYLE_ID = "dsh-plugin-android/page.css";

		/**
		 * The page stylesheet. Kept as one plain block (not CSS modules): this
		 * bundle is hand-written and has no build step to hash class names, so
		 * every rule is scoped under `.dsa-root` instead, and every value is a
		 * --dsw-* token the theme resolves.
		 */
		const PAGE_CSS = `
.dsa-root{display:flex;flex-direction:column;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dsa-root *{box-sizing:border-box}
.dsa-group{margin:18px 0 6px;font-size:13px;font-weight:600;opacity:.72;letter-spacing:.02em}
.dsa-heading{margin:0;font-size:18px;font-weight:600;line-height:26px}
.dsa-intro{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.dsa-meta{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dsa-group{display:flex;flex-direction:column;gap:10px;min-width:0}
.dsa-groupTitle{margin:0;font-size:15px;font-weight:600;line-height:22px}
.dsa-card{border:0.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);padding:12px 16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.dsa-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
.dsa-row{display:flex;align-items:center;gap:10px;min-width:0}
.dsa-rowWrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
.dsa-spread{display:flex;align-items:center;gap:10px;justify-content:space-between;min-width:0}
.dsa-copy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.dsa-inline{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.dsa-title{font-size:14px;line-height:20px}
.dsa-strong{font-size:14px;font-weight:500;line-height:20px}
.dsa-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsa-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsa-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px;overflow-wrap:anywhere}
.dsa-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dsa-warn{font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary);overflow-wrap:anywhere}
.dsa-sep{border:0;border-top:0.5px solid var(--dsw-alias-border-l2);margin:0}
.dsa-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsa-foot{display:flex;align-items:center;gap:8px;padding-top:2px}
.dsa-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.dsa-field:first-child{padding-top:2px}
.dsa-field + .dsa-field,.dsa-field + .dsa-toggle,.dsa-toggle + .dsa-field,.dsa-toggle + .dsa-toggle,.dsa-foot{border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:12px}
.dsa-fieldLabel{font-size:13px;font-weight:500;line-height:20px}
.dsa-inputRow{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
.dsa-inputRow > .dsa-input,.dsa-inputRow > .dsa-textarea{flex:1 1 140px;width:auto;min-width:0}
.dsa-input,.dsa-textarea{width:100%;height:34px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);outline:none}
.dsa-input:focus-visible,.dsa-textarea:focus-visible{border-color:var(--dsw-alias-state-business-primary)}
.dsa-input::placeholder,.dsa-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}
.dsa-textarea{height:auto;min-height:92px;padding:8px 12px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:18px}
.dsa-input[type=password]{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dsa-pre{margin:0;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);max-height:240px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
.dsa-toggle{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0}
.dsa-toggle[data-disabled=true]{opacity:.55}
.dsa-item{display:flex;flex-direction:column;gap:8px;min-width:0}
.dsa-item + .dsa-item{border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:10px}
.dsa-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.dsa-plainButton{font:inherit;font-size:13px;padding:6px 12px;border-radius:var(--dsw-radius-md);border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
.dsa-plainSwitch{position:relative;flex:none;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}
.dsa-plainSwitch[aria-checked=true]{background:var(--dsw-alias-state-success-primary)}
.dsa-plainThumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:transform 120ms ease}
.dsa-plainSwitch[aria-checked=true] .dsa-plainThumb{transform:translateX(16px)}
.dsa-plainDot{display:inline-block;width:10px;height:10px;border-radius:50%;background:currentColor}
.dsa-plainDot[data-state=done]{color:var(--dsw-alias-state-success-primary)}
.dsa-plainDot[data-state=warning]{color:var(--dsw-alias-state-warn-primary)}
.dsa-plainDot[data-state=error]{color:var(--dsw-alias-state-error-primary)}
.dsa-plainDot[data-state=idle]{color:var(--dsw-alias-state-idle-primary)}
.dsa-plainTag{display:inline-flex;align-items:center;padding:1px 8px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:999px;font-size:11px;line-height:17px;font-weight:500;color:var(--dsw-alias-label-tertiary)}
/* ---- floating ball: the appearance card ----
   The ball is a native overlay drawn by BallService.java, so this preview has one
   job: show the same thing the phone will show. Same fill (app/res/values*/colors.xml:
   #4C6FFF by day, #3B5BFF at night — the day/night pair the harness theme already
   mirrors here), same mark, same size/6 inset. Anything the preview cannot mirror
   (material, shadow, native motion) is stated in the hint instead of faked. */
.dsa-root{--dsa-ball-fill:#4C6FFF;--dsa-ball-stroke:rgba(255,255,255,0.2)}
html[data-ds-dark-theme] .dsa-root{--dsa-ball-fill:#3B5BFF}
.dsa-ballRow{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.dsa-ballStage{position:relative;flex:none;width:148px;height:148px;display:grid;place-items:center;border-radius:var(--dsw-radius-xl);border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dsa-ballHalo{position:absolute;width:108px;height:108px;border-radius:50%;background:radial-gradient(circle,rgba(76,111,255,0.26) 0%,rgba(76,111,255,0) 70%)}
.dsa-ball{position:relative;display:grid;place-items:center;border-radius:50%;background:var(--dsa-ball-fill);box-shadow:0 8px 20px rgba(38,63,166,0.32),inset 0 1px 0 rgba(255,255,255,0.34);animation:dsa-breathe 3.6s ease-in-out infinite}
.dsa-ball svg{display:block}
@keyframes dsa-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
@media (prefers-reduced-motion:reduce){.dsa-ball{animation:none}}
.dsa-ballSide{display:flex;flex-direction:column;gap:12px;flex:1 1 240px;min-width:0}
.dsa-ballChips{display:flex;gap:6px;flex-wrap:wrap}
.dsa-ballChip{font:inherit;font-size:12px;line-height:18px;padding:4px 10px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsa-ballChip[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-3)}
.dsa-range{width:100%;height:22px;accent-color:var(--dsw-alias-state-business-primary)}
.dsa-presets{display:flex;gap:8px;flex-wrap:wrap}
.dsa-preset{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 10px;border-radius:var(--dsw-radius-md);border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:11px;line-height:16px}
.dsa-preset[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}
.dsa-presetMark{width:26px;height:26px;border-radius:50%;background:var(--dsa-ball-fill);display:grid;place-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.3)}
.dsa-termHost{display:flex;flex:1;min-height:0;min-width:0}
.dsv-root{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:18px;background:var(--dsv-bg);color:var(--dsv-fg);--dsv-bg:#14161a;--dsv-fg:#e8eaed;--dsv-cursor:#4c8dff;--dsv-cursor-accent:#10131a;--dsv-selection:#2c3a55;--dsv-compose:#243050}
.dsv-viewport{position:relative;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:6px 8px 10px}
.dsv-lines{position:relative;min-height:100%;white-space:pre;-webkit-user-select:text;user-select:text;font:inherit}
.dsv-row{white-space:pre;min-height:18px;font:inherit;content-visibility:auto;contain-intrinsic-size:auto 18px}
.dsv-row::selection,.dsv-row ::selection{background:var(--dsv-selection)}
.dsv-caret{background:var(--dsv-cursor);color:var(--dsv-cursor-accent);border-radius:1px}
.dsv-caret-off{outline:1px solid var(--dsv-cursor);outline-offset:-1px}
.dsv-compose{background:var(--dsv-compose);text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px}
.dsv-input{position:absolute;left:0;top:0;width:100%;height:18px;margin:0;padding:0;border:0;outline:none;background:transparent;color:transparent;caret-color:transparent;font:inherit;line-height:18px;white-space:pre;overflow:hidden;resize:none}
.dsv-keys{display:flex;align-items:center;gap:6px;flex:none;padding:5px 8px;border-top:0.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);overflow-x:auto;overscroll-behavior-x:contain}
.dsv-key{flex:none;font:inherit;font-size:12px;line-height:16px;padding:4px 10px;border-radius:6px;border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsv-key[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-3)}
.dsv-tabs{display:flex;align-items:center;gap:6px;flex:none;padding:6px 8px;overflow-x:auto;overscroll-behavior-x:contain;border-bottom:0.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1)}
.dsv-tab{display:flex;align-items:center;flex:none;border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-base);overflow:hidden}
.dsv-tab[data-active=true]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-3)}
.dsv-tabLabel{display:flex;align-items:center;gap:6px;flex:none;min-height:32px;padding:0 8px;border:0;background:transparent;font:inherit;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}
.dsv-tab[data-active=true] .dsv-tabLabel{color:var(--dsw-alias-label-primary)}
.dsv-tabClose{flex:none;width:30px;min-height:32px;padding:0;border:0;border-left:0.5px solid var(--dsw-alias-border-l3);background:transparent;font:inherit;font-size:15px;line-height:1;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsv-tabAdd{flex:none;width:34px;min-height:32px;padding:0;border:0.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:transparent;font:inherit;font-size:17px;line-height:1;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsv-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.dsv-dot[data-state=ready]{background:var(--dsw-alias-state-success-primary)}
.dsv-dot[data-state=connecting]{background:var(--dsw-alias-state-warn-primary)}
.dsv-dot[data-state=error]{background:var(--dsw-alias-state-error-primary)}
.dsv-jump{position:absolute;right:10px;bottom:10px;width:30px;height:30px;border-radius:15px;border:0.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.18)}
.dsv-jump[data-visible=true]{display:block}
@keyframes dsv-blink{0%,49%{opacity:1}50%,100%{opacity:0.35}}
`;

		/** Mount the page stylesheet once, and take it away when the plugin goes. */
		function mountStyles() {
			if (typeof document === "undefined") return () => {};
			if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`) !== null) return () => {};
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-android";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = PAGE_CSS;
			document.head.appendChild(tag);
			return () => tag.remove();
		}

		function usePolling(intervalMs) {
			const [tick, setTick] = react.useState(0);
			react.useEffect(() => {
				const id = setInterval(() => setTick((n) => n + 1), intervalMs);
				return () => clearInterval(id);
			}, [intervalMs]);
			return tick;
		}

		function bridge() {
			const api = globalThis.DshAndroid;
			return api && api.base ? api : null;
		}

		/**
		 * Every bridge call is bounded.
		 *
		 * The app shares this phone, but a frozen or wedged UI thread can leave
		 * a request hanging forever — and the terminal relay polls every 900ms,
		 * so one stuck request would stall it for good. 5s is far above a healthy
		 * loopback round-trip and far below "hang".
		 */
		const BRIDGE_CALL_TIMEOUT_MS = 5000;

		/**
		 * One abort deadline for a call; a non-positive `timeoutMs` means none.
		 *
		 * Returns the signal plus a cleanup for the fallback timer: a pending
		 * `setTimeout` would otherwise abort a signal long after its call finished,
		 * keeping a timer (and the page) busy for no reason.
		 */
		function bridgeCallSignal(timeoutMs) {
			const idle = { signal: undefined, cleanup() {} };
			if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return idle;
			try {
				if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
					return { signal: AbortSignal.timeout(timeoutMs), cleanup() {} };
				}
			} catch (error) {
				/* older WebView: fall through to the controller */
			}
			if (typeof AbortController !== "function") return idle;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
		}

		/**
		 * One authenticated bridge call.
		 *
		 * `options.timeoutMs` overrides the 5s default for the few endpoints that
		 * do real work server-side (Proot, downloads, file copies); everything
		 * else — above all the terminal relay's poll — must give up instead of
		 * waiting for an app that stopped answering.
		 */
		async function call(path, body, options) {
			const api = bridge();
			if (api === null) throw new Error("no bridge");
			const timeoutMs = options !== null && typeof options === "object" && typeof options.timeoutMs === "number"
				? options.timeoutMs
				: BRIDGE_CALL_TIMEOUT_MS;
			const deadline = bridgeCallSignal(timeoutMs);
			let response;
			let text;
			try {
				response = await fetch(api.base + path, {
					method: body === undefined ? "GET" : "POST",
					headers: Object.assign({ "X-Dsh-Token": api.token ?? "" },
						body === undefined ? null : { "Content-Type": "application/json" }),
					body: body === undefined ? undefined : JSON.stringify(body),
					signal: deadline.signal
				});
				text = await response.text();
			} catch (error) {
				// AbortSignal.timeout aborts with "TimeoutError"; our own controller
				// aborts with "AbortError". A frozen app is the same failure either way.
				const name = error !== null && typeof error === "object" ? error.name : "";
				if (name === "AbortError" || name === "TimeoutError") {
					throw new Error("控制桥 " + Math.round(timeoutMs / 1000) + " 秒没有响应（" + path + "）");
				}
				throw error;
			} finally {
				deadline.cleanup();
			}
			let data;
			try {
				data = text ? JSON.parse(text) : {};
			} catch (error) {
				throw new Error("bad bridge response: " + text.slice(0, 120));
			}
			if (!response.ok) throw new Error(data.error ?? ("HTTP " + response.status));
			return data;
		}

		/* ------------------------------------------------------------------
		 * The page's own shapes. Each of these is one native pattern, kept in
		 * one place so the whole page stays on it.
		 * ---------------------------------------------------------------- */

		function Card(props) {
			return h("div", { className: "dsa-card" }, props.children);
		}

		function Group(props) {
			return h("section", { className: "dsa-group" },
				props.title === undefined || props.title === ""
					? null
					: h("h3", { className: "dsa-groupTitle" }, props.title),
				props.children);
		}

		/** A labelled settings-form field: label, control, hint (fields.module.css). */
		function Field(props) {
			return h("div", { className: "dsa-field" },
				h("label", { className: "dsa-fieldLabel", htmlFor: props.id }, props.label),
				props.control,
				props.hint === undefined ? null : h("p", { className: "dsa-hint" }, props.hint));
		}

		function TextInput(props) {
			const rest = Object.assign({}, props);
			delete rest.grow;
			return h("input", Object.assign({ id: props.id, className: "dsa-input", type: props.type ?? "text" }, rest));
		}

		/** Title + description on the left, one control on the right (the General rows). */
		function ToggleRow(props) {
			const disabled = props.disabled === true;
			return h("div", { className: "dsa-toggle", "data-disabled": disabled ? "true" : "false" },
				h("div", { className: "dsa-copy" },
					h("span", { className: "dsa-title" }, props.title),
					props.desc === undefined ? null : h("span", { className: "dsa-hint" }, props.desc)),
				h(Switch, {
					checked: props.checked === true,
					onChange: disabled ? undefined : props.onChange,
					label: props.title,
					disabled,
					"aria-disabled": disabled ? "true" : "false"
				}));
		}

		/**
		 * The floating ball's own settings.
		 *
		 * These lived only in the native panel, which exposed the *server* toggles rather
		 * than the ball's; the bridge routes already existed (`/ball/config`,
		 * `/ball/start`, `/ball/stop`, `/ball/pick-image`), so this is the first UI that
		 * can change them.
		 *
		 * On/off goes through `/ball/start|stop` and never through the preference: the
		 * service writes `ballEnabled` itself when it starts and stops, so a pref written
		 * behind its back would be flipped back and the switch would disagree with the
		 * ball. The native panel stays in place for now - both edit the same keys.
		 */
		function BallCard(props) {
			const t = props.t;
			// The snapshot carries the stored size and image; whether the ball is up is a
			// runtime fact, so it comes from the state route.
			const current = props.ball !== null && props.ball !== undefined && props.ball.size
				? props.ball.size : 58;            // BallService.DEFAULT_SIZE_DP
			const [state, setState] = react.useState(null);
			const [size, setSize] = react.useState(null);
			const [message, setMessage] = react.useState("");
			const [needsPermission, setNeedsPermission] = react.useState(false);
			const running = state !== null && state.running === true;
			// The user's own size may be none of the presets (40dp, say). Keep the presets
			// and fold the current value in, so exactly one choice is always highlighted.
			const sizes = Array.from(new Set([48, 58, 68, 78, current])).sort((a, b) => a - b);
			const chosen = size === null ? current : size;
			const refreshState = async () => {
				try {
					const data = await props.call("/ball/state", {});
					setState(data.state ?? data);
				} catch (error) {
					setState(null);
				}
			};
			// The behaviour switches live in the app's prefs too; one read returns all of
			// them (flat map), and each write sends only the key that changed.
			const [prefs, setPrefs] = react.useState(null);
			const [overlay, setOverlay] = react.useState(null);
			const saveBall = async (key, value) => {
				setMessage(t("busy"));
				try {
					const payload = {};
					payload[key] = value;
					await props.call("/ball/settings", payload);
					const fresh = await props.call("/ball/settings", undefined);
					setPrefs(fresh);
					setMessage(t("saved"));
				} catch (error) {
					setMessage(String(error.message ?? error));
				}
			};
			const refreshPrefs = async () => {
				try {
					setPrefs(await props.call("/ball/settings", undefined));
				} catch (error) {
					setPrefs(null);
				}
			};
			const refreshOverlay = async () => {
				try {
					const data = await props.call("/a11y/status", {});
					setOverlay(data.overlay === true);
				} catch (error) {
					setOverlay(null);
				}
			};
			react.useEffect(() => {
				refreshState();
				refreshOverlay();
				refreshPrefs();
			}, []);
			const run = async (label, action) => {
				setMessage(t("busy"));
				setNeedsPermission(false);
				try {
					const data = await action();
					// `ok:false` arrives with HTTP 200, so it has to be checked explicitly -
					// otherwise a refusal would be reported as success.
					if (data !== null && data !== undefined && data.ok === false) {
						setNeedsPermission(data.needsOverlayPermission === true);
						setMessage(data.error ?? t("ballFailed"));
					} else {
						setMessage(data !== null && data !== undefined && data.message ? data.message : label);
					}
				} catch (error) {
					setMessage(String(error.message ?? error));
				}
				await refreshState();
				await refreshOverlay();
				await props.reload();
			};
			return h(Card, null,
				h("div", { className: "dsa-row" },
					h("span", { className: "dsa-strong" }, t("ballTitle")),
					h("span", { className: "dsa-hint" }, running ? t("ballRunning") : t("ballStopped"))),
				h("p", { className: "dsa-hint" }, t("ballHint")),
				// The ball's own permission, in the ball's own section: without it the
				// ball cannot appear at all, so it belongs next to this switch and not
				// under some other feature that merely also needs it.
				h("div", { className: "dsa-row" },
					h("span", { className: "dsa-title" }, t("ballOverlay")),
					h("span", { className: "dsa-hint" },
						overlay === null ? t("busy") : overlay ? t("ballOverlayOk") : t("ballOverlayMissing")),
					overlay === false
						? h(Button, { variant: "outline", size: "sm",
							onClick: () => run(t("busy"), () => props.call("/overlay/request", {})) },
							t("ballGrant"))
						: null),
				h(ToggleRow, {
					title: t("ballShow"),
					desc: t("ballShowDesc"),
					checked: running,
					onChange: (on) => run(on ? t("ballShown") : t("ballHidden"),
						() => props.call(on ? "/ball/start" : "/ball/stop", {}))
				}),
				h("div", { className: "dsa-row" },
					h("span", { className: "dsa-title" }, t("ballSize")),
					h("div", { className: "dsa-row" }, sizes.map((value) => h(Button, {
						key: value,
						variant: chosen === value ? "primary" : undefined,
						onClick: () => {
							setSize(value);
							run(t("saved"), () => props.call("/ball/config", { size: value }));
						}
					}, value + "dp")))),
				// The ball's own behaviour. Everything defaults to what the ball already
				// did, so an existing user sees no change until they touch a row.
				h(ToggleRow, {
					title: t("ballStatusRow"),
					desc: t("ballStatusRowDesc"),
					checked: prefs === null ? true : prefs.ballShowStatus !== false,
					onChange: (value) => saveBall("ballShowStatus", value)
				}),
				h(ToggleRow, {
					title: t("ballThinkRow"),
					desc: t("ballThinkRowDesc"),
					checked: prefs === null ? true : prefs.ballShowThink !== false,
					onChange: (value) => saveBall("ballShowThink", value)
				}),
				h(ToggleRow, {
					title: t("ballRingRow"),
					desc: t("ballRingRowDesc"),
					checked: prefs === null ? true : prefs.ballShowRing !== false,
					onChange: (value) => saveBall("ballShowRing", value)
				}),
				h(ChoiceRow, {
					title: t("ballLinesRow"),
					desc: t("ballLinesRowDesc"),
					value: String(prefs === null ? 3 : (prefs.ballBubbleLines ?? 3)),
					options: [1, 2, 3].map((n) => ({ value: String(n), label: String(n) })),
					onChange: (value) => saveBall("ballBubbleLines", parseInt(value, 10))
				}),
				h("div", { className: "dsa-actions" },
					h(Button, { variant: "outline", size: "sm",
						onClick: () => run(t("ballResetDone"), () => props.call("/ball/reset-position", {})) },
						t("ballResetRow"))),
				h("div", { className: "dsa-actions" },
					h(Button, { variant: "outline", size: "sm",
						onClick: () => run(t("busy"), () => props.call("/ball/pick-image", {})) }, t("ballPick")),
					h(Button, { variant: "ghost", size: "sm",
						onClick: () => run(t("saved"), () => props.call("/ball/config", { image: "" })) }, t("ballClear"))),
				message === "" ? null : h("p", { className: "dsa-hint" }, message),
				needsPermission
					? h("div", { className: "dsa-actions" },
						h(Button, { variant: "outline", size: "sm",
							onClick: () => run(t("busy"), () => props.call("/overlay/request", {})) },
						t("ballGrant")))
					: null);
		}

		/**
		 * A three-way choice, in the same shape as ToggleRow.
		 *
		 * Window chrome has three states rather than two: the good one depends on what
		 * the ROM will actually do, and some people just want the flat bar back.
		 */
		function ChoiceRow(props) {
			return h("div", { className: "dsa-toggle" },
				h("div", { className: "dsa-copy" },
					h("span", { className: "dsa-title" }, props.title),
					props.desc === undefined ? null : h("span", { className: "dsa-hint" }, props.desc)),
				h("div", { className: "dsa-row" },
					props.options.map((option) => h(Button, {
						key: option.value,
						variant: props.value === option.value ? "primary" : undefined,
						onClick: () => props.onChange(option.value)
					}, option.label))));
		}

		function StatusCard(props) {
			const status = props.status ?? {};
			const dot = status.state === "RUNNING" ? "done"
				: status.state === "ERROR" ? "error"
					: status.state === "STARTING" ? "ongoing" : "idle";
			const label = props.t(status.state === "RUNNING" ? "running"
				: status.state === "STARTING" ? "starting"
					: status.state === "ERROR" ? "failed" : "stopped");
			return h(Card, null,
				h("div", { className: "dsa-row" },
					h(StateDot, { state: dot }),
					h("span", { className: "dsa-strong" }, label),
					h("span", { className: "dsa-hint" }, "127.0.0.1:" + status.port)),
				status.url !== null && status.url !== undefined && status.url !== ""
					? h("div", { className: "dsa-desc dsa-mono" }, status.url)
					: null,
				status.error !== null && status.error !== undefined && status.error !== ""
					? h("div", { className: "dsa-error" }, status.error)
					: null,
				h("hr", { className: "dsa-sep" }),
				h("div", { className: "dsa-actions" },
					h(Button, { variant: "primary", onClick: () => props.act("/server/start") }, props.t("start")),
					h(Button, { variant: "ghost", onClick: () => props.act("/server/stop") }, props.t("stop")),
					h(Button, { variant: "ghost", onClick: () => props.act("/server/restart") }, props.t("restart")),
					h(Button, { variant: "ghost", size: "sm", onClick: () => props.act("/open-in-browser") }, props.t("openBrowser")),
					h(Button, { variant: "ghost", size: "sm", onClick: () => props.act("/import") }, props.t("import"))),
				props.message !== null && props.message !== undefined
					? h("p", { className: "dsa-hint" }, props.message)
					: null);
		}

		function DistroCard(props) {
			const t = props.t;
			const [command, setCommand] = react.useState(null);
			react.useEffect(() => {
				setCommand(props.distro.command);
			}, [props.distro.id, props.distro.command]);
			return h("li", null,
				h(Card, null,
					h("div", { className: "dsa-spread" },
						h("div", { className: "dsa-inline" },
							h("span", { className: "dsa-strong" }, props.distro.name),
							props.distro.active ? h(Tag, { tone: "success" }, t("inUse")) : null,
							props.distro.bundled ? h(Tag, { tone: "neutral" }, t("builtIn")) : null),
						h("div", { className: "dsa-actions" },
							props.distro.active ? null : h(Button, {
								variant: "outline", size: "sm",
								onClick: () => props.onSelect(props.distro.id)
							}, t("select")),
							props.distro.bundled ? null : h(Button, {
								variant: "ghost", size: "sm",
								onClick: () => props.onDelete(props.distro.id)
							}, t("remove")))),
					h("div", { className: "dsa-desc dsa-mono" }, props.distro.id + " · " + props.distro.path),
					props.distro.active
						? h("div", null,
							h("hr", { className: "dsa-sep" }),
							h("div", { className: "dsa-field" },
								h("label", { className: "dsa-fieldLabel" }, t("command")),
								h("textarea", {
									className: "dsa-textarea",
									rows: 3,
									value: command ?? "",
									onChange: (event) => setCommand(event.target.value)
								}),
								h("div", { className: "dsa-actions" },
									h(Button, {
										variant: "outline", size: "sm",
										onClick: () => props.onCommand(props.distro.id, command ?? "")
									}, t("saveCommand")))))
						: null));
		}

		function MountsCard(props) {
			const t = props.t;
			const mounts = props.mounts ?? [];
			const [host, setHost] = react.useState("");
			const [guest, setGuest] = react.useState("");
			const [message, setMessage] = react.useState("");
			const [output, setOutput] = react.useState("");
			const act = async (path, body) => {
				try {
					const result = await call(path, body);
					setMessage(result.message ?? "");
					if (props.onChanged) await props.onChanged();
				} catch (error) {
					setMessage(String(error.message ?? error));
				}
			};
			return h(Group, { title: t("mounts") },
				mounts.length === 0
					? h("p", { className: "dsa-hint" }, t("mountEmpty"))
					: h("ul", { className: "dsa-list" }, mounts.map((mount) => h("li", { key: mount.id },
						h(Card, null,
							h("div", { className: "dsa-spread" },
								h("div", { className: "dsa-inline" },
									h("span", { className: "dsa-strong" }, mount.guest),
									mount.enabled !== true ? h(Tag, { tone: "quiet" }, t("mountDisabled")) : null),
								h("div", { className: "dsa-actions" },
									h(Button, {
										variant: "outline", size: "sm",
										onClick: async () => {
											setMessage(t("busy"));
											try {
												const result = await call("/mounts/test", { id: mount.id }, { timeoutMs: 45000 });
												setMessage("");
												setOutput("$ ls -la " + mount.guest + "\n" + (result.output ?? "")
													+ (result.problem ? "\n⚠ " + result.problem : ""));
											} catch (error) {
												setMessage(String(error.message ?? error));
											}
										}
									}, t("mountTest")),
									h(Button, {
										variant: "ghost", size: "sm",
										onClick: () => act("/mounts/toggle", { id: mount.id, enabled: mount.enabled !== true })
									}, mount.enabled === true ? t("mountDisable") : t("mountEnable")),
									h(Button, {
										variant: "ghost", size: "sm",
										onClick: () => act("/mounts/remove", { id: mount.id })
									}, t("remove")))),
							h("div", { className: "dsa-desc dsa-mono" }, mount.host),
							// Why this mount shows nothing, in the user's terms. The app used
							// to drop unreadable paths from the PRoot command line, which
							// looked exactly like the feature being broken.
							mount.problem
								? h("div", { className: "dsa-warn" }, "⚠ " + mount.problem)
								: null)))),
				h("div", { className: "dsa-actions" },
					h(Button, { variant: "primary", onClick: () => act("/mounts/pick", {}) }, t("mountPick"))),
				h(Card, null,
					h("div", { className: "dsa-field" },
						h("label", { className: "dsa-fieldLabel" }, t("mountHost") + " → " + t("mountGuest")),
						h("div", { className: "dsa-inputRow" },
							h(TextInput, {
								grow: true,
								value: host,
								placeholder: "/storage/emulated/0/Documents",
								onChange: (event) => setHost(event.target.value)
							}),
							h(TextInput, {
								grow: true,
								value: guest,
								placeholder: "/mnt/docs",
								onChange: (event) => setGuest(event.target.value)
							}),
							h(Button, { variant: "outline", onClick: () => act("/mounts/add", { host, guest }) }, t("mountAdd")))),
					output !== ""
						? h("pre", { className: "dsa-pre" }, output)
						: null,
					h("hr", { className: "dsa-sep" }),
					h("div", { className: "dsa-actions" },
						h(Button, { variant: "outline", onClick: () => act("/server/restart", {}) }, t("mountRestart"))),
					h("p", { className: "dsa-hint" }, t("mountHint"))),
				message !== "" ? h("p", { className: "dsa-hint" }, message) : null);
		}

		function ExportCard(props) {
			const t = props.t;
			const [path, setPath] = react.useState("");
			const [recent, setRecent] = react.useState(null);
			const [message, setMessage] = react.useState("");
			const load = async () => {
				try {
					const data = await call("/export/recent");
					setRecent(data.files ?? []);
				} catch (error) {
					setRecent([]);
				}
			};
			react.useEffect(() => { load(); }, []);
			const doExport = async (target) => {
				if (!target) {
					setMessage(t("exportPath") + "?");
					return;
				}
				setMessage(t("busy"));
				try {
					const data = await call("/export", { path: target }, { timeoutMs: 180000 });
					setMessage(data.message ?? data.error ?? "");
				} catch (error) {
					setMessage(String(error.message ?? error));
				}
			};
			return h(Group, { title: t("exportTitle") },
				h(Card, null,
					h("div", { className: "dsa-field" },
						h("label", { className: "dsa-fieldLabel" }, t("exportPath")),
						h("div", { className: "dsa-inputRow" },
							h(TextInput, {
								grow: true,
								value: path,
								placeholder: "/root/report.md",
								onChange: (event) => setPath(event.target.value)
							}),
							h(Button, { variant: "primary", onClick: () => doExport(path) }, t("export"))),
						h("p", { className: "dsa-hint" }, t("exportHint"))),
					h("hr", { className: "dsa-sep" }),
					h("div", { className: "dsa-field" },
						h("span", { className: "dsa-fieldLabel" }, t("exportRecent")),
						recent === null
							? h("p", { className: "dsa-hint" }, t("busy"))
							: recent.length === 0
								? h("p", { className: "dsa-hint" }, t("exportEmpty"))
								: h("div", null, recent.slice(0, 8).map((file) => h("div", {
									key: file.path,
									className: "dsa-spread",
									style: { padding: "6px 0" }
								},
									h("span", { className: "dsa-desc dsa-mono dsa-ellipsis" }, file.path),
									h(Button, {
										variant: "outline", size: "sm",
										onClick: () => doExport(file.path)
									}, t("export"))))))),
				message !== "" ? h("p", { className: "dsa-hint" }, message) : null);
		}

		/**
		 * Export button for the file preview toolbar.
		 *
		 * The slot hands the action only the preview content, not the path, but the
		 * preview's header renders the path in an element tagged
		 * data-textpreview-path — so the button reads its own sibling. That keeps
		 * this decoupled from any other plugin's state store, at the cost of
		 * depending on a data attribute the preview has used all along.
		 */
		function ExportAction(props) {
			const t = props.t;
			const [message, setMessage] = react.useState("");
			const run = async () => {
				const label = document.querySelector("[data-textpreview-path]");
				const path = label === null ? "" : label.textContent.trim();
				if (path === "") {
					setMessage(t("exportPath") + "?");
					return;
				}
				setMessage(t("busy"));
				try {
					const data = await call("/export", { path }, { timeoutMs: 180000 });
					setMessage(data.ok === true ? "→ Download/" + data.name : (data.error ?? ""));
				} catch (error) {
					setMessage(String(error.message ?? error));
				}
			};
			return h("span", { className: "dsa-inline" },
				h(Button, { variant: "ghost", size: "sm", onClick: run }, t("export")),
				message === "" ? null : h("span", { className: "dsa-hint" }, message));
		}

		function UpdateCard(props) {
			const t = props.t;
			const app = props.app ?? "";
			const packaged = props.packaged ?? "";
			const applied = props.applied ?? "";
			const versionCode = props.versionCode ?? 0;
			const [state, setState] = react.useState("idle");
			const [info, setInfo] = react.useState(null);
			const [message, setMessage] = react.useState("");
			const current = applied === "" ? packaged : applied;

			// Through the bridge: the app fetches the manifest server-side, so
			// there is no cross-origin request and a failure comes back readable.
			const check = async () => {
				setState("checking");
				setMessage("");
				try {
					const data = await call("/update/check", {}, { timeoutMs: 30000 });
					if (data.ok !== true) throw new Error(data.error ?? t("failed"));
					setInfo(data);
					setState("done");
				} catch (error) {
					setState("failed");
					setMessage(String(error.message ?? error));
				}
			};
			react.useEffect(() => { check(); }, []);

			// A hot package belongs to one exact line — "<app>-t<terminal>-sp<n>".
			// Offering one from a different line would put a newer plugin on an
			// older shell, where the endpoints it calls do not exist yet; the app
			// update below is the right answer for that case.
			const line = (props.app ?? "") + "-t" + (props.terminal ?? "") + "-";
			const sameLine = (value) => value === "" || String(value).indexOf(line) === 0;
			const hotNew = info !== null && info.hot !== undefined && info.hot.version !== ""
				&& sameLine(info.hot.version)
				&& info.hot.version !== current && info.hot.version !== packaged;
			const appNew = info !== null && info.app !== undefined
				&& (info.app.versionCode ?? 0) > versionCode;
			// The sandbox runtime has its own number and only ever ships inside an
			// APK, so a newer terminal reads as "install the new shell", not as
			// something to download here.
			const terminalNew = info !== null && info.terminal !== undefined
				&& Number(info.terminal.version ?? 0) > Number(props.terminal ?? 0);

			return h(Group, { title: t("hotTitle") },
				h(Card, null,
					h("div", { className: "dsa-spread" },
						h("span", { className: "dsa-desc" },
							t("phoneCurrent").replace("%s", app)
								.replace("%s", String(props.terminal ?? "?"))
								.replace("%s", current || "-")),
						h("div", { className: "dsa-actions" },
							h(Button, {
								variant: "outline", size: "sm",
								disabled: state === "checking",
								onClick: check
							}, state === "checking" ? t("updChecking") : t("updCheck")),
							// The other way in: a package someone handed over, applied
							// on purpose. The app itself never scans for one.
							h(Button, {
								variant: "ghost", size: "sm",
								onClick: () => call("/hot/pick", {})
							}, t("hotPick")))),
					props.hotMessage ? h("p", { className: "dsa-hint" }, props.hotMessage) : null,
					state === "done" && !hotNew && !appNew
						? h("p", { className: "dsa-hint" }, t("updLatest").replace("%s", app))
						: null,
					state === "failed"
						? h("p", { className: "dsa-hint" }, t("updFailed").replace("%s", message))
						: null,
					hotNew
						? h("div", null,
							h("hr", { className: "dsa-sep" }),
							h("div", { className: "dsa-field" },
								h("span", { className: "dsa-strong" },
									t("updHotTitle").replace("%s", String(info.hot.version))),
								h("p", { className: "dsa-hint" },
									t("updHotHint").replace("%s", String(Math.round((info.hot.bytes ?? 54000) / 1024)))),
								h("div", { className: "dsa-actions" },
									h(Button, {
										variant: "primary",
										onClick: async () => {
											setMessage(t("busy"));
											try {
												const result = await call("/hot/fetch", { url: info.hot.url }, { timeoutMs: 120000 });
												setMessage(result.message ?? result.error ?? "");
											} catch (error) {
												setMessage(String(error.message ?? error));
											}
										}
									}, t("updHotApply")))))
						: null,
					props.terminalReady === false
						? h("div", null,
							h("hr", { className: "dsa-sep" }),
							h("div", { className: "dsa-field" },
								h("span", { className: "dsa-strong" }, t("termMissing")),
								h("p", { className: "dsa-hint" },
									t("termMissingHint").replace("%s", String(props.terminalMegabytes ?? "190"))),
								props.terminalProgress
									? h("p", { className: "dsa-hint" }, props.terminalProgress)
									: null,
								h("div", { className: "dsa-actions" },
									h(Button, {
										variant: "primary",
										disabled: props.terminalBusy === true,
										onClick: () => call("/terminal/fetch", {
											// These come from the update manifest, which is empty on a
											// machine that never checked for updates — exactly the
											// "I installed the slim shell and cannot find the runtime"
											// case this card exists for. Fall back to the release
											// asset so the button always has somewhere to go.
											// NOTE: `latest` currently resolves to the t2 release and
											// payload.zip is published there, so this URL is right
											// today; if a newer terminal release appears, repoint the
											// fallback (the manifest path above stays correct).
											url: (info !== null && info.terminal !== undefined && info.terminal.url)
												|| "https://github.com/itiswdwa/dsh-android/releases/latest/download/payload.zip",
											manifest: (info !== null && info.terminal !== undefined && info.terminal.manifest)
												|| "https://github.com/itiswdwa/dsh-android/releases/latest/download/payload.manifest"
										})
									}, t("termDownload")))))
						: null,
					terminalNew
						? h("div", null,
							h("hr", { className: "dsa-sep" }),
							h("div", { className: "dsa-field" },
								h("span", { className: "dsa-strong" },
									t("phoneTerminal").replace("%s", String(info.terminal.version))),
								h("div", { className: "dsa-actions" },
									h(Button, {
										variant: "outline",
										onClick: () => call("/open-url", { url: info.app.page ?? info.app.url })
									}, t("updAppDownload")))))
						: null,
					appNew
						? h("div", null,
							h("hr", { className: "dsa-sep" }),
							h("div", { className: "dsa-field" },
								h("span", { className: "dsa-strong" }, t("updAppTitle").replace("%s", info.app.version)),
								h("p", { className: "dsa-hint" }, t("updAppHint").replace("%s", "143")),
								h("div", { className: "dsa-actions" },
									h(Button, {
										variant: "outline",
										onClick: () => call("/open-url", { url: info.app.page ?? info.app.url })
									}, t("updAppDownload")))))
						: null,
					message !== "" ? h("p", { className: "dsa-hint" }, message) : null),
				h("p", { className: "dsa-hint" }, t("hotHint")));
		}

		function ShizukuCard(props) {
			const t = props.t;
			const [output, setOutput] = react.useState("");
			const [command, setCommand] = react.useState("id");
			const shizuku = props.shizuku ?? {};
			const state = shizuku.installed !== true ? t("unavailable")
				: shizuku.granted === true ? t("granted") : t("denied");
			const dot = shizuku.granted === true ? "done" : "warning";
			return h(Group, { title: t("shizuku") },
				h(Card, null,
					h("div", { className: "dsa-spread" },
						h("div", { className: "dsa-inline" },
							shizuku.installed === true ? h(StateDot, { state: dot }) : null,
							h("span", { className: "dsa-strong" }, state),
							shizuku.version !== undefined
								? h("span", { className: "dsa-hint" }, "Shizuku " + String(shizuku.version))
								: null),
						shizuku.installed === true && shizuku.granted !== true
							? h(Button, { variant: "primary", onClick: () => props.act("/shizuku/request") }, t("request"))
							: null),
					h("hr", { className: "dsa-sep" }),
					h("div", { className: "dsa-field" },
						h("label", { className: "dsa-fieldLabel" }, t("testCommand")),
						h("div", { className: "dsa-inputRow" },
							h(TextInput, {
								grow: true,
								value: command,
								onChange: (event) => setCommand(event.target.value)
							}),
							h(Button, {
								variant: "outline",
								disabled: shizuku.granted !== true,
								onClick: async () => {
									try {
										const result = await call("/shizuku/exec", { command }, { timeoutMs: 30000 });
										setOutput("exit " + result.exit + "\n" + (result.stdout ?? "") + (result.stderr ?? ""));
									} catch (error) {
										setOutput(String(error.message ?? error));
									}
								}
							}, t("run")))),
					output !== "" ? h("pre", { className: "dsa-pre" }, output) : null));
		}

		function SettingsCard(props) {
			const t = props.t;
			const [form, setForm] = react.useState(null);
			react.useEffect(() => {
				if (props.settings !== undefined) setForm(Object.assign({}, props.settings));
			}, [props.settings]);
			if (form === null) return null;
			const update = (key, value) => setForm(Object.assign({}, form, { [key]: value }));
			return h(Group, { title: t("settings") },
				h(Card, null,
					h(Field, {
						id: "dsa-port",
						label: t("port"),
						hint: t("portHint"),
						control: h(TextInput, {
							id: "dsa-port",
							inputMode: "numeric",
							value: String(form.port ?? ""),
							onChange: (event) => update("port", event.target.value)
						})
					}),
					h(Field, {
						id: "dsa-api-key",
						label: t("apiKey"),
						hint: t("apiKeyHint"),
						control: h(TextInput, {
							id: "dsa-api-key",
							type: "password",
							placeholder: "sk-…",
							value: form.apiKey ?? "",
							onChange: (event) => update("apiKey", event.target.value)
						})
					}),
					h(ToggleRow, {
						title: t("share"),
						checked: form.shareStorage === true,
						onChange: (value) => update("shareStorage", value)
					}),
					h(ChoiceRow, {
						title: t("chrome"),
						desc: t("chromeHint"),
						value: form.chromeMode ?? "auto",
						options: [
							{ value: "auto", label: t("chromeAuto") },
							{ value: "acrylic", label: t("chromeAcrylic") },
							{ value: "solid", label: t("chromeSolid") }
						],
						onChange: (value) => update("chromeMode", value)
					}),
					h(ToggleRow, {
						title: t("keepAwake"),
						checked: form.keepAwake === true,
						onChange: (value) => update("keepAwake", value)
					}),
					h(ToggleRow, {
						title: t("autoRestart"),
						checked: form.autoRestart === true,
						onChange: (value) => update("autoRestart", value)
					}),
					h("div", { className: "dsa-foot" },
						h(Button, {
							variant: "primary",
							onClick: async () => {
								const port = parseInt(String(form.port), 10);
								await call("/settings", {
									port: Number.isFinite(port) ? port : 3080,
									apiKey: form.apiKey ?? "",
									shareStorage: form.shareStorage === true,
									keepAwake: form.keepAwake === true,
									autoRestart: form.autoRestart === true,
									chromeMode: form.chromeMode ?? "auto"
								});
								if (props.onSaved) await props.onSaved();
							}
						}, t("save")))));
		}


		/**
		 * The phone-assistant grants, in the order they are needed.
		 *
		 * None of the three can be granted by the app itself — two are system
		 * settings pages and one is a runtime permission — so each row says what
		 * it buys and hands the user to the right screen. The screen-control
		 * channel the agent actually calls is `ui` (see the phone-control skill).
		 */
		/**
		 * The floating ball's marks, as shipped by the hot package.
		 *
		 * These live in the payload at opt/dsh/android/ball/<file>.png and reach
		 * the ball through /ball/config: BallService reads the file out of the
		 * app's own storage with BitmapFactory, which is why a new mark is a hot
		 * package away and not a shell release. (PNG, not vector XML: a file-based
		 * vector cannot be parsed — VectorDrawable.createFromXml needs an
		 * aapt-compiled parser and throws ClassCastException on anything else, and
		 * BallService falls back to the built-in whale without saying so.)
		 * What makes the file addressable from the page is /snapshot: each distro
		 * carries its host path (distros[].path), and the ball needs a host path,
		 * not a guest one.
		 *
		 * The path data below mirrors those XML files so the page can draw the
		 * same shape — a page cannot read the guest filesystem, so it is a copy.
		 * Keep both sides in step; the built-in mark is extracted from
		 * app/res/drawable/ic_whale_monochrome.xml at authoring time for the same
		 * reason.
		 */
		const BALL_PRESETS = [
			{
				id: "deep",
				file: "whale-deep.png",
				label: "phoneBallPresetDeep",
				paths: [
					{ d: "M5.6,27.2 C5.6,20.2 12.4,15.4 21.6,15.4 C30.8,15.4 37.6,20.2 37.6,27.2 C37.6,33.4 30.8,37.6 21.6,37.6 C12.4,37.6 5.6,33.4 5.6,27.2 Z M14.4,23.4 m-2.1,0 a2.1,2.1 0 1,0 4.2,0 a2.1,2.1 0 1,0 -4.2,0 Z", fill: "#FFFFFF", fillRule: "evenodd" },
					{ d: "M8.8,30.6 C13.4,34.8 20.6,35.8 26.8,33.6 C23,36.8 13.8,36.2 8.8,30.6 Z", fill: "#FFFFFF", opacity: 0.45 },
					{ d: "M36,21.2 L45.4,13.6 C43.8,19.2 43.8,24.8 45.4,30.6 L36,25.8 Z", fill: "#FFFFFF" },
					{ d: "M13.2,9.8 m-1.9,0 a1.9,1.9 0 1,0 3.8,0 a1.9,1.9 0 1,0 -3.8,0 Z", fill: "#FFFFFF", opacity: 0.9 },
					{ d: "M19.6,6.4 m-1.4,0 a1.4,1.4 0 1,0 2.8,0 a1.4,1.4 0 1,0 -2.8,0 Z", fill: "#FFFFFF", opacity: 0.65 }
				]
			},
			{
				id: "line",
				file: "whale-line.png",
				label: "phoneBallPresetLine",
				paths: [
					{ d: "M5.8,27 C5.8,20.4 12.6,15.6 21.6,15.6 C30.6,15.6 37.4,20.4 37.4,27 C37.4,33.2 30.6,37.4 21.6,37.4 C12.6,37.4 5.8,33.2 5.8,27 Z", stroke: "#FFFFFF", strokeWidth: 2.4 },
					{ d: "M35.6,21.6 L44.8,14.2 C43.2,19.4 43.2,24.6 44.8,30.2 L35.6,25.6", stroke: "#FFFFFF", strokeWidth: 2.4 },
					{ d: "M14.4,23.6 m-1.7,0 a1.7,1.7 0 1,0 3.4,0 a1.7,1.7 0 1,0 -3.4,0 Z", fill: "#FFFFFF" },
					{ d: "M12.6,11.2 C12.2,8.8 14,7.2 16.4,7.6 C18.4,8 19.6,9.6 19.4,11.4", stroke: "#FFFFFF", strokeWidth: 2.2, strokeOpacity: 0.75 }
				]
			},
			{
				id: "spark",
				file: "spark.png",
				label: "phoneBallPresetSpark",
				paths: [
					{ d: "M22.4,5.2 C24.4,15.2 26.8,18.2 35.6,20.4 C26.8,22.6 24.4,25.6 22.4,35.6 C20.4,25.6 18,22.6 9.2,20.4 C18,18.2 20.4,15.2 22.4,5.2 Z", fill: "#FFFFFF" },
					{ d: "M34.6,31.4 C35.5,35.8 36.5,37.1 40.2,38 C36.5,38.9 35.5,40.2 34.6,44.6 C33.7,40.2 32.7,38.9 29,38 C32.7,37.1 33.7,35.8 34.6,31.4 Z", fill: "#FFFFFF", opacity: 0.7 }
				]
			},
			{
				// The app's own drawable: chosen by clearing the pref, never by a path.
				id: "builtin",
				file: "",
				label: "phoneBallPresetBuiltin",
				builtin: true,
				paths: [
					{ d: "M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z", fill: "#FFFFFF", group: "translate(25.92,25.92) scale(1.1232)" }
				]
			}
		];

		/** One mark, drawn at whatever size the caller asks for. */
		function BallMark(props) {
			const size = props.size;
			const paths = (props.paths ?? []).map((path, index) => h("path", {
				key: index,
				d: path.d,
				fill: path.fill ?? "none",
				fillRule: path.fillRule,
				fillOpacity: path.opacity,
				stroke: path.stroke,
				strokeWidth: path.strokeWidth,
				strokeOpacity: path.strokeOpacity,
				strokeLinecap: path.stroke === undefined ? undefined : "round",
				strokeLinejoin: path.stroke === undefined ? undefined : "round"
			}));
			const grouped = (props.paths ?? []).some((path) => path.group !== undefined);
			return h("svg", {
				width: size,
				height: size,
				viewBox: "0 0 48 48",
				"aria-hidden": "true",
				focusable: "false"
			}, grouped
				? (props.paths ?? []).map((path, index) => path.group === undefined
					? paths[index]
					: h("g", { key: index, transform: path.group }, paths[index]))
				: paths);
		}

		function PhoneCard(props) {
			const t = props.t;
			const [state, setState] = react.useState(null);
			const [ballSize, setBallSize] = react.useState("");
			react.useEffect(() => {
				if (bridge() === null) return undefined;
				let cancelled = false;
				// The appearance lives in the snapshot; the grants come from the
				// accessibility status. Two calls, one card.
				Promise.all([call("/a11y/status"), call("/snapshot")])
					.then(([access, snapshot]) => {
						if (cancelled) return;
						const ball = (snapshot && snapshot.ball) || {};
						// A ball picture is a path in the *app's* filesystem, not
						// the guest's: the presets ship inside the rootfs, so the
						// page needs that rootfs' host path to point the ball at
						// one. /snapshot carries it per distro.
						const distros = Array.isArray(snapshot && snapshot.distros) ? snapshot.distros : [];
						const active = distros.find((item) => item && item.active === true) || distros[0] || null;
						setState(Object.assign({}, access, {
							size: ball.size,
							image: ball.image || "",
							distroPath: active !== null && typeof active.path === "string" ? active.path : ""
						}));
						setBallSize(String(ball.size === undefined ? 58 : ball.size));
					})
					.catch(() => { if (!cancelled) setState({}); });
				return () => { cancelled = true; };
			}, [props.tick]);

			// Each appearance change restarts the overlay (BallService.reload), so a
			// dragged slider must not post once per pixel: debounce, and commit on
			// release.
			const sizeTimer = react.useRef(null);
			react.useEffect(() => () => {
				if (sizeTimer.current !== null) clearTimeout(sizeTimer.current);
			}, []);
			const applySize = (value, immediate) => {
				const size = Math.max(40, Math.min(120, parseInt(String(value), 10) || 58));
				setBallSize(String(size));
				if (sizeTimer.current !== null) {
					clearTimeout(sizeTimer.current);
					sizeTimer.current = null;
				}
				if (immediate) {
					ask("/ball/config", { size });
					return;
				}
				sizeTimer.current = setTimeout(() => {
					sizeTimer.current = null;
					ask("/ball/config", { size });
				}, 450);
			};

			const ask = async (path, body) => {
				try {
					await call(path, body);
					if (props.onChanged) await props.onChanged();
				} catch (error) {
					/* the page (or the toast) is the answer */
				}
			};

			const grantRow = (label, ok, path) => h("div", { className: "dsa-toggle" },
				h("div", { className: "dsa-copy" },
					h("span", { className: "dsa-title" }, label),
					h("span", { className: "dsa-hint" }, ok ? t("phoneAllowed") : t("phoneDenied"))),
				ok
					? h(Tag, { tone: "success" }, t("phoneAllowed"))
					: h(Button, { variant: "outline", size: "sm", onClick: () => ask(path, {}) }, t("phoneGrant")));

			if (state === null) return h(Group, { title: t("phoneTitle") }, h(Card, null, h("p", { className: "dsa-hint" }, t("busy"))));

			const ball = state.ball === true;
			const image = state.image || "";
			const distroPath = state.distroPath || "";
			// <rootfs host path>/opt/dsh/android/ball/<file>.xml — where the hot package
			// drops the presets (payload/opt/dsh/android/ball/). The ball needs a host
			// path, so this is built from /snapshot's distros[].path.
			const presetPath = (preset) => (distroPath === "" ? "" : distroPath + "/opt/dsh/android/ball/" + preset.file);
			const ballDp = Math.max(40, Math.min(120, parseInt(String(ballSize), 10) || 58));
			const selected = BALL_PRESETS.find((preset) => preset.builtin
				? image === ""
				: image !== "" && image === presetPath(preset)) ?? null;
			const custom = image !== "" && selected === null;
			// 1 CSS px is about 1 dp in this WebView, so the stage shows the real size;
			// it is clamped only so a 120 dp ball still fits the card.
			const previewPx = Math.min(128, ballDp);
			const markPx = Math.max(14, Math.round(previewPx * 2 / 3));
			const sizeChip = (label, dp) => h("button", {
				key: dp,
				type: "button",
				className: "dsa-ballChip",
				"aria-pressed": ballDp === dp,
				onClick: () => applySize(dp, true)
			}, label + " " + dp);
			return h("div", null,
				h(Group, { title: t("phoneTitle") },
					h(Card, null,
						grantRow(t("phoneScreen"), state.service === true, "/a11y/request"),
						grantRow(t("phoneOverlay"), state.overlay === true, "/overlay/request"),
						grantRow(t("phoneMic"), state.microphone === true, "/mic/request")),
					h("p", { className: "dsa-hint" }, t("phoneHint"))),

				h(Group, { title: t("phoneBall") },
					h(Card, null,
						h("div", { className: "dsa-spread" },
							h("div", { className: "dsa-copy" },
								h("span", { className: "dsa-title" }, ball ? t("phoneBallOn") : t("phoneBallOff")),
								h("span", { className: "dsa-hint" }, t("phoneBallHint"))),
							h(Button, {
								variant: ball ? "outline" : "primary",
								size: "sm",
								onClick: () => ask(ball ? "/ball/stop" : "/ball/start", {})
							}, ball ? t("phoneDisable") : t("phoneEnable")))),

					h(Card, null,
						h("div", { className: "dsa-ballRow" },
							h("div", { className: "dsa-ballStage" },
								h("div", { className: "dsa-ballHalo" }),
								h("div", {
									className: "dsa-ball",
									style: { width: previewPx + "px", height: previewPx + "px" }
								}, selected === null ? null : h(BallMark, { size: markPx, paths: selected.paths }))),
							h("div", { className: "dsa-ballSide" },
								h("div", { className: "dsa-field" },
									h("label", { className: "dsa-fieldLabel" }, t("phoneBallSize") + " · " + ballDp + " dp"),
									h("input", {
										type: "range",
										className: "dsa-range",
										min: 40, max: 120, step: 1,
										value: ballDp,
										"aria-label": t("phoneBallSize"),
										onChange: (event) => applySize(event.target.value, false),
										onPointerUp: (event) => applySize(event.target.value, true),
										onTouchEnd: (event) => applySize(event.target.value, true),
										onKeyUp: (event) => applySize(event.target.value, true),
										onBlur: (event) => applySize(event.target.value, true)
									}),
									h("div", { className: "dsa-ballChips" },
										sizeChip(t("phoneBallSizeSmall"), 46),
										sizeChip(t("phoneBallSizeMedium"), 58),
										sizeChip(t("phoneBallSizeLarge"), 76),
										sizeChip(t("phoneBallSizeHuge"), 96)),
									h("p", { className: "dsa-hint" }, t("phoneBallSizeHint"))),
								h("div", { className: "dsa-field" },
									h("label", { className: "dsa-fieldLabel" }, t("phoneBallImage")),
									h("div", { className: "dsa-presets" }, BALL_PRESETS.map((preset) => h("button", {
										key: preset.id,
										type: "button",
										className: "dsa-preset",
										"aria-pressed": selected !== null && selected.id === preset.id,
										disabled: preset.builtin !== true && distroPath === "",
										onClick: () => ask("/ball/config", { image: preset.builtin ? "" : presetPath(preset) })
									},
										h("span", { className: "dsa-presetMark", "data-builtin": preset.builtin === true },
											h(BallMark, { size: 18, paths: preset.paths })),
										t(preset.label)))),
									custom ? h("p", { className: "dsa-hint dsa-mono" }, t("phoneBallCustom") + image) : null,
									distroPath === "" ? h("p", { className: "dsa-hint" }, t("phoneBallPresetMissing")) : null,
									h("div", { className: "dsa-actions" },
										h(Button, {
										variant: "outline", size: "sm",
										onClick: () => ask("/ball/pick-image", {})
										}, t("phoneBallPick"))),
									h("p", { className: "dsa-hint" }, t("phoneBallImageHint")))))),
					h("p", { className: "dsa-hint" }, t("phoneBallLookHint"))));
		}

		/* ==== @ball-inbox:begin — the ball's own thread: queue drain, identity, recovery. Tested by test/ball-inbox.test.mjs ==== */

		/**
		 * The `ball_doing` out of whatever reached this half.
		 *
		 * The protocol field is `ball_doing` (see the prompt section in index.js and
		 * the `ball` command in the sandbox). A model may hand over a JSON object —
		 * with or without a fenced block, and with other fields next to it — or just
		 * the line itself; both are accepted, and the line is the fallback so a
		 * plain report keeps working. An empty `ball_doing` means "nothing running".
		 */
		function ballDoing(raw) {
			const text = String(raw ?? "").trim();
			if (text === "") return "";
			const start = text.indexOf("{");
			const end = text.lastIndexOf("}");
			if (start >= 0 && end > start) {
				try {
					const parsed = JSON.parse(text.slice(start, end + 1));
					if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
						const value = parsed.ball_doing ?? parsed.doing;
						if (typeof value === "string") return value.trim();
					}
				} catch {
					/* not JSON: a literal newline inside a string is the usual
					   reason, and the field can still be picked out by hand */
				}
				const field = /"ball_doing"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
				if (field) return field[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
				return text;
			}
			return text;
		}

		/**
		 * The floating ball's own conversation.
		 *
		 * Words spoken or typed into the ball are queued by the app (POST
		 * /ball/inbox) and drained here, into a dedicated session: the ball gets a
		 * thread of its own instead of dropping a sentence into whatever
		 * conversation happened to be open. That thread runs with the same prompt
		 * section, so it reports each step with `ball` and the bubble shows *its*
		 * work — which is the "dedicated conversation" the ball was asked for.
		 *
		 * It goes through the same remote the UI uses (session.create / prompt /
		 * rename), so this half is a hot package: the app only holds the words.
		 */
		function installBallInbox(ctx) {
			const STORAGE_KEY = "dsh.android.ballSession";
			const TITLE = "悬浮球";
			// The id prefix is the host half's marker: `app:ball-surface` in
			// lib/index.js checks it, alongside the pinned title, to know which
			// session must lose the GUI question tools and run unapproached. A
			// fresh ball thread is minted with it below.
			const ID_PREFIX = "session-ball-";
			/** One short wait, for the turn after a delivery to land in the log. */
			const pause = (ms) => new Promise((resolve) => { globalThis.setTimeout(resolve, ms); });
			const read = () => {
				try {
					return globalThis.localStorage.getItem(STORAGE_KEY) ?? "";
				} catch (error) {
					return "";
				}
			};
			const remember = (id) => {
				try {
					globalThis.localStorage.setItem(STORAGE_KEY, id);
				} catch (error) {
					/* private mode: the session is simply created again next time */
				}
			};
			const forget = () => {
				try {
					globalThis.localStorage.removeItem(STORAGE_KEY);
				} catch (error) {
					/* ignore */
				}
			};
			const accepted = (result) => result !== null && result !== undefined && result.ok === true;
			const payload = (result) => (result && result.value) || {};

			let sessionId = read();
			let busy = false;
			let lastReport = "";
			// Failures go through the status channel, not a swallowed promise: the
			// first version drained nothing for ten minutes because the remote call
			// threw into an empty catch. /ball/state also leaves the text readable
			// (`GET /ball/state`) long after the bubble has faded.
			//
			// The field the ball shows is `ball_doing` (see `ball` in the sandbox and
			// the prompt section in index.js). `text` is sent alongside it for older
			// shells, and the value is parsed out of a JSON body when the caller
			// hands one over.
			const report = (text) => {
				if (text === lastReport) return;
				lastReport = text;
				const doing = ballDoing(text).slice(0, 120);
				call("/ball/state", { phase: "done", text: doing, ball_doing: doing }).catch(() => {});
			};
			const describe = (error) => {
				if (error === null || error === undefined) return "unknown";
				if (typeof error === "string") return error;
				return error.message ? error.message : String(error);
			};
			/** The session namespace, reached whichever way this cordis exposes it. */
			const sessionApi = () => {
				const aggregate = ctx.remote;
				if (aggregate !== null && aggregate !== undefined && aggregate.session !== undefined) {
					return aggregate.session;
				}
				if (typeof ctx.get === "function") {
					const direct = ctx.get("remote.session");
					if (direct !== undefined && direct !== null) return direct;
				}
				return null;
			};

			/**
			 * The directory the ball's conversation should own.
			 *
			 * `create({})` leaves `cwd` at the harness process's own directory —
			 * on this phone `/opt/dsh`, the installation, which the surface
			 * prompt tells the model to treat as read-only. So a task dispatched
			 * from the ball used to start in the wrong place. The newest
			 * top-level conversation is the best answer available to "where is
			 * the user working"; the ball's own threads are skipped so the ball
			 * cannot inherit the same wrong directory from itself. Anything
			 * unexpected (no service, no list, no other session) leaves the field
			 * off, which is exactly the behaviour that shipped before.
			 */
			const ballCwd = async () => {
				try {
					const api = sessionApi();
					if (api === null || typeof api.list !== "function") return "";
					const answer = await api.list({});
					if (!accepted(answer)) return "";
					const items = payload(answer).items;
					if (!Array.isArray(items)) return "";
					const others = items
						.filter((item) => item !== null && typeof item === "object"
							&& typeof item.cwd === "string" && item.cwd !== ""
							&& item.origin !== "subagent" && item.parentSessionId === undefined
							&& (item.projections && item.projections.values
								? item.projections.values.title !== TITLE
								: true))
						.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
					return others.length > 0 ? others[0].cwd : "";
				} catch (error) {
					return "";
				}
			};

			/** A fresh id for the ball's own thread: the prefix is the host's mark. */
			const freshBallId = () => {
				const suffix = (globalThis.crypto && globalThis.crypto.randomUUID)
					? globalThis.crypto.randomUUID()
					: Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
				return ID_PREFIX + suffix;
			};

			const open = async () => {
				const api = sessionApi();
				if (api === null) {
					report("悬浮球会话：拿不到 remote.session 服务");
					return "";
				}
				const cwd = await ballCwd();
				// A caller-minted id is what makes the host's `session-ball-`
				// marker work; an older controller may refuse it, and a refused
				// create must not cost the ball its conversation, so fall back to
				// a default id (the pinned title still marks the thread there).
				const request = { sessionId: freshBallId(), ...(cwd === "" ? {} : { cwd }) };
				let created = await api.create(request);
				if (!accepted(created)) {
					report("悬浮球会话：带标记 id 的 create 被拒，改用默认 id");
					created = await api.create(cwd === "" ? {} : { cwd });
				}
				if (!accepted(created)) {
					report("悬浮球会话：create 被拒 —— 看控制台");
					return "";
				}
				const id = payload(created).sessionId ?? "";
				if (id === "") {
					report("悬浮球会话：create 没给出 id");
					return "";
				}
				remember(id);
				// Name it, so the sidebar says where the ball's words went. Cosmetic:
				// an older controller may spell rename differently.
				try {
					const api = sessionApi();
					if (api !== null && typeof api.rename === "function") {
						await api.rename({ sessionId: id, title: TITLE });
					}
				} catch (error) {
					/* keep going */
				}
				return id;
			};

			let lastError = "";
			/**
			 * Whether the ball's thread has stopped being usable.
			 *
			 * A session the user deleted from the sidebar is *archived*: the
			 * controller still accepts the prompt, then refuses the turn at its
			 * first step (`underArchivedSession` rejects in `agent/pre-step`), so
			 * the ball would sit silent forever while its words pile up in a
			 * thread nobody reads. The refusal is in the session's own log, so
			 * the last turn is read back: a `blocked` end means this thread is
			 * finished and the ball needs a new one.
			 *
			 * Unknown shapes are "not blocked": a thread is only abandoned on
			 * positive evidence.
			 */
			const threadBlocked = async (id) => {
				try {
					const api = sessionApi();
					if (api === null || typeof api.page !== "function" || typeof api.list !== "function") return false;
					const listed = await api.list({});
					if (!accepted(listed)) return false;
					const items = payload(listed).items;
					if (!Array.isArray(items)) return false;
					const mine = items.find((item) => item !== null && typeof item === "object" && item.sessionId === id);
					const throughSeq = mine && mine.projections ? mine.projections.asOfSeq : undefined;
					if (typeof throughSeq !== "number") return false;
					const page = await api.page({
						address: { kind: "session", sessionId: id },
						throughSeq,
						maxMessages: 8
					});
					if (!accepted(page)) return false;
					const records = payload(page).records;
					if (!Array.isArray(records)) return false;
					const events = records.map((record) => record && record.event).filter(Boolean);
					for (let index = events.length - 1; index >= 0; index -= 1) {
						if (events[index].type !== "turn/end") continue;
						const reason = events[index].data ? events[index].data.reason : undefined;
						return reason !== null && typeof reason === "object" && reason.kind === "blocked";
					}
					return false;
				} catch (error) {
					return false;
				}
			};
			const send = async (id, text) => {
				// The UI calls prompt(content, "queue"): same shape here, so the host
				// sees exactly what the composer would have sent.
				const result = await sessionApi().prompt({
					requestId: (globalThis.crypto && globalThis.crypto.randomUUID)
						? globalThis.crypto.randomUUID()
						: "ball-" + Date.now(),
					sessionId: id,
					mode: "queue",
					content: [{ type: "text", text }]
				});
				if (!accepted(result)) {
					const error = (result && result.error) || {};
					lastError = (error.code ? error.code + ": " : "") + (error.message ?? "no detail");
				}
				return accepted(result);
			};

			const drain = async () => {
				if (busy) return;
				busy = true;
				try {
					const answer = await call("/ball/inbox");
					const items = (answer && answer.items) || [];
					if (items.length === 0) return;
					if (sessionId === "") sessionId = await open();
					if (sessionId === "") return;      // no remote yet: leave them queued
					for (const item of items) {
						let sent = await send(sessionId, item.text);
						if (!sent) {
							// Deleted from the UI, most likely: make a fresh session.
							forget();
							sessionId = await open();
							if (sessionId === "") return;
							sent = await send(sessionId, item.text);
						}
						if (!sent) {
							// The code and message come from the host: this is what the
							// first three attempts could not tell us.
							report("悬浮球会话被拒 " + (lastError || "（无细节）"));
							return;                    // try again on the next tick
						}
						// An accepted prompt is not a running turn: a session the user
						// deleted still takes the words and then refuses the step. Give
						// the turn a moment to land, then look — and if this thread is
						// finished, move the same words to a fresh one instead of
						// leaving them in a thread nobody reads.
						await pause(700);
						if (await threadBlocked(sessionId)) {
							report("悬浮球会话已失效，换一条新的");
							forget();
							const restarted = await open();
							if (restarted === "") return;
							if (await send(restarted, item.text)) sessionId = restarted;
							else {
								report("悬浮球会话：新会话没接住这句话");
								return;                // the app keeps the item queued
							}
						}
						await call("/ball/inbox/ack", { ids: [item.id] });
					}
				} catch (error) {
					// The app keeps the queue; the bubble says why nothing moved.
					report("悬浮球会话：" + describe(error));
				} finally {
					busy = false;
				}
			};

			const interval = setInterval(drain, 1200);
			drain();
			return { disconnect: () => clearInterval(interval) };
		}

		/* ==== @ball-inbox:end ==== */

		/**
		 * Where the floating ball's words end up.
		 *
		 * The app (Java) owns the overlay and the microphone; it hands the text
		 * over by calling this on the page, which keeps the harness side
		 * hot-updatable and out of the app's hands. The composer is driven
		 * through the DOM rather than a private client API — the harness has no
		 * supported "send this for me" entry point, and a native setter plus an
		 * input event is what React needs to accept a programmatic value.
		 *
		 * Returns a short status string, which the app only logs.
		 */
		function installPromptHook() {
			/**
			 * Put text in the composer and send it.
			 *
			 * The composer is not a textarea: it is the harness's own rich editor
			 * (`div[role=textbox][contenteditable]`), and it is controlled — writing
			 * textContent, dispatching `input`, or execCommand all leave it
			 * unchanged, because the editor never reads the DOM back. What it does
			 * handle is a paste, so that is what this sends: a synthetic
			 * ClipboardEvent carrying the text. The send button then enables on the
			 * editor's own state update, which is why the click waits a tick.
			 *
			 * Returns a short status the app turns into a bubble.
			 */
			window.__dshAndroidPrompt = function (text) {
				const value = String(text ?? "").trim();
				if (value === "") return "empty";
				const box = composer();
				if (box === null) {
					try {
						navigator.clipboard.writeText(value);
						return "clipboard";
					} catch (error) {
						return "no-composer";
					}
				}
				box.focus();
				let inserted = false;
				try {
					const data = new DataTransfer();
					data.setData("text/plain", value);
					box.dispatchEvent(new ClipboardEvent("paste", {
						clipboardData: data, bubbles: true, cancelable: true
					}));
					inserted = true;
				} catch (error) {
					inserted = false;
				}
				if (!inserted) {
					try {
						document.execCommand("insertText", false, value);
						inserted = true;
					} catch (error) {
						inserted = false;
					}
				}
				if (!inserted) {
					try {
						navigator.clipboard.writeText(value);
					} catch (error) {
						/* nothing left to try */
					}
					return "clipboard";
				}
				// The editor enables the button on its own state update, so the
				// click retries briefly. The status is returned synchronously —
				// `evaluateJavascript` can only read a value, not a promise — and
				// the app turns it into a bubble above the ball.
				let tries = 0;
				const attempt = () => {
					const send = sendButton();
					if (send !== null && send.disabled !== true) {
						send.click();
						return;
					}
					if (tries++ < 12) setTimeout(attempt, 60);
				};
				setTimeout(attempt, 60);
				return "pasted";
			};

			function composer() {
				const box = document.querySelector('[role="textbox"][contenteditable="true"]')
					|| document.querySelector('[role="textbox"]')
					|| document.querySelector("textarea");
				return box === null ? null : box;
			}

			function sendButton() {
				const buttons = Array.prototype.slice.call(document.querySelectorAll("button"));
				return buttons.find((button) => /发送|Send/i.test(button.getAttribute("aria-label") ?? "")) ?? null;
			}
		}

		/**
		 * Tell the floating ball what the session is doing.
		 *
		 * The page is the only place that knows which tool is running, and the ball is
		 * the only surface the user sees while they are in another app, so the two are
		 * wired together here. This revision makes the bubble *move*: a call that takes
		 * ten seconds used to be one static line, which looks exactly like a wedged one.
		 * A spinner frame now advances while the work is in flight, and the line settles
		 * without it when the work ends.
		 *
		 * It also knows when to shut up: frames go out only while the harness tab is
		 * visible, and only once the bridge has answered that a ball is really on screen
		 * (`/ball/say` answers shown). A backgrounded page or a switched-off ball costs
		 * nothing.
		 *
		 * The source is still rows appearing in the conversation. Reading the harness's
		 * own session state would mean injecting its `sessions` service, and a plugin
		 * that fails to inject takes the whole settings page down with it (FINDINGS §4).
		 * Watching text is also class-name agnostic — the shell's CSS modules are hashed —
		 * and the filter drops the handful of rows that are not progress (the composer,
		 * our own panels, buttons).
		 */
		function installBallStatus() {
			// The ball is fed by its own channel now: `ball` in the sandbox →
			// /ball/state → the native rotation and bubble. This fallback watched the
			// conversation for new rows instead, and that is why the bubble used to
			// twitch once per message and why the status was always a fragment —
			// rows arrive out of order and half the steps never produce one at all.
			//
			// Off by default, then. It stays here (and stays tested) for a shell that
			// has no status channel, or for anyone who wants the old behaviour:
			//   globalThis.__dshAndroidScrapeStatus = true
			if (globalThis.__dshAndroidScrapeStatus !== true) {
				return { disconnect: () => {} };
			}
			// Braille (⠋⠙⠹…) reads as a nicer spinner but depends on the device font;
			// quarter circles are in every Noto build and still read as motion at 12sp.
			const FRAMES = ["◐", "◓", "◑", "◒"];
			const FRAME_MS = 280;
			const IDLE_MS = 2500;
			const MAX = 34;
			const IGNORE = /^(发送|收起|停止|新建会话|设置|插件|终端)$/;
			let current = "";
			let lastSent = "";
			let sentFrame = false;
			let changedAt = 0;
			let shown = null;
			let frame = 0;

			// The native channel wins whenever it is active: `ball` inside the
			// sandbox (or the app itself) states what is happening in the agent's
			// own words, and two writers would only make the bubble flicker. Read
			// with a poll rather than injected — injecting the session service is
			// how a plugin takes the whole settings page down with it.
			let native = false;
			const readNative = async () => {
				try {
					const answer = await call("/ball/state");
					const state = (answer && answer.state) || {};
					native = state.running === true
						&& state.phase !== undefined && state.phase !== "idle"
						&& Number(state.age || 0) < 30000;
				} catch (error) {
					native = false;                  // older shell: no endpoint, fallback only
				}
				return native;
			};
			readNative();
			const nativeTimer = setInterval(readNative, 2000);

			const compose = (text, withFrame) => {
				const clean = String(text).trim().replace(/\s+/g, " ");
				const clipped = clean.length > MAX ? clean.slice(0, MAX) + "…" : clean;
				return withFrame ? FRAMES[frame % FRAMES.length] + " " + clipped : "✓ " + clipped;
			};

			const send = async (text) => {
				if (text === "" || text === lastSent) return;
				// One fresh read before speaking. The poll above can be two seconds
				// stale, and in that window a scraped row would land on top of the
				// status the agent set for itself.
				if (await readNative()) return;
				lastSent = text;
				call("/ball/say", { text })
					.then((answer) => { shown = answer !== null && answer.shown === true; })
					.catch(() => { shown = false; });
			};

			const timer = setInterval(() => {
				if (typeof document !== "undefined" && document.hidden) return;
				if (shown === false) return;              // no ball on screen: nothing to say
				if (native) return;                       // `ball` owns the bubble right now
				if (current === "") return;               // idle
				if (Date.now() - changedAt > IDLE_MS) {
					// Work finished: one last line without the spinner, then quiet. The
					// bubble's own timer fades it out after that.
					if (sentFrame) send(compose(current, false));
					current = "";
					return;
				}
				sentFrame = true;
				send(compose(current, true));
				frame += 1;
			}, FRAME_MS);

			const observer = new MutationObserver((records) => {
				if (native) return;                       // its lines are the agent's own
				for (const record of records) {
					for (const node of record.addedNodes) {
						if (node.nodeType !== 1) continue;
						if (node.closest !== undefined && node.closest("form, [role=textbox], [data-dsa]") !== null) continue;
						const rows = (node.innerText ?? "").split("\n").map((row) => row.trim()).filter(Boolean);
						if (rows.length === 0) continue;
						const next = rows[rows.length - 1];
						if (next.length < 2 || next.length > 48 || IGNORE.test(next)) continue;
						current = next;
						changedAt = Date.now();
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });

			// The caller treats the return value as an observer; keep that contract, and
			// stop the frame timer with it.
			return {
				disconnect: () => {
					observer.disconnect();
					clearInterval(timer);
					clearInterval(nativeTimer);
				}
			};
		}

		function AndroidSection(props) {
			const t = (key) => props.t(key);
			const [snapshot, setSnapshot] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [message, setMessage] = react.useState(null);
			const tick = usePolling(2000);

			react.useEffect(() => {
				let cancelled = false;
				if (bridge() === null) return undefined;
				call("/snapshot")
					.then((data) => {
						if (!cancelled) {
							setSnapshot(data);
							setError(null);
						}
					})
					.catch((e) => {
						if (!cancelled) setError(String(e.message ?? e));
					});
				return () => {
					cancelled = true;
				};
			}, [tick]);

			/** One page chrome for every state, so a slow bridge still looks like the shell. */
			const shell = (body) => h("div", { className: "dsa-root" },
				h("h2", { className: "dsa-heading" }, t("title")),
				h("p", { className: "dsa-intro" }, t("subtitle")),
				body);

			if (bridge() === null) return shell(h("p", { className: "dsa-hint" }, t("noBridge")));
			if (snapshot === null) return shell(h("p", { className: "dsa-hint" }, error === null ? t("busy") : error));

			const act = async (path) => {
				setMessage(t("busy"));
				try {
					const data = await call(path, {});
					setMessage(data.message ?? null);
					await reload();
				} catch (e) {
					setMessage(String(e.message ?? e));
				}
			};
			const reload = async () => {
				try {
					setSnapshot(await call("/snapshot"));
				} catch (e) {
					setError(String(e.message ?? e));
				}
			};

			/**
			 * Group headings, so one page reads as four short sections.
			 *
			 * This was a single ten-block column (too crowded), then four top-level
			 * settings entries (truncated titles, and the filtering behind them matched
			 * nothing because React prefixes `child.key` with ".$" - an empty page). One
			 * entry, four headings, everything always rendered: the harness owns the
			 * navigation, and nothing can fall through a filter.
			 */
			const GROUP = (key) => h("h3", { className: "dsa-group" }, t(key));

			/**
			 * Which of the three a section shows, and what each one contains.
			 *
			 * Split by *index* into the rendered children, never by inspecting
			 * `child.key`: React prefixes keys with ".$", so a key-based filter matches
			 * nothing and the page renders empty - which is exactly what shipped once.
			 * The indices are the order of the children below, with the two header lines
			 * (title, intro) always first.
			 */
			const part = props.part ?? "sandbox";
			const SECTIONS = {
				// runtime, distros, mounts, settings (with appearance), export, and the
				// system-level grants: Shizuku (a privileged channel) and the phone
				// assistant (accessibility). Neither belongs to the ball - the ball just
				// happens to be able to use them.
				sandbox: [0, 1, 3, 4, 7, 10, 6, 8, 9],
				// the ball and *its own* permission, so a ball that cannot start shows
				// the grant next to the control that failed
				ball: [0, 1, 12],
				// version line, update channel, diagnostics log
				version: [0, 1, 2, 5, 11]
			};

			const hotState = (snapshot.hotVersion ?? "") === "" ? t("hotBakedIn") : t("hotImported");
			const view = h("div", { className: "dsa-root" },
				h("h2", { key: "head", className: "dsa-heading" }, t("title")),
				h("p", { key: "intro", className: "dsa-intro" }, t("subtitle")),
				// Which build is this? Without it, an older plugin on a device is
				// indistinguishable from a feature that was never written.
				h("p", {
					key: "meta",
					className: "dsa-meta",
					// The whole version in one string: shell, sandbox runtime, hot
					// package. This is what a bug report quotes.
					"data-dsh-android-version": (snapshot.appVersion ?? "") + "-t" + (snapshot.terminalVersion ?? "?")
						+ "/" + String(snapshot.hotVersion || snapshot.packagedHotVersion || "")
				}, t("verLine")
					.replace("%s", String(snapshot.hotVersion || snapshot.packagedHotVersion || "-"))
					.replace("%s", hotState)),

				h(Group, { key: "status", title: t("status") },
					h(StatusCard, { status: snapshot.status, t, act, message })),

				h(Group, { key: "distros", title: t("distros") },
					h("ul", { className: "dsa-list" }, (snapshot.distros ?? []).map((distro) => h(DistroCard, {
						key: distro.id,
						distro,
						t,
						onSelect: async (id) => {
							await call("/distros/select", { id });
							await reload();
						},
						onDelete: async (id) => {
							await call("/distros/delete", { id }, { timeoutMs: 30000 });
							await reload();
						},
						onCommand: async (id, command) => {
							await call("/distros/command", { id, command });
							setMessage(t("saved"));
							await reload();
						}
					})))),

				h(UpdateCard, {
					key: "updates",
					t,
					app: snapshot.appVersion,
					terminal: snapshot.terminalVersion,
					versionCode: snapshot.appVersionCode,
					packaged: snapshot.packagedHotVersion,
					applied: snapshot.hotVersion,
					hotMessage: snapshot.hotMessage,
					terminalReady: snapshot.terminalReady,
					terminalBusy: snapshot.terminalBusy,
					terminalProgress: snapshot.terminalProgress
				}),

				h(ExportCard, { key: "export", t }),

				h(MountsCard, { key: "mounts", t, mounts: snapshot.mounts, onChanged: reload }),

				h(ShizukuCard, { key: "shizuku", shizuku: snapshot.shizuku, t, act }),

				h(PhoneCard, { key: "phone", t, tick, onChanged: reload }),

				h(SettingsCard, { key: "settings", settings: snapshot.settings, t, onSaved: reload }),

				h(Group, { key: "log", title: t("log") },
					h("div", { className: "dsa-actions" },
						h(Button, { variant: "outline", size: "sm", onClick: reload }, t("refresh")),
						h(Button, {
							variant: "ghost", size: "sm",
							onClick: async () => {
								await call("/log/clear", {});
								await reload();
							}
						}, t("clear"))),
					h("pre", { className: "dsa-pre" }, (snapshot.log ?? []).join("\n") || t("logEmpty"))),
				h(BallCard, { ball: snapshot.ball, t, call, reload }));
			if (part === "all") return view;
			const children = react.Children.toArray(view.props.children);
			return react.cloneElement(view, null,
				(SECTIONS[part] ?? SECTIONS.sandbox).map((index) => children[index]));
		}

		/* ------------------------------------------------------------------
		 * AI permissions (one card per conversation)
		 * ----------------------------------------------------------------
		 * The grants live in the app (`ai.consent`, keyed by the session id the
		 * tool call ran in); this page only lists and revokes them. The list is
		 * polled because the app has no client channel for it, and because the
		 * only writer a user needs from here is a revoke.
		 * ---------------------------------------------------------------- */

		const AI_CAPABILITY_LABELS = {
			read: "aiCap_read",
			clipboard: "aiCap_clipboard",
			notify: "aiCap_notify",
			control: "aiCap_control",
			screenshot: "aiCap_screenshot",
			terminal: "aiCap_terminal"
		};

		function aiCapabilityLabel(t, capability) {
			const key = AI_CAPABILITY_LABELS[capability];
			return key === undefined ? String(capability) : t(key);
		}

		/** The six capabilities, in the app's own order. */
		const AI_CAPABILITIES = ["read", "clipboard", "notify", "control", "screenshot", "terminal"];


		/** One grant timestamp; empty when the app sent none. */
		function aiTime(ms) {
			if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
			try {
				return new Date(ms).toLocaleString();
			} catch (error) {
				return String(ms);
			}
		}

		function AiConsentSection(props) {
			const t = props.t;
			const [snapshot, setSnapshot] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [message, setMessage] = react.useState("");
			const [working, setWorking] = react.useState(false);
			const [confirmAll, setConfirmAll] = react.useState(false);
			const [riskBusy, setRiskBusy] = react.useState(false);
			const [riskMessage, setRiskMessage] = react.useState("");
			const riskBusyRef = react.useRef(false);
			const tick = usePolling(4000);

			/** Load once, then on every poll tick; keep the old list on failure. */
			const reload = async () => {
				try {
					const next = await call("/ai/consent");
					setSnapshot(next);
					setError(null);
				} catch (failure) {
					setError(String(failure.message ?? failure));
				}
			};

			react.useEffect(() => {
				if (bridge() === null) return undefined;
				let cancelled = false;
				call("/ai/consent")
					.then((next) => {
						if (cancelled) return;
						setSnapshot(next);
						setError(null);
					})
					.catch((failure) => {
						if (!cancelled) setError(String(failure.message ?? failure));
					});
				return () => {
					cancelled = true;
				};
			}, [tick]);

			/** One page chrome for every state, so a slow bridge still looks like the shell. */
			const shell = (body) => h("div", { className: "dsa-root" },
				h("h2", { className: "dsa-heading" }, t("aiTitle")),
				h("p", { className: "dsa-intro" }, t("aiIntro")),
				body);

			if (bridge() === null) return shell(h("p", { className: "dsa-hint" }, t("noBridge")));
			if (snapshot === null) {
				return shell(h("p", { className: error === null ? "dsa-hint" : "dsa-error" },
					error === null ? t("busy") : t("aiLoadFailed", { error })));
			}
			if (snapshot.ok === false) {
				const detail = typeof snapshot.error === "string" ? snapshot.error : t("busy");
				return shell(h("p", { className: "dsa-error" }, t("aiLoadFailed", { error: detail })));
			}

			const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
			// Which capabilities currently need a confirmation. `risk` is the
			// app's stored choice; the fallback keeps an app that predates the
			// field on the documented defaults instead of showing everything off.
			const riskSupported = Array.isArray(snapshot.risk);
			// An app that predates `risk` (10216) prompts for every capability.
			// Show that truth — all six on and locked — instead of the 10217
			// defaults, which would describe the opposite rule.
			const risk = new Set((riskSupported ? snapshot.risk : AI_CAPABILITIES)
				.filter((capability) => AI_CAPABILITIES.indexOf(capability) !== -1));

			/** Save the high-risk set; the app prunes grants that stop being risky. */
			const toggleRisk = async (capability, enabled) => {
				// A ref, not the state: two taps can land in the same frame and both
				// read `riskBusy === false` before React commits, so the second save
				// would overwrite the first with a set computed from the same roster.
				// A refused tap is better than a silently lost capability.
				if (riskBusyRef.current || !riskSupported) return;
				const next = new Set(risk);
				if (enabled === true) next.add(capability);
				else next.delete(capability);
				const capabilities = AI_CAPABILITIES.filter((item) => next.has(item));
				riskBusyRef.current = true;
				setRiskBusy(true);
				setRiskMessage(t("busy"));
				try {
					const answer = await call("/ai/consent/risk", { capabilities });
					if (answer.ok === false) {
						throw new Error(typeof answer.error === "string" && answer.error !== "" ? answer.error : t("busy"));
					}
					setRiskMessage(typeof answer.message === "string" && answer.message !== "" ? answer.message : t("aiRiskSaved"));
					await reload();
				} catch (failure) {
					setRiskMessage(t("aiRiskFailed", { error: String(failure.message ?? failure) }));
					// Re-read the app's truth: a rejected save must not leave a switch
					// showing a value the app never accepted.
					await reload();
				} finally {
					riskBusyRef.current = false;
					setRiskBusy(false);
				}
			};

			/** Revoke one capability, one conversation, or everything, then reload. */
			const revoke = async (body) => {
				if (working) return;
				setWorking(true);
				setConfirmAll(false);
				setMessage(t("busy"));
				try {
					const answer = await call("/ai/consent/revoke", body);
					if (answer.ok === false) {
						throw new Error(typeof answer.error === "string" && answer.error !== "" ? answer.error : t("busy"));
					}
					const count = typeof answer.revoked === "number" ? String(answer.revoked) : "0";
					setMessage(typeof answer.message === "string" && answer.message !== ""
						? answer.message
						: t("aiRevoked", { count }));
					await reload();
				} catch (failure) {
					setMessage(t("aiRevokeFailed", { error: String(failure.message ?? failure) }));
				} finally {
					setWorking(false);
				}
			};

			const sessionCard = (entry, index) => {
				const session = entry !== null && typeof entry === "object" && typeof entry.session === "string"
					? entry.session
					: "";
				const declaredTitle = entry !== null && typeof entry === "object"
					&& typeof entry.title === "string" && entry.title.trim() !== ""
					? entry.title.trim()
					: "";
				// The app usually has the conversation title; when it does not, the
				// first 8 characters of the id are what the user can match against the
				// session list — a full UUID is unreadable on a phone.
				const title = declaredTitle !== ""
					? declaredTitle
					: session === "" ? t("aiUnknownSession") : session.slice(0, 8);
				const updated = aiTime(entry === null || typeof entry !== "object" ? undefined : entry.updatedMs);
				const grants = entry !== null && typeof entry === "object" && Array.isArray(entry.grants)
					? entry.grants.filter((grant) => grant !== null && typeof grant === "object")
					: [];
				return h("li", { key: session === "" ? "session-" + index : session },
					h(Card, null,
						h("div", { className: "dsa-spread" },
							h("div", { className: "dsa-copy" },
								h("span", { className: "dsa-strong" }, title),
								session === ""
									? null
									: h("span", { className: "dsa-meta dsa-mono" }, t("aiSessionId") + " · " + session)),
							session === ""
								? null
								: h("div", { className: "dsa-actions" },
									h(Button, {
										variant: "ghost",
										size: "sm",
										"aria-disabled": working ? "true" : "false",
										onClick: () => revoke({ session })
									}, t("aiRevokeSession")))),
						updated === "" ? null : h("p", { className: "dsa-hint" }, t("aiUpdated", { time: updated })),
						h("hr", { className: "dsa-sep" }),
						grants.length === 0
							? h("p", { className: "dsa-hint" }, t("aiNoCapabilities"))
							: h("ul", { className: "dsa-list" }, grants.map((grant) => {
								const capability = typeof grant.capability === "string" ? grant.capability : "";
								const granted = aiTime(grant.grantedMs);
								return h("li", { key: capability === "" ? "grant" : capability },
									h("div", { className: "dsa-spread" },
										h("div", { className: "dsa-inline" },
											h(Tag, null, aiCapabilityLabel(t, capability)),
											granted === "" ? null : h("span", { className: "dsa-hint" }, t("aiGrantedAt", { time: granted }))),
										capability === "" || session === ""
											? null
											: h(Button, {
												variant: "ghost",
												size: "sm",
												"aria-disabled": working ? "true" : "false",
												onClick: () => revoke({ session, capability })
											}, t("aiRevoke"))));
							}))));
			};

			const riskCard = h(Group, { title: t("aiRiskTitle") },
				h(Card, null,
					h("p", { className: "dsa-hint" }, t("aiRiskIntro")),
					AI_CAPABILITIES.map((capability) => h(ToggleRow, {
						key: capability,
						title: aiCapabilityLabel(t, capability),
						checked: risk.has(capability),
						disabled: !riskSupported || riskBusy,
						onChange: (value) => toggleRisk(capability, value)
					})),
					riskSupported ? null : h("p", { className: "dsa-hint" }, t("aiRiskUnsupported")),
					riskMessage === "" ? null : h("p", { className: "dsa-hint" }, riskMessage)));

			const sessionsCard = h(Group, { title: t("aiSessions") },
				sessions.length === 0
					? h("p", { className: "dsa-hint" }, t("aiEmpty"))
					: h("ul", { className: "dsa-list" }, sessions.map(sessionCard)),
				h("div", { className: "dsa-actions" },
					h(Button, { variant: "outline", size: "sm", onClick: () => reload() }, t("aiRefresh")),
					confirmAll
						? h(Button, {
							variant: "ghost",
							size: "sm",
							"aria-disabled": working ? "true" : "false",
							onClick: () => revoke({ all: true })
						}, t("aiRevokeAllConfirm"))
						: h(Button, {
							variant: "ghost",
							size: "sm",
							"aria-disabled": sessions.length === 0 || working ? "true" : "false",
							onClick: () => {
								if (working || sessions.length === 0) return;
								setMessage("");
								setConfirmAll(true);
							}
						}, t("aiRevokeAll")),
					confirmAll
						? h(Button, { variant: "ghost", size: "sm", onClick: () => setConfirmAll(false) }, t("aiCancel"))
						: null),
				sessions.length === 0 ? null : h("p", { className: "dsa-hint" }, t("aiAllNote")),
				h("p", { className: "dsa-hint" }, t("aiPrivacy")),
				h("p", { className: "dsa-hint" }, t("aiUnavailable")),
				error === null ? null : h("p", { className: "dsa-error" }, t("aiLoadFailed", { error })),
				message === "" ? null : h("p", { className: "dsa-hint" }, message));

			return shell(h("div", null, riskCard, sessionsCard));
		}

		/* ==== @vt-haptic:begin — light tap feedback for the on-screen key row. Tested by test/vt-haptic.test.mjs ==== */
		/**
		 * A short tick under the finger when a key-row button is hit.
		 *
		 * `navigator.vibrate` is the wrong instrument here twice over: the WebView
		 * needs the VIBRATE permission, and a vibration is a buzz rather than the
		 * keyboard's own tap. So the app's loopback bridge is asked first — its
		 * `/haptic` route runs `HapticFeedbackConstants.KEYBOARD_TAP` on the real
		 * window, which is the same feedback the soft keyboard gives and honours
		 * the system's touch-feedback setting. `navigator.vibrate` stays as the
		 * fallback for a page opened outside the app.
		 *
		 * Rapid taps collapse into one tick: without the debounce, holding a key
		 * down turns "tap" into "buzz".
		 */
		function createVtHaptic(options) {
			const call = options.call === undefined ? null : options.call;
			const vibrate = options.vibrate === undefined ? null : options.vibrate;
			const now = options.now === undefined ? () => Date.now() : options.now;
			const minIntervalMs = options.minIntervalMs === undefined ? 60 : options.minIntervalMs;
			const durationMs = options.durationMs === undefined ? 12 : options.durationMs;
			let last = -Infinity;

			function fallback() {
				if (vibrate === null) return false;
				try {
					return vibrate(durationMs) !== false;
				} catch {
					return false;
				}
			}

			return {
				/**
				 * One tap; returns whether anything was attempted. The debounce is the
				 * only guard (no in-flight flag) so a bridge that never answers can
				 * never wedge the key row.
				 */
				tap() {
					const time = now();
					if (time - last < minIntervalMs) return false;
					last = time;
					if (call === null) {
						fallback();
						return false;
					}
					try {
						const result = call("/haptic", { kind: "tap" });
						if (result !== null && typeof result.then === "function") result.then(() => {}, () => fallback());
					} catch {
						fallback();
					}
					return true;
				},
				/** Whether the bridge call is believed to work in this page. */
				hasBridge: () => call !== null
			};
		}
		/* ==== @vt-haptic:end ==== */
		/* ==== @vt-core:begin — pure terminal emulator (no DOM). Tested by test/vt-core.test.mjs ==== */
		/**
		 * A small VT100/xterm-compatible screen: the subset a shell, a Readline
		 * prompt, a pager and a colorized build log actually emit.
		 *
		 * Why it exists: the panel used to load xterm from the guest PTY service.
		 * xterm brings a hidden textarea of its own that fights the Android IME,
		 * and its canvas/DOM renderers keep the screen away from the browser's
		 * text selection, which is the only selection a phone has. This core owns
		 * the grid and nothing else: no DOM, no input, no timers, so the whole
		 * parser can be diffed against xterm in plain Node.
		 *
		 * Cells carry text plus attributes; rows are cheap objects with a revision
		 * the painter compares, so repainting costs the rows that changed.
		 */
		function createVtCore() {
			/* ------------------------------------------------------------ cell model */
			const FLAG_BOLD = 1;
			const FLAG_DIM = 2;
			const FLAG_ITALIC = 4;
			const FLAG_UNDERLINE = 8;
			const FLAG_BLINK = 16;
			const FLAG_INVERSE = 32;
			const FLAG_INVISIBLE = 64;
			const FLAG_STRIKE = 128;

			let rowSeq = 0;

			/** Zero width: combining marks, joiners, variation selectors, skin tones. */
			function isZeroWidth(cp) {
				if (cp === 0x200d || cp === 0x200b || cp === 0x200c || cp === 0xfeff) return true;
				if (cp >= 0x0300 && cp <= 0x036f) return true;
				if (cp >= 0x0483 && cp <= 0x0489) return true;
				if (cp >= 0x0591 && cp <= 0x05c7) return true;
				if (cp >= 0x0610 && cp <= 0x061a) return true;
				if (cp >= 0x064b && cp <= 0x065f) return true;
				if (cp === 0x0670) return true;
				if (cp >= 0x06d6 && cp <= 0x06dc) return true;
				if (cp >= 0x06df && cp <= 0x06e4) return true;
				if (cp >= 0x06e7 && cp <= 0x06e8) return true;
				if (cp >= 0x06ea && cp <= 0x06ed) return true;
				if (cp === 0x0711) return true;
				if (cp >= 0x0730 && cp <= 0x074a) return true;
				if (cp >= 0x07a6 && cp <= 0x07b0) return true;
				if (cp >= 0x07eb && cp <= 0x07f3) return true;
				if (cp >= 0x0816 && cp <= 0x082d) return true;
				if (cp >= 0x0859 && cp <= 0x085b) return true;
				if (cp >= 0x08d3 && cp <= 0x0903) return true;
				if (cp >= 0x093a && cp <= 0x094f) return true;
				if (cp >= 0x0951 && cp <= 0x0957) return true;
				if (cp >= 0x0962 && cp <= 0x0963) return true;
				if (cp === 0x0e31) return true;
				if (cp >= 0x0e34 && cp <= 0x0e3a) return true;
				if (cp >= 0x0e47 && cp <= 0x0e4e) return true;
				if (cp === 0x0eb1) return true;
				if (cp >= 0x0eb4 && cp <= 0x0ebc) return true;
				if (cp >= 0x0ec8 && cp <= 0x0ecd) return true;
				if (cp >= 0x1ab0 && cp <= 0x1aff) return true;
				if (cp >= 0x1dc0 && cp <= 0x1dff) return true;
				if (cp >= 0x200e && cp <= 0x200f) return true;
				if (cp >= 0x2028 && cp <= 0x202e) return true;
				if (cp >= 0x20d0 && cp <= 0x20f0) return true;
				if (cp >= 0xfe00 && cp <= 0xfe0f) return true;
				if (cp >= 0xfe20 && cp <= 0xfe2f) return true;
				if (cp >= 0x1f3fb && cp <= 0x1f3ff) return true;
				if (cp >= 0xe0100 && cp <= 0xe01ef) return true;
				return false;
			}

			/** Two columns: East Asian Wide/Fullwidth and the emoji blocks. */
			function isWide(cp) {
				if (cp < 0x1100) return false;
				if (cp >= 0x1100 && cp <= 0x115f) return true;
				if (cp >= 0x2e80 && cp <= 0x303e) return true;
				if (cp >= 0x3041 && cp <= 0x33ff) return true;
				if (cp >= 0x3400 && cp <= 0x4dbf) return true;
				if (cp >= 0x4e00 && cp <= 0x9fff) return true;
				if (cp >= 0xa000 && cp <= 0xa4cf) return true;
				if (cp >= 0xa960 && cp <= 0xa97f) return true;
				if (cp >= 0xac00 && cp <= 0xd7a3) return true;
				if (cp >= 0xf900 && cp <= 0xfaff) return true;
				if (cp >= 0xfe10 && cp <= 0xfe19) return true;
				if (cp >= 0xfe30 && cp <= 0xfe6f) return true;
				if (cp >= 0xff00 && cp <= 0xff60) return true;
				if (cp >= 0xffe0 && cp <= 0xffe6) return true;
				if (cp >= 0x1f300 && cp <= 0x1f64f) return true;
				if (cp >= 0x1f680 && cp <= 0x1f6ff) return true;
				if (cp >= 0x1f900 && cp <= 0x1f9ff) return true;
				if (cp >= 0x1fa70 && cp <= 0x1faff) return true;
				if (cp >= 0x20000 && cp <= 0x2fffd) return true;
				if (cp >= 0x30000 && cp <= 0x3fffd) return true;
				return false;
			}

			function cpWidth(cp) {
				if (cp === 0) return 0;
				if (isZeroWidth(cp)) return 0;
				return isWide(cp) ? 2 : 1;
			}

			function blankCell(bg) {
				return {
					ch: " ",
					w: 1,
					fg: null,
					bg: bg === undefined ? null : bg,
					flags: 0
				};
			}

			function newRow(cols) {
				return {
					id: ++rowSeq,
					cells: new Array(cols).fill(null),
					wrapped: false,
					rev: 0
				};
			}

			function touch(row) {
				row.rev = (row.rev + 1) | 0;
			}

			/** DEC Special Graphics — the line drawing set `less`, `htop` and TUIs use. */
			const DEC_GRAPHICS = {
				0x5f: " ",
				0x60: "\u25c6",
				0x61: "\u2592",
				0x62: "\u2409",
				0x63: "\u240c",
				0x64: "\u240d",
				0x65: "\u240a",
				0x66: "\u00b0",
				0x67: "\u00b1",
				0x68: "\u2424",
				0x69: "\u240b",
				0x6a: "\u2518",
				0x6b: "\u2510",
				0x6c: "\u250c",
				0x6d: "\u2514",
				0x6e: "\u253c",
				0x6f: "\u23ba",
				0x70: "\u23bb",
				0x71: "\u2500",
				0x72: "\u23bc",
				0x73: "\u23bd",
				0x74: "\u251c",
				0x75: "\u2524",
				0x76: "\u2534",
				0x77: "\u252c",
				0x78: "\u2502",
				0x79: "\u2264",
				0x7a: "\u2265",
				0x7b: "\u03c0",
				0x7c: "\u2260",
				0x7d: "\u00a3",
				0x7e: "\u00b7"
			};

			/** The xterm 256-color palette: 16 system colors plus the 6x6x6 cube and ramp. */
			const BASE_256 = (() => {
				const table = new Array(256);
				for (let i = 16; i < 232; i++) {
					const value = i - 16;
					const r = Math.floor(value / 36);
					const g = Math.floor(value / 6) % 6;
					const b = value % 6;
					const level = (part) => part === 0 ? 0 : 55 + part * 40;
					table[i] = rgbHex(level(r), level(g), level(b));
				}
				for (let i = 232; i < 256; i++) {
					const level = 8 + (i - 232) * 10;
					table[i] = rgbHex(level, level, level);
				}
				return table;
			})();

			function rgbHex(r, g, b) {
				return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
			}

			/** The light and dark ANSI ramps. Both keep every slot legible on their background. */
			const THEMES = {
				light: {
					defaultFg: "#1f2329",
					defaultBg: "#ffffff",
					defaultCursor: "#1f6feb",
					selectionBg: "#bcd6ff",
					selectionFg: "#10131a",
					ansi: [
						"#24292f",
						"#c02b2b",
						"#116a2e",
						"#8a5a00",
						"#1f6feb",
						"#8b2fa0",
						"#0d6b78",
						"#6e7781",
						"#57606a",
						"#d13438",
						"#1a7f37",
						"#9a6700",
						"#0969da",
						"#a02fa0",
						"#0f7b8a",
						"#1f2329"
					]
				},
				dark: {
					defaultFg: "#e8eaed",
					defaultBg: "#14161a",
					defaultCursor: "#4c8dff",
					selectionBg: "#2c3a55",
					selectionFg: "#f2f4f8",
					ansi: [
						"#14161a",
						"#e06c75",
						"#98c379",
						"#e5c07b",
						"#61afef",
						"#c678dd",
						"#56b6c2",
						"#d7dae0",
						"#5f6368",
						"#ff7b86",
						"#b5e08d",
						"#ffd68a",
						"#82c4ff",
						"#e094f5",
						"#79d7e2",
						"#ffffff"
					]
				}
			};

			const DEFAULT_THEME = "dark";

			class Screen {
				/**
				 * @param options - `{cols, rows, scrollback}`; every field is optional.
				 */
				constructor(options) {
					const config = options || {};
					this.cols = Math.max(2, config.cols || 80);
					this.rows = Math.max(1, config.rows || 24);
					this.scrollbackLimit = Math.max(0, config.scrollback === undefined ? 1000 : config.scrollback);
					this.onResponse = null;
					this.onTitle = null;
					this.onBell = null;
					this.altActive = false;
					this.title = "";
					this.palette = Object.assign({}, THEMES[DEFAULT_THEME]);
					this.dynamic = {
						indexed: new Map(),
						foreground: null,
						background: null,
						cursor: null
					};
					this.reset();
				}

				/** Full reset: RIS, a reconnect, or a fresh mount. */
				reset() {
					this.lines = [newRow(this.cols)];
					for (let i = 1; i < this.rows; i++) this.lines.push(newRow(this.cols));
					this.savedLines = null;
					this.savedCursor = null;
					this.cursor = {
						x: 0,
						y: 0
					};
					this.cursorVisible = true;
					this.cursorStyle = "block";
					this.pendingWrap = false;
					this.scrollTop = 0;
					this.scrollBottom = this.rows - 1;
					this.savedScroll = null;
					this.tabs = [];
					this._buildTabs();
					this.charsets = ["ascii", "ascii"];
					this.activeCharset = 0;
					this.singleShift = null;
					this.pen = {
						fg: null,
						bg: null,
						flags: 0
					};
					this.modes = {
						autowrap: true,
						origin: false,
						insert: false,
						newline: false,
						applicationCursor: false,
						applicationKeypad: false,
						bracketedPaste: false,
						mouse: "none",
						mouseSgr: false,
						reverseVideo: false
					};
					this.dynamic.indexed.clear();
					this.dynamic.foreground = null;
					this.dynamic.background = null;
					this.dynamic.cursor = null;
					this._lastCell = null;
					this._joinNext = false;
					this._repeat = null;
					this._utf8 = {
						bytes: [],
						needed: 0,
						code: 0
					};
					this._state = 0;
					this._params = [];
					this._paramText = "";
					this._private = "";
					this._intermediate = "";
					this._string = "";
					this._oscCode = null;
				}

				/* ------------------------------------------------------------ reading */
				get screenTop() {
					return this.lines.length - this.rows;
				}

				get lineCount() {
					return this.lines.length;
				}

				rowAt(index) {
					return this.lines[index];
				}

				cellAt(rowIndex, x) {
					const row = this.lines[rowIndex];
					if (row === undefined) return null;
					return row.cells[x] || null;
				}

				/** Absolute row index of the cursor inside {@link lines}. */
				get cursorAbs() {
					return this.screenTop + this.cursor.y;
				}

				/* ------------------------------------------------------------- colors */
				/** Resolve a cell color value (null, 0-255, or "#rrggbb") to CSS. */
				colorOf(value, fallback) {
					if (value === null || value === undefined) return fallback;
					if (typeof value === "string") return value;
					if (value < 16) {
						const override = this.dynamic.indexed.get(value);
						return override || this.palette.ansi[value];
					}
					const override = this.dynamic.indexed.get(value);
					return override || BASE_256[value] || fallback;
				}

				get defaultFg() {
					return this.dynamic.foreground || this.palette.defaultFg;
				}

				get defaultBg() {
					return this.dynamic.background || this.palette.defaultBg;
				}

				get cursorColor() {
					return this.dynamic.cursor || this.palette.defaultCursor;
				}

				/** Swap the light/dark ramp without touching the screen contents. */
				setTheme(name) {
					const theme = THEMES[name] || THEMES[DEFAULT_THEME];
					this.palette = Object.assign({}, theme);
				}

				/* ------------------------------------------------------------ writing */
				/**
				 * Feed PTY bytes. Accepts a Uint8Array (the socket path) or a string
				 * (tests and OSC payloads), and keeps UTF-8 state across calls so a
				 * multi-byte character split by the socket still decodes.
				 */
				write(input) {
					if (typeof input === "string") return this._bytes(new TextEncoder().encode(input));
					return this._bytes(input);
				}

				_bytes(bytes) {
					for (let i = 0; i < bytes.length; i++) {
						const byte = bytes[i];
						const utf8 = this._utf8;
						if (utf8.needed === 0) {
							if (byte < 0x80) this._feed(byte);
							else if ((byte & 0xe0) === 0xc0) {
								utf8.needed = 1;
								utf8.code = byte & 0x1f;
							} else if ((byte & 0xf0) === 0xe0) {
								utf8.needed = 2;
								utf8.code = byte & 0x0f;
							} else if ((byte & 0xf8) === 0xf0) {
								utf8.needed = 3;
								utf8.code = byte & 0x07;
							} else this._feed(0xfffd);
							continue;
						}
						if ((byte & 0xc0) !== 0x80) {
							utf8.needed = 0;
							this._feed(0xfffd);
							i--;
							continue;
						}
						utf8.code = (utf8.code << 6) | (byte & 0x3f);
						if (--utf8.needed === 0) this._feed(utf8.code);
					}
				}

				_feed(cp) {
					switch (this._state) {
						case 0:
							if (cp < 0x20) return this._control(cp);
							if (cp === 0x7f) return;
							return this._print(cp);
						case 1:
							return this._escape(cp);
						case 2:
							return this._csi(cp);
						case 3:
							return this._stringState(cp, 0);
						case 4:
							return this._stringState(cp, 1);
						case 5:
							return this._escapeIntermediate(cp);
						case 6:
							return this._stringStepped(cp);
						default:
							return;
					}
				}

				_response(text) {
					if (typeof this.onResponse === "function") this.onResponse(text);
				}

				_control(cp) {
					switch (cp) {
						case 0x1b:
							this._state = 1;
							return;
						case 0x07:
							if (typeof this.onBell === "function") this.onBell();
							return;
						case 0x08:
							if (this.cursor.x > 0) this.cursor.x--;
							else if (this.pendingWrap) this.pendingWrap = false;
							return;
						case 0x09:
							this._tab();
							return;
						case 0x0a:
						case 0x0b:
						case 0x0c:
							this._linefeed();
							if (this.modes.newline) this.cursor.x = 0;
							return;
						case 0x0d:
							this.cursor.x = 0;
							this.pendingWrap = false;
							return;
						case 0x0e:
							this.activeCharset = 1;
							return;
						case 0x0f:
							this.activeCharset = 0;
							return;
						default:
							return;
					}
				}

				_escape(cp) {
					this._state = 0;
					switch (cp) {
						case 0x5b:
							this._params = [];
							this._paramText = "";
							this._private = "";
							this._intermediate = "";
							this._state = 2;
							return;
						case 0x5d:
							this._string = "";
							this._oscCode = null;
							this._state = 3;
							return;
						case 0x50:
						case 0x58:
						case 0x5e:
						case 0x5f:
							this._string = "";
							this._state = 4;
							return;
						case 0x28:
						case 0x29:
						case 0x2a:
						case 0x2b:
							this._escIntermediate = cp;
							this._state = 5;
							return;
						case 0x23:
						case 0x20:
						case 0x25:
						case 0x22:
							this._escIntermediate = cp;
							this._state = 5;
							return;
						case 0x37:
							this._saveCursor();
							return;
						case 0x38:
							this._restoreCursor();
							return;
						case 0x44:
							this._index();
							return;
						case 0x45:
							this.cursor.x = 0;
							this._index();
							return;
						case 0x48:
							this._setTabStop();
							return;
						case 0x4d:
							this._reverseIndex();
							return;
						case 0x63:
							this.reset();
							return;
						case 0x3d:
							this.modes.applicationKeypad = true;
							return;
						case 0x3e:
							this.modes.applicationKeypad = false;
							return;
						case 0x5a:
							this._response("\u001b[?1;2c");
							return;
						case 0x5c:
							return;
						default:
							return;
					}
				}

				_escapeIntermediate(cp) {
					this._state = 0;
					const lead = this._escIntermediate;
					this._escIntermediate = 0;
					if (lead === 0x28 || lead === 0x29) {
						const slot = lead === 0x28 ? 0 : 1;
						this.charsets[slot] = cp === 0x30 ? "graphics" : cp === 0x41 || cp === 0x42 ? "ascii" : "ascii";
						return;
					}
					if (lead === 0x2a || lead === 0x2b) return;
					if (lead === 0x23 && cp === 0x38) return this._alignmentTest();
					/* ESC SP F/G/H (7/8 bit controls), ESC % G (UTF-8): accepted, no state. */
				}

				_stringState(cp, kind) {
					if (cp === 0x07 || cp === 0x9c) {
						const text = this._string;
						this._state = 0;
						this._string = "";
						if (kind === 0) this._osc(text);
						return;
					}
					if (cp === 0x1b) {
						this._state = 6;
						return;
					}
					if (kind === 0 && this._string.length < 4096) this._string += String.fromCodePoint(cp);
				}

				/** ESC inside a string waits for `\` (ST) or cancels back to ground. */
				_stringStepped(cp) {
					this._state = 0;
					if (cp === 0x5c) {
						const text = this._string;
						this._string = "";
						this._osc(text);
					} else this._string = "";
				}

				_csi(cp) {
					if (cp >= 0x30 && cp <= 0x39) {
						this._paramText += String.fromCharCode(cp);
						return;
					}
					if (cp === 0x3b || cp === 0x3a) {
						this._params.push(this._paramText === "" ? null : Number(this._paramText));
						this._paramText = "";
						return;
					}
					if (cp >= 0x3c && cp <= 0x3f) {
						this._private += String.fromCharCode(cp);
						return;
					}
					if (cp >= 0x20 && cp <= 0x2f) {
						this._intermediate += String.fromCharCode(cp);
						return;
					}
					if (cp >= 0x40 && cp <= 0x7e) {
						this._params.push(this._paramText === "" ? null : Number(this._paramText));
						this._paramText = "";
						const params = this._params;
						const priv = this._private;
						this._params = [];
						this._private = "";
						this._intermediate = "";
						this._state = 0;
						return this._dispatchCsi(cp, params, priv);
					}
					this._state = 0;
				}

				_param(params, index, fallback) {
					const value = params[index];
					if (value === null || value === undefined || Number.isNaN(value)) return fallback;
					return value;
				}

				_dispatchCsi(final, params, priv) {
					const first = this._param(params, 0, 0);
					const count = Math.max(1, first === 0 ? 1 : first);
					switch (final) {
						case 0x40:
							return this._insertChars(count);
						case 0x41:
							return this._cursorUp(count);
						case 0x42:
							return this._cursorDown(count);
						case 0x43:
							return this._cursorForward(count);
						case 0x44:
							return this._cursorBack(count);
						case 0x45:
							return this._cursorNextLine(count);
						case 0x46:
							return this._cursorPrevLine(count);
						case 0x45:
							return this._cursorNextLine(count);
						case 0x46:
							return this._cursorPrevLine(count);
						case 0x47:
							return this._setColumn(first === 0 ? 1 : first);
						case 0x48:
						case 0x66:
							return this._setPosition(first === 0 ? 1 : first, this._param(params, 1, 1));
						case 0x49:
							return this._forwardTabs(count);
						case 0x4a:
							return this._eraseInDisplay(first);
						case 0x4b:
							return this._eraseInLine(first);
						case 0x4c:
							return this._insertLines(count);
						case 0x4d:
							return this._deleteLines(count);
						case 0x50:
							return this._deleteChars(count);
						case 0x53:
							return this._scrollUp(count);
						case 0x54:
							return this._scrollDown(count);
						case 0x58:
							return this._eraseChars(count);
						case 0x5a:
							return this._backTabs(count);
						case 0x60:
							return this._setColumn(first === 0 ? 1 : first);
						case 0x61:
							return this._cursorForward(count);
						case 0x62:
							return this._repeatChar(count);
						case 0x63:
							return this._response(priv === ">" ? "\u001b[>0;276;0c" : "\u001b[?1;2c");
						case 0x64:
							return this._setRow(first === 0 ? 1 : first);
						case 0x65:
							return this._cursorDown(count);
						case 0x67:
							return this._clearTabs(first);
						case 0x68:
							return this._setModes(params, true, priv);
						case 0x6c:
							return this._setModes(params, false, priv);
						case 0x6d:
							return this._sgr(params);
						case 0x6e:
							return this._report(first, priv);
						case 0x71:
							return this._setCursorStyle(first);
						case 0x72:
							return this._setScrollRegion(params);
						case 0x73:
							return this._saveCursor();
						case 0x74:
							return this._windowOp(params);
						case 0x75:
							return this._restoreCursor();
						default:
							return;
					}
				}

				/* ------------------------------------------------------------ movement */
				_verticalTop() {
					return this.modes.origin ? this.scrollTop : 0;
				}

				_verticalBottom() {
					return this.modes.origin ? this.scrollBottom : this.rows - 1;
				}

				_cursorUp(count) {
					this.cursor.y = Math.max(this._verticalTop(), this.cursor.y - count);
					this.pendingWrap = false;
				}

				_cursorDown(count) {
					this.cursor.y = Math.min(this._verticalBottom(), this.cursor.y + count);
					this.pendingWrap = false;
				}

				_cursorForward(count) {
					this.cursor.x = Math.min(this.cols - 1, this.cursor.x + count);
					this.pendingWrap = false;
				}

				_cursorBack(count) {
					this.cursor.x = Math.max(0, this.cursor.x - count);
					this.pendingWrap = false;
				}

				_cursorNextLine(count) {
					this._cursorDown(count);
					this.cursor.x = 0;
				}

				_cursorPrevLine(count) {
					this._cursorUp(count);
					this.cursor.x = 0;
				}

				_setColumn(column) {
					this.cursor.x = Math.min(this.cols - 1, Math.max(0, column - 1));
					this.pendingWrap = false;
				}

				_setRow(row) {
					const value = this._verticalTop() + Math.max(0, row - 1);
					this.cursor.y = Math.min(this._verticalBottom(), Math.max(this._verticalTop(), value));
					this.pendingWrap = false;
				}

				_setPosition(row, column) {
					this._setRow(row);
					this._setColumn(column);
				}

				_tab() {
					let x = this.cursor.x + 1;
					while (x < this.cols && !this.tabs[x]) x++;
					this.cursor.x = Math.min(this.cols - 1, x);
					this.pendingWrap = false;
				}

				_forwardTabs(count) {
					for (let i = 0; i < count; i++) this._tab();
				}

				_backTabs(count) {
					for (let i = 0; i < count; i++) {
						let x = this.cursor.x - 1;
						while (x > 0 && !this.tabs[x]) x--;
						this.cursor.x = Math.max(0, x);
					}
					this.pendingWrap = false;
				}

				_buildTabs() {
					this.tabs = new Array(this.cols).fill(false);
					for (let x = 8; x < this.cols; x += 8) this.tabs[x] = true;
				}

				_setTabStop() {
					if (this.cursor.x < this.tabs.length) this.tabs[this.cursor.x] = true;
				}

				_clearTabs(mode) {
					if (mode === 0) this.tabs[this.cursor.x] = false;
					else if (mode === 3) this.tabs.fill(false);
				}

				/* ------------------------------------------------------------- scrolling */
				_linefeed() {
					this.pendingWrap = false;
					if (this.cursor.y === this.scrollBottom) this._scrollUp(1);
					else if (this.cursor.y < this.rows - 1) this.cursor.y++;
				}

				_index() {
					if (this.cursor.y === this.scrollBottom) this._scrollUp(1);
					else if (this.cursor.y < this.rows - 1) this.cursor.y++;
				}

				_reverseIndex() {
					if (this.cursor.y === this.scrollTop) this._scrollDown(1);
					else if (this.cursor.y > 0) this.cursor.y--;
				}

				_scrollUp(count) {
					for (let i = 0; i < count; i++) {
						if (this.scrollTop === 0 && this.scrollBottom === this.rows - 1 && !this.altActive) {
							this.lines.push(newRow(this.cols));
							const limit = this.rows + this.scrollbackLimit;
							while (this.lines.length > limit) this.lines.shift();
						} else {
							const topAbs = this.screenTop + this.scrollTop;
							const bottomAbs = this.screenTop + this.scrollBottom;
							this.lines.splice(topAbs, 1);
							this.lines.splice(bottomAbs, 0, newRow(this.cols));
						}
					}
				}

				_scrollDown(count) {
					for (let i = 0; i < count; i++) {
						const topAbs = this.screenTop + this.scrollTop;
						const bottomAbs = this.screenTop + this.scrollBottom;
						this.lines.splice(bottomAbs, 1);
						this.lines.splice(topAbs, 0, newRow(this.cols));
					}
				}

				_insertLines(count) {
					if (this.cursor.y < this.scrollTop || this.cursor.y > this.scrollBottom) return;
					const bottomAbs = this.screenTop + this.scrollBottom;
					for (let i = 0; i < count; i++) {
						const abs = this.screenTop + this.cursor.y;
						if (abs > bottomAbs) break;
						this.lines.splice(abs, 0, newRow(this.cols));
						this.lines.splice(bottomAbs + 1, 1);
					}
				}

				_deleteLines(count) {
					if (this.cursor.y < this.scrollTop || this.cursor.y > this.scrollBottom) return;
					const bottomAbs = this.screenTop + this.scrollBottom;
					for (let i = 0; i < count; i++) {
						const abs = this.screenTop + this.cursor.y;
						if (abs > bottomAbs) break;
						this.lines.splice(abs, 1);
						this.lines.splice(this.screenTop + this.scrollBottom, 0, newRow(this.cols));
					}
				}

				/* ---------------------------------------------------------------- erasing */
				_eraseInLine(mode) {
					const row = this.lines[this.screenTop + this.cursor.y];
					if (row === undefined) return;
					let from = 0;
					let to = this.cols - 1;
					if (mode === 0) from = this.cursor.x;
					else if (mode === 1) to = this.cursor.x;
					this._blank(row, from, to);
				}

				_eraseInDisplay(mode) {
					const topAbs = this.screenTop;
					if (mode === 3) {
						this.clearAll();
						return;
					}
					if (mode === 0) {
						this._eraseInLine(0);
						for (let y = this.cursor.y + 1; y < this.rows; y++) this._blank(this.lines[topAbs + y], 0, this.cols - 1);
					} else if (mode === 1) {
						this._eraseInLine(1);
						for (let y = 0; y < this.cursor.y; y++) this._blank(this.lines[topAbs + y], 0, this.cols - 1);
					} else if (mode === 2) {
						for (let y = 0; y < this.rows; y++) this._blank(this.lines[topAbs + y], 0, this.cols - 1);
					}
				}

				_eraseChars(count) {
					const row = this.lines[this.screenTop + this.cursor.y];
					if (row === undefined) return;
					this._blank(row, this.cursor.x, Math.min(this.cols - 1, this.cursor.x + count - 1));
				}

				_insertChars(count) {
					const row = this.lines[this.screenTop + this.cursor.y];
					if (row === undefined) return;
					const fill = [];
					for (let i = 0; i < count; i++) fill.push(blankCell(this.pen.bg));
					row.cells.splice(this.cursor.x, 0, ...fill);
					row.cells.length = this.cols;
					touch(row);
				}

				_deleteChars(count) {
					const row = this.lines[this.screenTop + this.cursor.y];
					if (row === undefined) return;
					row.cells.splice(this.cursor.x, count);
					const bg = this.pen.bg;
					for (let i = 0; i < count; i++) row.cells.push(blankCell(bg));
					row.cells.length = this.cols;
					touch(row);
				}

				_blank(row, from, to) {
					if (row === undefined) return;
					const bg = this.pen.bg;
					for (let x = Math.max(0, from); x <= Math.min(this.cols - 1, to); x++) row.cells[x] = bg === null ? null : {
						ch: " ",
						w: 1,
						fg: null,
						bg,
						flags: 0
					};
					touch(row);
				}

				_alignmentTest() {
					const topAbs = this.screenTop;
					for (let y = 0; y < this.rows; y++) {
						const row = this.lines[topAbs + y];
						if (row === undefined) continue;
						for (let x = 0; x < this.cols; x++) row.cells[x] = {
							ch: "E",
							w: 1,
							fg: null,
							bg: null,
							flags: 0
						};
						touch(row);
					}
					this.cursor.x = 0;
					this.cursor.y = 0;
				}

				/* ------------------------------------------------------------- scrolling region */
				_setScrollRegion(params) {
					const top = this._param(params, 0, 1);
					const bottom = this._param(params, 1, this.rows);
					if (top < 1 || bottom > this.rows || top >= bottom) return;
					this.scrollTop = top - 1;
					this.scrollBottom = bottom - 1;
					this.cursor.x = 0;
					this.cursor.y = this.modes.origin ? this.scrollTop : 0;
					this.pendingWrap = false;
				}

				/* -------------------------------------------------------------- printing */
				_appendToPrev(cp) {
					const last = this._lastCell;
					if (last === null) {
						this._printChar(cp, cpWidth(cp) || 1);
						return;
					}
					const row = this.lines[last.row];
					const cell = row === undefined ? null : row.cells[last.x];
					if (cell === null || cell === undefined) {
						this._printChar(cp, cpWidth(cp) || 1);
						return;
					}
					cell.ch += String.fromCodePoint(cp);
					touch(row);
				}

				_mapped(cp) {
					const slot = this.singleShift === null ? this.activeCharset : this.singleShift;
					this.singleShift = null;
					if (this.charsets[slot] !== "graphics") return cp;
					const glyph = DEC_GRAPHICS[cp];
					return glyph === undefined ? cp : glyph.codePointAt(0);
				}

				_print(cp) {
					const shifter = cp >= 0x20 && cp <= 0x7e;
					const mapped = shifter ? this._mapped(cp) : cp;
					const width = cpWidth(mapped);
					if (this._joinNext) {
						this._joinNext = false;
						this._appendToPrev(mapped);
						return;
					}
					if (width === 0) {
						if (mapped === 0x200d) this._joinNext = true;
						this._appendToPrev(mapped);
						return;
					}
					this._printChar(mapped, width);
				}

				/**
				 * Wrap to the next line, marking the row we leave behind as
				 * continued so the painter can copy it as one logical line.
				 */
				_wrap() {
					const row = this.lines[this.screenTop + this.cursor.y];
					if (row !== undefined) row.wrapped = true;
					this.cursor.x = 0;
					this._linefeed();
					this._lastCell = null;
				}

				_printChar(cp, width) {
					const text = typeof cp === "number" ? String.fromCodePoint(cp) : cp;
					if (this.pendingWrap) {
						this.pendingWrap = false;
						this._wrap();
					}
					if (width > 1 && this.cursor.x + width > this.cols) {
						if (this.modes.autowrap) this._wrap();
						else this.cursor.x = Math.max(0, this.cols - width);
					}
					this._repeat = {
						cp,
						width
					};
					const row = this.lines[this.screenTop + this.cursor.y];
					if (row === undefined) return;
					const pen = this.pen;
					if (this.modes.insert) {
						const fill = [];
						for (let i = 0; i < width; i++) fill.push(blankCell(pen.bg));
						row.cells.splice(this.cursor.x, 0, ...fill);
						row.cells.length = this.cols;
					}
					row.cells[this.cursor.x] = {
						ch: text,
						w: width,
						fg: pen.fg,
						bg: pen.bg,
						flags: pen.flags
					};
					if (width === 2 && this.cursor.x + 1 < this.cols) row.cells[this.cursor.x + 1] = {
						ch: "",
						w: 0,
						fg: pen.fg,
						bg: pen.bg,
						flags: pen.flags
					};
					touch(row);
					this._lastCell = {
						row: this.screenTop + this.cursor.y,
						x: this.cursor.x
					};
					const next = this.cursor.x + width;
					if (next >= this.cols) {
						this.cursor.x = this.cols - 1;
						this.pendingWrap = this.modes.autowrap;
					} else this.cursor.x = next;
				}

				_repeatChar(count) {
					if (this._repeat === null) return;
					for (let i = 0; i < count; i++) this._printChar(this._repeat.cp, this._repeat.width);
				}

				/* ------------------------------------------------------------- SGR */
				_sgr(params) {
					const pen = this.pen;
					for (let i = 0; i < params.length; i++) {
						const code = params[i] === null ? 0 : params[i];
						if (code === 0) {
							pen.fg = null;
							pen.bg = null;
							pen.flags = 0;
						} else if (code === 1) pen.flags |= FLAG_BOLD;
						else if (code === 2) pen.flags |= FLAG_DIM;
						else if (code === 3) pen.flags |= FLAG_ITALIC;
						else if (code === 4) pen.flags |= FLAG_UNDERLINE;
						else if (code === 5 || code === 6) pen.flags |= FLAG_BLINK;
						else if (code === 7) pen.flags |= FLAG_INVERSE;
						else if (code === 8) pen.flags |= FLAG_INVISIBLE;
						else if (code === 9) pen.flags |= FLAG_STRIKE;
						else if (code === 21 || code === 22) pen.flags &= ~(FLAG_BOLD | FLAG_DIM);
						else if (code === 23) pen.flags &= ~FLAG_ITALIC;
						else if (code === 24) pen.flags &= ~FLAG_UNDERLINE;
						else if (code === 25) pen.flags &= ~FLAG_BLINK;
						else if (code === 27) pen.flags &= ~FLAG_INVERSE;
						else if (code === 28) pen.flags &= ~FLAG_INVISIBLE;
						else if (code === 29) pen.flags &= ~FLAG_STRIKE;
						else if (code >= 30 && code <= 37) pen.fg = code - 30;
						else if (code === 38 || code === 48) {
							const target = code === 38 ? "fg" : "bg";
							const mode = params[i + 1];
							if (mode === 5) {
								pen[target] = params[i + 2] === null ? 0 : params[i + 2];
								i += 2;
							} else if (mode === 2) {
								let base = i + 2;
								if (params[base] === null) base++;
								const r = params[base] === null ? 0 : params[base];
								const g = params[base + 1] === null ? 0 : params[base + 1];
								const b = params[base + 2] === null ? 0 : params[base + 2];
								pen[target] = rgbHex(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)));
								i = base + 2;
							} else i += 1;
						} else if (code === 39) pen.fg = null;
						else if (code >= 40 && code <= 47) pen.bg = code - 40;
						else if (code === 49) pen.bg = null;
						else if (code >= 90 && code <= 97) pen.fg = code - 90 + 8;
						else if (code >= 100 && code <= 107) pen.bg = code - 100 + 8;
					}
				}

				/* ------------------------------------------------------------- modes */
				_setModes(params, enabled, priv) {
					for (const raw of params) {
						const code = raw === null ? 0 : raw;
						if (priv === "?") {
							switch (code) {
								case 1:
									this.modes.applicationCursor = enabled;
									break;
								case 6:
									this.modes.origin = enabled;
									this.cursor.x = 0;
									this.cursor.y = enabled ? this.scrollTop : 0;
									this.pendingWrap = false;
									break;
								case 7:
									this.modes.autowrap = enabled;
									break;
								case 12:
									break;
								case 25:
									this.cursorVisible = enabled;
									break;
								case 1000:
								case 1002:
								case 1003:
									this.modes.mouse = enabled ? (code === 1000 ? "click" : code === 1002 ? "drag" : "move") : "none";
									break;
								case 1005:
									this.modes.mouseSgr = false;
									break;
								case 1006:
									this.modes.mouseSgr = enabled;
									break;
								case 1049:
									this._switchScreen(enabled, true);
									break;
								case 1047:
									this._switchScreen(enabled, false);
									break;
								case 47:
									this._switchScreen(enabled, false);
									break;
								case 2004:
									this.modes.bracketedPaste = enabled;
									break;
								default:
									break;
							}
							continue;
						}
						if (code === 4) this.modes.insert = enabled;
						else if (code === 20) this.modes.newline = enabled;
						else if (code === 3) {
							/* DECCOLM: honoring 132 columns would resize the panel; recorded only. */
						}
					}
				}

				/** Enter or leave the alternate screen buffer (`less`, `vim`, `top`). */
				_switchScreen(enabled, saveCursor) {
					if (enabled && !this.altActive) {
						if (saveCursor) this._saveCursor();
						this.savedLines = this.lines;
						this.savedScroll = {
							top: this.scrollTop,
							bottom: this.scrollBottom
						};
						this.altActive = true;
						this.lines = [];
						for (let i = 0; i < this.rows; i++) this.lines.push(newRow(this.cols));
						this.scrollTop = 0;
						this.scrollBottom = this.rows - 1;
						this._lastCell = null;
						this.cursor.x = 0;
						this.cursor.y = 0;
						this.pendingWrap = false;
					} else if (!enabled && this.altActive) {
						this.lines = this.savedLines || [newRow(this.cols)];
						this.altActive = false;
						if (this.savedScroll !== null) {
							this.scrollTop = this.savedScroll.top;
							this.scrollBottom = this.savedScroll.bottom;
							this.savedScroll = null;
						}
						this._lastCell = null;
						if (saveCursor) this._restoreCursor();
					}
				}

				_saveCursor() {
					this.savedCursor = {
						x: this.cursor.x,
						y: this.cursor.y,
						pen: Object.assign({}, this.pen),
						charset: this.activeCharset,
						origin: this.modes.origin,
						autowrap: this.modes.autowrap
					};
				}

				_restoreCursor() {
					if (this.savedCursor === null) return;
					this.cursor.x = Math.min(this.cols - 1, Math.max(0, this.savedCursor.x));
					this.cursor.y = Math.min(this.rows - 1, Math.max(0, this.savedCursor.y));
					this.pen = Object.assign({}, this.savedCursor.pen);
					this.activeCharset = this.savedCursor.charset;
					this.modes.origin = this.savedCursor.origin;
					this.modes.autowrap = this.savedCursor.autowrap;
					this.pendingWrap = false;
				}

				_setCursorStyle(param) {
					if (param === 0 || param === 1 || param === 2) this.cursorStyle = param === 1 ? "block" : param === 2 ? "block-hollow" : "block";
					else if (param === 3 || param === 4) this.cursorStyle = param === 3 ? "underline" : "underline-steady";
					else if (param === 5 || param === 6) this.cursorStyle = param === 5 ? "bar" : "bar-steady";
				}

				_windowOp(params) {
					const code = this._param(params, 0, 0);
					if (code === 18) this._response(`\u001b[8;${this.rows};${this.cols}t`);
				}

				_report(code, priv) {
					if (code === 5) return this._response("\u001b[0n");
					if (code === 6) {
						const y = this.cursor.y + (this.modes.origin ? this.scrollTop : 0) + 1;
						return this._response(`\u001b[${y};${this.cursor.x + 1}R`);
					}
					if (code === 0 && priv === ">") return;
				}

				/* --------------------------------------------------------------- OSC */
				_osc(text) {
					const semicolon = text.indexOf(";");
					const code = semicolon === -1 ? text : text.slice(0, semicolon);
					const body = semicolon === -1 ? "" : text.slice(semicolon + 1);
					if (code === "0" || code === "2") {
						this.title = body;
						if (typeof this.onTitle === "function") this.onTitle(body);
						return;
					}
					if (code === "4") {
						const parts = body.split(";");
						for (let i = 0; i + 1 < parts.length; i += 2) {
							const index = /^\d+$/u.test(parts[i]) ? Number(parts[i]) : null;
							const color = oscColor(parts[i + 1]);
							if (index !== null && index < 256 && color !== null) this.dynamic.indexed.set(index, color);
						}
						return;
					}
					if (code === "104") {
						if (body === "") this.dynamic.indexed.clear();
						else for (const part of body.split(";")) {
							const index = /^\d+$/u.test(part) ? Number(part) : null;
							if (index !== null) this.dynamic.indexed.delete(index);
						}
						return;
					}
					if (code === "10" || code === "11" || code === "12") {
						const color = oscColor(body);
						if (color !== null) {
							if (code === "10") this.dynamic.foreground = color;
							else if (code === "11") this.dynamic.background = color;
							else this.dynamic.cursor = color;
						}
						return;
					}
					if (code === "110") this.dynamic.foreground = null;
					else if (code === "111") this.dynamic.background = null;
					else if (code === "112") this.dynamic.cursor = null;
				}

				/* ------------------------------------------------------------ geometry */
				/**
				 * Resize the grid.
				 *
				 * The cursor's line is the anchor: it keeps its absolute line and its
				 * screen row as far as the new height allows, so a prompt stays at
				 * the bottom of a shorter screen and keeps its place on a taller one.
				 * The rows that no longer fit are the ones below the cursor; rows the
				 * new height needs are added blank at the bottom. A height that grows
				 * into an existing scrollback simply reveals it, because the screen is
				 * the tail of the buffer.
				 */
				resize(cols, rows) {
					const nextCols = Math.max(2, cols);
					const nextRows = Math.max(1, rows);
					if (nextCols !== this.cols) {
						for (const row of this.lines) {
							if (row.cells.length > nextCols) row.cells.length = nextCols;
							else while (row.cells.length < nextCols) row.cells.push(null);
							touch(row);
						}
						this.cols = nextCols;
						this._buildTabs();
					}
					if (nextRows !== this.rows) {
						const cursorAbs = this.lines.length - this.rows + this.cursor.y;
						const keepY = Math.min(this.cursor.y, nextRows - 1);
						const wantTop = Math.max(0, cursorAbs - keepY);
						const wantLines = wantTop + nextRows;
						while (this.lines.length > wantLines) this.lines.pop();
						while (this.lines.length < wantLines) this.lines.push(newRow(nextCols));
						this.rows = nextRows;
						if (this.altActive) {
							this.scrollTop = 0;
							this.scrollBottom = nextRows - 1;
						}
					}
					const limit = this.rows + this.scrollbackLimit;
					while (this.lines.length > limit) this.lines.shift();
					this.cursor.x = Math.min(this.cursor.x, this.cols - 1);
					this.cursor.y = Math.min(this.cursor.y, this.rows - 1);
					this.scrollTop = Math.min(this.scrollTop, this.rows - 1);
					this.scrollBottom = this.rows - 1;
					this._lastCell = null;
				}

				/** The 清屏 button: drop the visible screen and the scrollback. */
				clearAll() {
					this.lines = [];
					for (let i = 0; i < this.rows; i++) this.lines.push(newRow(this.cols));
					this.cursor.x = 0;
					this.cursor.y = 0;
					this.pendingWrap = false;
					this._lastCell = null;
				}
			}

			/** Parse `rgb:rr/gg/bb` and `#rgb`/`#rrggbb` OSC color payloads. */
			function oscColor(value) {
				if (typeof value !== "string" || value === "") return null;
				const rgb = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/iu.exec(value);
				if (rgb !== null) {
					const channels = rgb.slice(1);
					if (!channels.every((channel) => channel.length === channels[0].length)) return null;
					return "#" + channels.map((channel) => Math.round(Number.parseInt(channel, 16) * 255 / (16 ** channel.length - 1)).toString(16).padStart(2, "0")).join("");
				}
				if (!/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{9}|[\da-f]{12})$/iu.test(value)) return null;
				const width = (value.length - 1) / 3;
				const channels = [
					value.slice(1, width + 1),
					value.slice(width + 1, 2 * width + 1),
					value.slice(2 * width + 1)
				];
				return "#" + channels.map((channel) => Number.parseInt(channel.padEnd(2, "0").slice(0, 2), 16).toString(16).padStart(2, "0")).join("");
			}

			return {
				Screen,
				THEMES,
				cpWidth,
				BASE_256,
				FLAG_BOLD,
				FLAG_DIM,
				FLAG_ITALIC,
				FLAG_UNDERLINE,
				FLAG_BLINK,
				FLAG_INVERSE,
				FLAG_INVISIBLE,
				FLAG_STRIKE
			};
		}
		/* ==== @vt-core:end ==== */
		/* ==== @vt-input:begin — phone keyboard bridge (no DOM construction). Tested by test/vt-input.test.mjs ==== */
		/**
		 * The keyboard half of the terminal: one real, visible `<textarea>` that
		 * the Android IME owns, translated into PTY bytes.
		 *
		 * The rules that make a phone keyboard behave, and why each exists:
		 *
		 *   insertText is intercepted in `beforeinput` and swallowed
		 *     The field never accumulates text, so there is no local buffer to
		 *     diverge from the shell's echo — which is what makes keys "repeat" or
		 *     "vanish" in a naive implementation. One event, one send.
		 *   composition is never touched until it ends
		 *     A Chinese IME needs its composing text to live in the field; we read
		 *     it at `compositionend` and send it once. Clearing mid-composition
		 *     is what breaks pinyin input, so no handler here clears while
		 *     `composing` is set.
		 *   control keys are handled in `keydown`, printable text never is
		 *     Soft keyboards report letters with keyCode 229 or not at all; taking
		 *     text from `keydown` is how keys get duplicated.
		 *   deletes map to what a shell expects
		 *     Backspace sends DEL (0x7f), a long-press backspace (deleteWordBackward)
		 *     sends Ctrl+W, which is what Readline erases a word with.
		 *
		 * The controller owns no elements: it attaches to whatever textarea the
		 * view hands it, which keeps this file testable in plain Node.
		 */
		function createVtInput(options) {
			const element = options.element;
			const enabled = typeof options.enabled === "function" ? options.enabled : () => true;
			const applicationCursor = typeof options.applicationCursor === "function" ? options.applicationCursor : () => false;
			const bracketedPaste = typeof options.bracketedPaste === "function" ? options.bracketedPaste : () => false;
			const onState = typeof options.onState === "function" ? options.onState : () => {};

			const KEYS = {
				enter: "\r",
				backspace: "\u007f",
				tab: "\t",
				"shift-tab": "\u001b[Z",
				escape: "\u001b",
				up: "\u001b[A",
				down: "\u001b[B",
				right: "\u001b[C",
				left: "\u001b[D",
				home: "\u001b[H",
				end: "\u001b[F",
				pageup: "\u001b[5~",
				pagedown: "\u001b[6~",
				insert: "\u001b[2~",
				delete: "\u001b[3~",
				"ctrl-a": "\u0001",
				"ctrl-c": "\u0003",
				"ctrl-d": "\u0004",
				"ctrl-e": "\u0005",
				"ctrl-k": "\u000b",
				"ctrl-l": "\u000c",
				"ctrl-r": "\u0012",
				"ctrl-u": "\u0015",
				"ctrl-w": "\u0017",
				"ctrl-z": "\u001a",
				"ctrl-\\": "\u001c",
				f1: "\u001bOP",
				f2: "\u001bOQ",
				f3: "\u001bOR",
				f4: "\u001bOS",
				f5: "\u001b[15~",
				f6: "\u001b[17~",
				f7: "\u001b[18~",
				f8: "\u001b[19~",
				f9: "\u001b[20~",
				f10: "\u001b[21~",
				f11: "\u001b[23~",
				f12: "\u001b[24~"
			};
			const CURSOR_KEYS = new Set(["up", "down", "right", "left", "home", "end"]);
			const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "Dead", "Unidentified", "Process"]);

			let composing = false;
			let composingText = "";
			let ctrlArmed = false;
			let lastSent = null;
			let lastSentAt = 0;
			/* Set only between a composition end and the input event it produces, so
			 * an ordinary repeated insertion (paste twice) is never mistaken for an
			 * echo of the composition. */
			let echoGuard = false;
			/* A composition that a blur abandoned: the IME may still deliver a
			 * compositionend for it afterwards, and that text must not surface in
			 * a terminal the user has already left. */
			let abandoned = false;
			let clearTimer = null;
			let attached = false;
			/* A key pressed while the IME is still composing: the text goes first,
			 * the key follows, so Enter after a pinyin word runs the command
			 * instead of an empty line. */
			let pendingKey = null;
			let pendingTimer = null;
			const COMPOSITION_ECHO_MS = 400;

			function now() {
				return typeof Date.now === "function" ? Date.now() : 0;
			}

			/** True when `text` is the echo of a composition we just handed over. */
			function isEcho(text) {
				return text === lastSent && now() - lastSentAt < COMPOSITION_ECHO_MS;
			}

			function send(data) {
				if (data === "" || data === null || data === undefined) return;
				if (!enabled()) return;
				onState("send", data);
				options.onData(data);
			}

			/** Empty the field without touching the IME's composing region. */
			function clearBuffer() {
				if (composing) return;
				try {
					element.value = "";
					if (typeof element.setSelectionRange === "function") element.setSelectionRange(0, 0);
				} catch {
					/* the element may be detached mid-flight */
				}
			}

			/**
			 * Clear after the current task, and only if the IME did not write
			 * something newer meanwhile. `lastSent` is dropped with it so typing the
			 * same text twice in a row is sent twice.
			 */
			function clearBufferSoon() {
				if (clearTimer !== null) clearTimeout(clearTimer);
				const expected = element.value;
				clearTimer = setTimeout(() => {
					clearTimer = null;
					if (!composing && element.value === expected) clearBuffer();
					lastSent = null;
					echoGuard = false;
				}, 0);
			}

			/** Take whatever text the field holds and hand it to the PTY once. */
			function commitField() {
				const text = element.value;
				if (text === "" || isEcho(text)) return;
				send(text);
				lastSent = text;
				lastSentAt = now();
				clearBufferSoon();
			}

			/**
			 * Hold a key until the composition that was in flight has been sent.
			 * The IME commits on its own in practice; the timer is the path for the
			 * keyboards that do not.
			 */
			function deferKey(name) {
				pendingKey = name;
				if (pendingTimer !== null) clearTimeout(pendingTimer);
				pendingTimer = setTimeout(flushPendingKey, 60);
			}

			function flushPendingKey() {
				if (pendingTimer !== null) clearTimeout(pendingTimer);
				pendingTimer = null;
				const name = pendingKey;
				pendingKey = null;
				if (name === null) return;
				const sequence = sequenceFor(name);
				if (sequence !== null) send(sequence);
			}

			/** Ctrl+<letter> for a sticky on-screen Ctrl key and for real Ctrl events. */
			function controlByteFor(key) {
				if (typeof key !== "string" || key.length !== 1) return null;
				const upper = key.toUpperCase();
				if (upper >= "A" && upper <= "Z") return String.fromCharCode(upper.charCodeAt(0) - 64);
				if (key === "@" || key === " ") return "\u0000";
				if (key === "[") return "\u001b";
				if (key === "\\") return "\u001c";
				if (key === "]") return "\u001d";
				if (key === "^") return "\u001e";
				if (key === "_") return "\u001f";
				return null;
			}

			function sequenceFor(name) {
				if (CURSOR_KEYS.has(name) && applicationCursor()) return KEYS[name].replace("[", "O");
				return KEYS[name] === undefined ? null : KEYS[name];
			}

			/** Send a named key; the on-screen key row and `keydown` share this. */
			function press(name, fromUser) {
				const sequence = sequenceFor(name);
				if (sequence === null) return false;
				ctrlArmed = false;
				send(sequence);
				if (fromUser) clearBuffer();
				return true;
			}

			function armCtrl(value) {
				ctrlArmed = value === undefined ? !ctrlArmed : value;
				onState("ctrl", ctrlArmed);
				return ctrlArmed;
			}

			/** Printable text from the IME, the extra key row or a programmatic insert. */
			function insertText(text) {
				if (typeof text !== "string" || text === "") return;
				if (ctrlArmed && text.length === 1) {
					const byte = controlByteFor(text);
					ctrlArmed = false;
					onState("ctrl", false);
					if (byte !== null) {
						send(byte);
						return;
					}
				}
				ctrlArmed = false;
				send(text);
			}

			function pasteText(text) {
				if (typeof text !== "string" || text === "") return;
				const body = text.replace(/\r\n?/gu, "\n").replace(/\n/gu, "\r");
				if (bracketedPaste()) send(`\u001b[200~${body}\u001b[201~`);
				else send(body);
			}

			/* ------------------------------------------------------------ listeners */

			function onKeyDown(event) {
				if (event.isComposing || event.keyCode === 229) return;
				const key = event.key;
				if (typeof key !== "string" || MODIFIER_KEYS.has(key)) return;

				let name = null;
				if (key === "Enter") name = "enter";
				else if (key === "Backspace") name = "backspace";
				else if (key === "Tab") name = event.shiftKey ? "shift-tab" : "tab";
				else if (key === "Escape") name = "escape";
				else if (key === "ArrowUp") name = "up";
				else if (key === "ArrowDown") name = "down";
				else if (key === "ArrowLeft") name = "left";
				else if (key === "ArrowRight") name = "right";
				else if (key === "Home") name = "home";
				else if (key === "End") name = "end";
				else if (key === "PageUp") name = "pageup";
				else if (key === "PageDown") name = "pagedown";
				else if (key === "Insert") name = "insert";
				else if (key === "Delete") name = "delete";
				else if (/^F\d{1,2}$/u.test(key)) name = key.toLowerCase();

				/* A composition that is still open owns the field until it ends:
				 * let it commit, then send the key. Never clear the field here —
				 * re-writing an input mid-composition is what makes IMEs repeat
				 * characters on Android. */
				if (composing) {
					const pending = element.value;
					if (pending !== "" && !isEcho(pending)) {
						send(pending);
						lastSent = pending;
						lastSentAt = now();
					}
					event.preventDefault();
					if (name !== null) deferKey(name);
					return;
				}

				if (event.ctrlKey && !event.altKey && !event.metaKey) {
					const bytes = controlByteFor(key);
					if (bytes !== null) {
						event.preventDefault();
						send(bytes);
						return;
					}
				}
				if ((event.altKey || event.metaKey) && !event.ctrlKey && key.length === 1) {
					event.preventDefault();
					send(`\u001b${key}`);
					return;
				}
				if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) return;
				if (name === null) return;
				event.preventDefault();
				press(name, true);
			}

			function onBeforeInput(event) {
				if (event.isComposing || composing) return;
				const type = event.inputType;
				if (type === "insertText") {
					/* Swallow the insertion so the field stays empty; this is the
					 * single send for this keystroke. */
					event.preventDefault();
					const text = typeof event.data === "string" ? event.data : element.value;
					if (typeof text === "string" && text !== "") insertText(text);
					else commitField();
					return;
				}
				if (type === "deleteContentBackward" || type === "deleteContentForward") {
					event.preventDefault();
					send(type === "deleteContentBackward" ? "\u007f" : "\u001b[3~");
					return;
				}
				if (type === "deleteWordBackward") {
					event.preventDefault();
					send("\u0017");
					return;
				}
				if (type === "deleteSoftLineBackward" || type === "deleteHardLineBackward") {
					event.preventDefault();
					send("\u0015");
					return;
				}
				if (type === "insertLineBreak" || type === "insertParagraph") {
					event.preventDefault();
					send("\r");
					return;
				}
				/* insertFromPaste / insertReplacementText / drag: let them land, the
				 * `input` handler reads the field once. */
			}

			function onInput(event) {
				if (composing || event.isComposing) return;
				const value = typeof element.value === "string" ? element.value : "";
				if (value === "") return;
				if (echoGuard && isEcho(value)) {
					/* The echo of the composition we already sent. */
					echoGuard = false;
					clearBuffer();
					return;
				}
				echoGuard = false;
				send(value);
				clearBufferSoon();
			}

			function onCompositionStart() {
				composing = true;
				composingText = "";
				echoGuard = false;
				abandoned = false;
				onState("composing", "");
			}

			function onCompositionUpdate(event) {
				composingText = typeof event.data === "string" ? event.data : element.value;
				onState("composing", composingText);
			}

			function onCompositionEnd(event) {
				composing = false;
				if (abandoned) {
					abandoned = false;
					composingText = "";
					clearBuffer();
					onState("composing", "");
					return;
				}
				const value = typeof element.value === "string" ? element.value : "";
				const text = value !== "" ? value : (event.data ?? composingText);
				composingText = "";
				onState("composing", "");
				if (typeof text === "string" && text !== "" && !isEcho(text)) {
					send(text);
					lastSent = text;
					lastSentAt = now();
					echoGuard = true;
					clearBufferSoon();
				} else clearBuffer();
				flushPendingKey();
			}

			function onBlur() {
				/* A half-typed composition that lost focus must not be replayed. */
				if (composing) abandoned = true;
				composing = false;
				composingText = "";
				lastSent = null;
				echoGuard = false;
				pendingKey = null;
				if (pendingTimer !== null) clearTimeout(pendingTimer);
				pendingTimer = null;
				clearBuffer();
				onState("composing", "");
			}

			function attach() {
				if (attached || element === undefined || element === null) return;
				attached = true;
				element.addEventListener("keydown", onKeyDown);
				element.addEventListener("beforeinput", onBeforeInput);
				element.addEventListener("input", onInput);
				element.addEventListener("compositionstart", onCompositionStart);
				element.addEventListener("compositionupdate", onCompositionUpdate);
				element.addEventListener("compositionend", onCompositionEnd);
				element.addEventListener("blur", onBlur);
			}

			function detach() {
				if (!attached) return;
				attached = false;
				if (clearTimer !== null) clearTimeout(clearTimer);
				clearTimer = null;
				if (pendingTimer !== null) clearTimeout(pendingTimer);
				pendingTimer = null;
				pendingKey = null;
				element.removeEventListener("keydown", onKeyDown);
				element.removeEventListener("beforeinput", onBeforeInput);
				element.removeEventListener("input", onInput);
				element.removeEventListener("compositionstart", onCompositionStart);
				element.removeEventListener("compositionupdate", onCompositionUpdate);
				element.removeEventListener("compositionend", onCompositionEnd);
				element.removeEventListener("blur", onBlur);
			}

			return {
				attach,
				detach,
				press,
				armCtrl,
				insertText,
				pasteText,
				commitField,
				clearBuffer,
				send,
				keys: KEYS,
				isComposing: () => composing,
				isCtrlArmed: () => ctrlArmed,
				composingText: () => composingText
			};
		}
		/* ==== @vt-input:end ==== */
		/* ==== @vt-view:begin — DOM painter + keys row for one terminal screen ==== */
		/**
		 * Paint a {@link Screen} into a scrollable column of plain text rows.
		 *
		 * Plain text is the point: the browser's own selection, long-press handles
		 * and copy action are the only selection a phone has, and they only exist
		 * for real text nodes. Rows are reused and repainted from their `rev`
		 * counter, so a command that prints a thousand lines costs the rows that
		 * changed rather than the whole buffer.
		 *
		 * The caret and the IME pre-edit are drawn *in the text flow* at the cursor
		 * column, which keeps them aligned no matter how the platform's monospace
		 * fallback measures CJK glyphs, and the real `<textarea>` sits invisibly on
		 * the cursor's row so Android anchors the keyboard and its candidate window
		 * where the user is looking.
		 */
		function createVtView(options) {
			const doc = options.document;
			/* Swappable: the panel keeps one view (and therefore one textarea for
			 * the IME) and points it at the active tab's screen. */
			let screen = options.screen;
			const input = options.input;
			const t = options.t;
			/* The environment is injectable so the painter and the keyboard
			 * recovery can be driven from a test without a browser. */
			const win = options.window === undefined ? (typeof window === "undefined" ? null : window) : options.window;
			const nav = options.navigator === undefined ? (typeof navigator === "undefined" ? null : navigator) : options.navigator;
			const haptic = options.haptic === undefined || options.haptic === null ? { tap: () => false } : options.haptic;
			const flags = options.flags;
			const cellWidthOf = options.cellWidth;
			const onResize = options.onResize;
			const onMessage = options.onMessage === undefined ? () => {} : options.onMessage;
			const LINE_HEIGHT = 18;
			const MAX_ROWS = 2000;
			/* Focus recovery: four attempts inside a short window after a tap. The
			 * window is what stops the panel from fighting a user who closed the
			 * keyboard on purpose. */
			const KEYBOARD_ATTEMPTS = 4;
			const KEYBOARD_RETRY_MS = 90;
			const KEYBOARD_WINDOW_MS = 1500;
			const nowMs = options.now === undefined ? () => Date.now() : options.now;
			const requestFrame = typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (callback) => setTimeout(callback, 16);
			const BLANK_STYLE = Object.freeze({
				fg: null,
				bg: null,
				bold: false,
				dim: false,
				italic: false,
				underline: false,
				strike: false,
				blink: false
			});

			/* ------------------------------------------------------------- elements */
			const root = doc.createElement("div");
			root.className = "dsv-root";
			const viewport = doc.createElement("div");
			viewport.className = "dsv-viewport";
			const linesEl = doc.createElement("div");
			linesEl.className = "dsv-lines";
			/* The panel owns the textarea so the same element can be handed to
			 * the input controller; a standalone view makes its own. */
			const textarea = options.textarea === undefined ? doc.createElement("textarea") : options.textarea;
			textarea.className = "dsv-input";
			textarea.setAttribute("autocorrect", "off");
			textarea.setAttribute("autocapitalize", "none");
			textarea.setAttribute("autocomplete", "off");
			textarea.setAttribute("spellcheck", "false");
			textarea.setAttribute("enterkeyhint", "send");
			textarea.setAttribute("rows", "1");
			textarea.setAttribute("wrap", "off");
			textarea.setAttribute("aria-label", options.label);
			linesEl.appendChild(textarea);
			viewport.appendChild(linesEl);
			root.appendChild(viewport);

			/* ------------------------------------------------------------ key row */
			const keysEl = doc.createElement("div");
			keysEl.className = "dsv-keys";
			const KEY_ROW = [
				["escape", "Esc", "termKeyEsc"],
				["tab", "Tab", "termKeyTab"],
				["ctrl", "Ctrl", "termKeyCtrl"],
				["left", "\u2190", "termKeyLeft"],
				["up", "\u2191", "termKeyUp"],
				["down", "\u2193", "termKeyDown"],
				["right", "\u2192", "termKeyRight"],
				["ctrl-c", "^C", "termKeyInterrupt"],
				["paste", null, "termPaste"],
				["copy", null, "termCopy"]
			];
			let ctrlButton = null;
			for (const [name, glyph, labelKey] of KEY_ROW) {
				const button = doc.createElement("button");
				button.type = "button";
				button.className = "dsv-key";
				button.textContent = glyph === null ? t(labelKey) : glyph;
				button.setAttribute("aria-label", t(labelKey));
				/* Never let the key row take focus: on Android that closes the
				 * keyboard the user needs for the next character. */
				button.addEventListener("pointerdown", (event) => {
					if (typeof event.preventDefault === "function") event.preventDefault();
				});
				button.addEventListener("click", () => {
					haptic.tap();
					activateKey(name, button);
				});
				keysEl.appendChild(button);
				if (name === "ctrl") ctrlButton = button;
			}
			root.appendChild(keysEl);

			/* -------------------------------------------------------------- state */
			const nodes = [];
			let nodesStart = 0;
			let composingText = "";
			let paintQueued = false;
			let follow = true;
			let cellWidth = 0;
			let focused = false;
			let destroyed = false;
			let focusAttempts = 0;
			let focusTimer = null;
			let wantKeyboardUntil = -Infinity;
			let selfBlur = false;

			const jump = doc.createElement("button");
			jump.type = "button";
			jump.className = "dsv-jump";
			jump.textContent = "\u2193";
			jump.setAttribute("aria-label", t("termJumpToBottom"));
			jump.addEventListener("click", () => {
				haptic.tap();
				scrollToBottom();
			});
			viewport.appendChild(jump);

			function activateKey(name, button) {
				if (name === "ctrl") {
					button.setAttribute("aria-pressed", input.armCtrl() ? "true" : "false");
					return;
				}
				if (name === "paste") {
					const clipboard = nav === null ? undefined : nav.clipboard;
					if (clipboard === undefined || typeof clipboard.readText !== "function") {
						onMessage(t("termPasteHint"));
						return;
					}
					clipboard.readText().then((text) => input.pasteText(text), () => onMessage(t("termPasteHint")));
					return;
				}
				if (name === "copy") {
					const selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
					const text = selection === null ? "" : String(selection);
					if (text === "") {
						onMessage(t("termCopyHint"));
						return;
					}
					const clipboard = nav === null ? undefined : nav.clipboard;
					if (clipboard === undefined || typeof clipboard.writeText !== "function") {
						onMessage(t("termCopyHint"));
						return;
					}
					clipboard.writeText(text).then(() => onMessage(t("termCopied")), () => onMessage(t("termCopyHint")));
					return;
				}
				input.press(name, true);
			}

			/* ------------------------------------------------------------- theme */
			function applyTheme(name) {
				root.setAttribute("data-dsv-theme", name);
				root.style.setProperty("--dsv-bg", screen.defaultBg);
				root.style.setProperty("--dsv-fg", screen.defaultFg);
				root.style.setProperty("--dsv-cursor", screen.cursorColor);
				root.style.setProperty("--dsv-cursor-accent", name === "light" ? "#ffffff" : "#10131a");
				root.style.setProperty("--dsv-selection", screen.palette.selectionBg);
				root.style.setProperty("--dsv-compose", name === "light" ? "#dbe7ff" : "#243050");
			}

			/* ------------------------------------------------------------ painting */
			function measureCellWidth() {
				if (cellWidth > 0) return cellWidth;
				const probe = doc.createElement("span");
				probe.style.position = "absolute";
				probe.style.visibility = "hidden";
				probe.style.whiteSpace = "pre";
				probe.style.font = "inherit";
				probe.textContent = "0".repeat(40);
				linesEl.appendChild(probe);
				const width = probe.getBoundingClientRect().width / 40;
				linesEl.removeChild(probe);
				cellWidth = width > 0 ? width : 7.8;
				return cellWidth;
			}

			function styleFor(cell) {
				const value = cell.flags;
				let fg = screen.colorOf(cell.fg, screen.defaultFg);
				let bg = cell.bg === null || cell.bg === undefined ? null : screen.colorOf(cell.bg, null);
				if ((value & flags.FLAG_INVERSE) !== 0) {
					const swap = fg;
					fg = bg === null ? screen.defaultBg : bg;
					bg = swap;
				}
				if ((value & flags.FLAG_INVISIBLE) !== 0) fg = "transparent";
				return {
					fg,
					bg,
					bold: (value & flags.FLAG_BOLD) !== 0,
					dim: (value & flags.FLAG_DIM) !== 0,
					italic: (value & flags.FLAG_ITALIC) !== 0,
					underline: (value & flags.FLAG_UNDERLINE) !== 0,
					strike: (value & flags.FLAG_STRIKE) !== 0,
					blink: (value & flags.FLAG_BLINK) !== 0
				};
			}

			function sameStyle(left, right) {
				return left.fg === right.fg
					&& left.bg === right.bg
					&& left.bold === right.bold
					&& left.dim === right.dim
					&& left.italic === right.italic
					&& left.underline === right.underline
					&& left.strike === right.strike
					&& left.blink === right.blink;
			}

			/** Build one style run into a span, or plain text when it has no styling. */
			function spanFor(part) {
				const span = doc.createElement("span");
				span.textContent = part.text;
				const style = part.style;
				if (style !== BLANK_STYLE) {
					span.style.color = style.fg;
					if (style.bg !== null && style.bg !== undefined) span.style.background = style.bg;
					if (style.bold) span.style.fontWeight = "600";
					if (style.italic) span.style.fontStyle = "italic";
					if (style.dim) span.style.opacity = "0.72";
					if (style.blink) span.style.animation = "dsv-blink 1s step-end infinite";
					if (style.underline || style.strike) {
						const decorations = [];
						if (style.underline) decorations.push("underline");
						if (style.strike) decorations.push("line-through");
						span.style.textDecoration = decorations.join(" ");
					}
				}
				return span;
			}

			/** Cut a row into spans: one per style run, caret and pre-edit included. */
			function paintRow(el, row, caret) {
				const cols = screen.cols;
				const cellAt = (index) => row.cells[index] || null;
				const glyphAt = (index) => {
					const cell = cellAt(index);
					if (cell === null || cell.w === 0) return " ";
					return cell.ch === "" ? " " : cell.ch;
				};
				/* The last column worth drawing: content, a colored blank, or the
				 * caret. Everything after it is empty screen. */
				let lastX = -1;
				for (let x = 0; x < cols; x++) {
					const cell = cellAt(x);
					if (cell === null) continue;
					const hasText = cell.w !== 0 && cell.ch !== "" && cell.ch !== " ";
					const hasBackground = cell.bg !== null && cell.bg !== undefined;
					if (hasText || hasBackground) lastX = x;
				}
				if (caret !== null) lastX = Math.max(lastX, caret.column);
				const parts = [];
				let pending = null;
				const flush = () => {
					if (pending !== null) {
						parts.push(pending);
						pending = null;
					}
				};
				const pushText = (text, style) => {
					if (text === "") return;
					if (pending !== null && sameStyle(pending.style, style)) {
						pending.text += text;
						return;
					}
					flush();
					pending = {
						text,
						style
					};
				};
				const pushNode = (node) => {
					flush();
					parts.push({ node });
				};
				let x = 0;
				while (x <= lastX && x < cols) {
					if (caret !== null && x === caret.column) {
						if (caret.text !== "") {
							const node = doc.createElement("span");
							node.className = "dsv-compose";
							node.textContent = caret.text;
							pushNode(node);
							x += Math.max(1, caret.width);
							continue;
						}
						const node = doc.createElement("span");
						node.className = focused ? "dsv-caret" : "dsv-caret-off";
						node.textContent = glyphAt(x);
						pushNode(node);
						x += 1;
						continue;
					}
					const cell = cellAt(x);
					if (cell === null) {
						pushText(" ", BLANK_STYLE);
						x += 1;
						continue;
					}
					if (cell.w === 0) {
						x += 1;
						continue;
					}
					pushText(cell.ch === "" ? " " : cell.ch, styleFor(cell));
					x += cell.w === 2 ? 2 : 1;
				}
				flush();
				const children = [];
				for (const part of parts) {
					if (part.node !== undefined) children.push(part.node);
					else if (part.style === BLANK_STYLE) {
						const span = doc.createElement("span");
						span.textContent = part.text;
						children.push(span);
					} else children.push(spanFor(part));
				}
				el.replaceChildren(...children);
			}

			/** Repaint after the current task, at most once per frame. */
			function schedule() {
				if (paintQueued || destroyed) return;
				paintQueued = true;
				requestFrame(() => {
					paintQueued = false;
					if (!destroyed) paintNow();
				});
			}

			function composingWidth() {
				let width = 0;
				for (const character of composingText) width += Math.max(0, cellWidthOf(character.codePointAt(0)));
				return Math.max(1, width);
			}

			function paintNow() {
				const total = screen.lineCount;
				const start = Math.max(0, total - MAX_ROWS);
				while (nodes.length > 0 && nodesStart < start) {
					linesEl.removeChild(nodes[0].el);
					nodes.shift();
					nodesStart++;
				}
				while (nodes.length > 0 && nodesStart + nodes.length > total) {
					linesEl.removeChild(nodes.pop().el);
				}
				if (nodes.length === 0) nodesStart = start;
				while (nodesStart + nodes.length < total) {
					const el = doc.createElement("div");
					el.className = "dsv-row";
					linesEl.insertBefore(el, textarea);
					nodes.push({
						el,
						row: null,
						rev: -1,
						caret: false,
						cursorX: -1,
						focused: null,
						composing: ""
					});
				}

				const cursorAbs = screen.cursorAbs;
				const caretText = composingText;
				const cursorVisible = screen.cursorVisible !== false;
				for (let i = 0; i < nodes.length; i++) {
					const absolute = nodesStart + i;
					const row = screen.lines[absolute];
					if (row === undefined) continue;
					const node = nodes[i];
					/* The caret is not part of the row content: a program that only
					 * moves the cursor (Readline arrows, a pager redraw) changes no
					 * cell, so the cursor position has to be part of the repaint key
					 * or the painted caret keeps sitting where it was. */
					const caretOn = absolute === cursorAbs && cursorVisible;
					const caretColumn = caretOn ? Math.max(0, Math.min(screen.cols - 1, screen.cursor.x)) : -1;
					const composing = caretOn ? caretText : "";
					if (node.row === row && node.rev === row.rev && node.caret === caretOn && node.cursorX === caretColumn && node.composing === composing && node.focused === focused) continue;
					node.row = row;
					node.rev = row.rev;
					node.caret = caretOn;
					node.cursorX = caretColumn;
					node.composing = composing;
					node.focused = focused;
					paintRow(node.el, row, caretOn ? {
						column: caretColumn,
						text: caretText,
						width: composingWidth()
					} : null);
				}

				/* Park the invisible textarea on the cursor row so the IME anchors
				 * where the user is typing. */
				const offset = cursorAbs - nodesStart;
				textarea.style.top = `${Math.max(0, offset) * LINE_HEIGHT}px`;
				if (follow) viewport.scrollTop = viewport.scrollHeight;
			}

			/* -------------------------------------------------------------- fitting */
			function fit() {
				const width = viewport.clientWidth - 16;
				const height = viewport.clientHeight - 12;
				if (width <= 0 || height <= 0) return;
				const cols = Math.max(20, Math.min(400, Math.floor(width / measureCellWidth())));
				const rows = Math.max(5, Math.min(200, Math.floor(height / LINE_HEIGHT)));
				if (cols === screen.cols && rows === screen.rows) return;
				screen.resize(cols, rows);
				schedule();
				onResize(cols, rows);
			}

			function scrollToBottom() {
				follow = true;
				viewport.scrollTop = viewport.scrollHeight;
			}

			/* ------------------------------------------------------- soft keyboard */
			/**
			 * Whether the on-screen keyboard is up, judged by how much of the
			 * layout viewport the visual viewport lost. `null` when the browser
			 * has no visual viewport to ask (tests, old WebViews).
			 */
			function keyboardOpen() {
				if (win === null || win.visualViewport === undefined || win.visualViewport === null) return null;
				if (typeof win.innerHeight !== "number") return null;
				return win.innerHeight - win.visualViewport.height > 120;
			}

			/** Bring the cursor row into view so the focused field is on screen. */
			function ensureCaretVisible() {
				const offset = (screen.cursorAbs - nodesStart) * LINE_HEIGHT;
				const top = viewport.scrollTop;
				const height = viewport.clientHeight;
				if (height <= 0) return;
				if (offset < top + LINE_HEIGHT) viewport.scrollTop = Math.max(0, offset - LINE_HEIGHT);
				else if (offset + LINE_HEIGHT > top + height - LINE_HEIGHT) viewport.scrollTop = offset + LINE_HEIGHT * 2 - height;
			}

			/**
			 * Show the keyboard, and keep trying until it is really there.
			 *
			 * The failure this exists for: an Android WebView keeps
			 * `document.activeElement` on the textarea after the user dismisses the
			 * keyboard, and a second `focus()` on an already-focused element is a
			 * no-op — so the keyboard never comes back. Forcing a blur/focus
			 * transition is what makes showSoftInput fire again, and the bounded
			 * retries cover the WebViews that need the field focused *after* the
			 * layout settles. Every attempt is logged, and giving up says so in the
			 * panel instead of failing silently.
			 */
			function requestKeyboard(reason) {
				if (destroyed) return;
				wantKeyboardUntil = nowMs() + KEYBOARD_WINDOW_MS;
				focusAttempts = 0;
				attemptFocus(reason);
			}

			function attemptFocus(reason) {
				if (destroyed) return;
				if (focusTimer !== null) {
					clearTimeout(focusTimer);
					focusTimer = null;
				}
				const active = doc.activeElement;
				const open = keyboardOpen();
				if (active === textarea && open !== false) {
					focusAttempts = 0;
					return;
				}
				if (active === textarea) {
					/* Focused but the keyboard is gone: force the transition. */
					selfBlur = true;
					try {
						textarea.blur();
					} catch {
						/* a detached field cannot blur */
					}
					selfBlur = false;
				}
				ensureCaretVisible();
				try {
					textarea.focus({ preventScroll: true });
				} catch {
					textarea.focus();
				}
				focusAttempts += 1;
				if (options.log !== undefined) options.log(`keyboard: attempt ${focusAttempts} (${reason}) active=${doc.activeElement === textarea} open=${String(keyboardOpen())}`);
				if (focusAttempts >= KEYBOARD_ATTEMPTS) {
					if (doc.activeElement !== textarea) onMessage(t("termKeyboardHint"));
					return;
				}
				focusTimer = setTimeout(() => attemptFocus(reason), KEYBOARD_RETRY_MS);
			}

			/* ------------------------------------------------------------ listeners */
			viewport.addEventListener("scroll", () => {
				follow = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < LINE_HEIGHT * 2;
				jump.setAttribute("data-visible", follow ? "false" : "true");
			});
			viewport.addEventListener("pointerdown", () => {
				/* A tap anywhere on the screen brings the keyboard back. */
				requestKeyboard("tap");
			});
			textarea.addEventListener("focus", () => {
				focused = true;
				schedule();
			});
			textarea.addEventListener("blur", () => {
				focused = false;
				if (!selfBlur) focusAttempts = 0;
				schedule();
			});
			/* The keyboard can be dismissed without touching the page (system back,
		 * gesture). While the user's tap is still fresh, ask for it again; after
		 * that window we assume they meant to close it. */
			const onViewportResize = () => {
				if (destroyed) return;
				if (nowMs() > wantKeyboardUntil) return;
				if (keyboardOpen() !== false) return;
				if (doc.activeElement !== textarea) return;
				attemptFocus("viewport-resize");
			};
			const resizeTarget = win === null ? null : (win.visualViewport === undefined ? win : win.visualViewport);
			if (resizeTarget !== null && typeof resizeTarget.addEventListener === "function") resizeTarget.addEventListener("resize", onViewportResize);

			return {
				element: root,
				viewport,
				textarea,
				schedule,
				paintNow,
				fit,
				applyTheme,
				showCtrlState(value) {
					if (ctrlButton !== null) ctrlButton.setAttribute("aria-pressed", value ? "true" : "false");
				},
				setComposing(text) {
					if (text === composingText) return;
					composingText = text;
					schedule();
				},
				/** Point the view at another tab's screen. */
				setScreen(next) {
					if (next === screen || next === undefined || next === null) return;
					screen = next;
					for (const node of nodes) linesEl.removeChild(node.el);
					nodes.length = 0;
					nodesStart = 0;
					follow = true;
					viewport.scrollTop = 0;
					composingText = "";
					fit();
					paintNow();
				},
				screen: () => screen,
				focus() {
					requestKeyboard("focus");
				},
				requestKeyboard,
				/** Test and diagnostic seam: focus attempts in the current request. */
				focusAttempts: () => focusAttempts,
				keyboardOpen,
				scrollToBottom,
				isFollowing: () => follow,
				destroy() {
					destroyed = true;
					if (focusTimer !== null) clearTimeout(focusTimer);
					focusTimer = null;
					if (resizeTarget !== null && typeof resizeTarget.removeEventListener === "function") resizeTarget.removeEventListener("resize", onViewportResize);
					if (input !== undefined && input !== null) input.detach();
					root.remove();
				}
			};
		}
		/* ==== @vt-view:end ==== */
		/* ==== @vt-store:begin — terminal tab roster (pure logic). Tested by test/vt-store.test.mjs ==== */
		/**
		 * The terminal's tab roster: one entry per live PTY, one active tab.
		 *
		 * Why a store instead of component state: the sidebar's 终端 button
		 * remounts this panel every time it is pressed, and the panel used to
		 * connect the PTY service in its mount effect — so every press spawned
		 * another shell, and the guest PTY service keeps a session until it is
		 * told to stop (measured: five presses, five new shells). The roster lives
		 * one level up, in the plugin, so opening the panel again *activates* the
		 * terminal that is already there.
		 *
		 * Sessions are opaque to this file: `open` makes one, `close` ends it. That
		 * keeps the roster testable without a browser, a socket, or a shell.
		 */
		function createTerminalStore(options) {
			const open = options.open;
			const maxTabs = options.maxTabs === undefined ? 4 : options.maxTabs;
			const onLimit = options.onLimit === undefined ? () => {} : options.onLimit;
			const listeners = new Set();
			let sessions = [];
			let activeId = null;

			function notify() {
				for (const listener of [...listeners]) {
					try {
						listener();
					} catch {
						/* one bad subscriber must not stop the roster */
					}
				}
			}

			function indexOf(id) {
				for (let i = 0; i < sessions.length; i++) if (sessions[i].id === id) return i;
				return -1;
			}

			/**
			 * The only entry point the panel needs: reuse what is there, open one
			 * only when the roster is empty.
			 */
			function ensure() {
				if (sessions.length === 0) return openTab();
				if (indexOf(activeId) === -1) activeId = sessions[sessions.length - 1].id;
				notify();
				return activeId;
			}

			function openTab() {
				if (sessions.length >= maxTabs) {
					onLimit(maxTabs);
					notify();
					return null;
				}
				const session = open();
				if (session === null || session === undefined) return null;
				sessions = [...sessions, session];
				activeId = session.id;
				notify();
				return session.id;
			}

			function activate(id) {
				if (indexOf(id) === -1 || activeId === id) return false;
				activeId = id;
				notify();
				return true;
			}

			function close(id) {
				const index = indexOf(id);
				if (index === -1) return false;
				const [removed] = sessions.slice(index, index + 1);
				sessions = [...sessions.slice(0, index), ...sessions.slice(index + 1)];
				if (removed !== undefined && typeof removed.close === "function") removed.close();
				if (activeId === id) {
					const next = sessions[Math.min(index, sessions.length - 1)];
					activeId = next === undefined ? null : next.id;
				}
				notify();
				return true;
			}

			function closeAll() {
				const closing = sessions;
				sessions = [];
				activeId = null;
				for (const session of closing) if (typeof session.close === "function") session.close();
				notify();
			}

			return {
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				/** Plain data for the renderer: the sessions themselves stay here. */
				snapshot() {
					return {
						activeId,
						canOpen: sessions.length < maxTabs,
						maxTabs,
						tabs: sessions.map((session) => ({
							id: session.id,
							title: session.title,
							status: session.status
						}))
					};
				},
				ensure,
				openTab,
				activate,
				close,
				closeAll,
				/** The session object behind a tab (screen, socket, link, …). */
				session(id) {
					const index = indexOf(id === undefined ? activeId : id);
					return index === -1 ? null : sessions[index];
				},
				activeId: () => activeId,
				count: () => sessions.length,
				/** A session changed its own status: repaint the tab strip. */
				touch: notify,
				rename(id, title) {
					const index = indexOf(id);
					if (index === -1) return false;
					sessions[index].title = title;
					notify();
					return true;
				}
			};
		}
		/* ==== @vt-store:end ==== */
		/* ====================================================================
		 * Terminal
		 * --------------------------------------------------------------------
		 * A rail button plus a `main` panel. The shell is not the harness's
		 * own PTY plumbing: it is android-pty, a small node-pty service
		 * running inside the same PRoot guest (see
		 * /opt/dsh/android/pty-server.mjs). Typing here reaches exactly the
		 * same filesystem and processes the agent's tools do, which is the
		 * whole point of a terminal on this surface — and it works without an
		 * active session, which the built-in right-pane terminal requires.
		 * ================================================================== */

		const TERMINAL_PANEL = "android-terminal";
		const TERMINAL_SCROLLBACK = 1000;
		const TERMINAL_MAX_TABS = 4;

		/** The guest PTY endpoint the app injects into the WebView. */
		function ptyEndpoint() {
			const api = globalThis.DshAndroid;
			if (api && api.pty && api.pty.url) return api.pty;
			return null;
		}

		/**
		 * Which palette the harness is painting right now.
		 *
		 * The layout's theme presenter publishes the resolved scheme twice: on
		 * `<html>` as `data-ds-theme-source` and on `<body>` as
		 * `data-ds-dark-theme`. This panel used to look for the dark attribute on
		 * `<html>` — where it is never written — and then fall back to
		 * `prefers-color-scheme`, which answers for the *phone's* dark mode. On a
		 * phone set to dark with the app set to light, that made the terminal
		 * black inside a white UI. The boot script writes the same two attributes,
		 * so this reads them the same way in both worlds.
		 */
		function pageThemeName() {
			const root = document.documentElement;
			const source = root.dataset === undefined ? undefined : root.dataset.dsThemeSource;
			if (source === "light" || source === "dark") return source;
			if (document.body !== null && document.body.hasAttribute("data-ds-dark-theme")) return "dark";
			if (root.hasAttribute("data-ds-dark-theme")) return "dark";
			if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
			return "light";
		}

		/** The terminal panel paints into the page, so it wears the page's palette. */
		function terminalThemeName() {
			return pageThemeName();
		}

		/**
		 * The page's own background colour, as `#rrggbb`, or null.
		 *
		 * The app cannot see the DOM, so its bars were filled with a *guess* at the
		 * harness palette (a hardcoded #0E0F12 for dark). The page's real dark is a
		 * little lighter than that, which is exactly why the bars read as two black
		 * edges against the page. Take the first ancestor that actually paints an
		 * opaque background and hand the app that colour; a translucent one is
		 * composited onto black or white first, and anything unreadable returns null so
		 * the app keeps its own fallback.
		 */
		/**
		 * The page's own background *scrim*: colour and alpha, as the harness paints it.
		 *
		 * The bars have to look like the middle, and the middle is this scrim over the
		 * blurred wallpaper - so the app paints the bars with the same scrim instead of a
		 * constant of its own. That constant was darker than the harness scrim, which is
		 * exactly why the top and bottom strips read as two black bars against a
		 * see-through page.
		 */
		function pageScrim() {
			const parse = (value) => {
				const match = /rgba?\(([^)]+)\)/.exec(String(value ?? ""));
				if (match === null) return null;
				const parts = match[1].split(",").map((part) => parseFloat(part.trim()));
				if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
				return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
			};
			const hex = (r, g, b) => "#" + [r, g, b]
				.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
				.join("");
			const candidates = [
				document.body,
				document.querySelector("#root"),
				document.querySelector(".ds-root"),
				document.documentElement
			];
			for (const node of candidates) {
				if (node === null || node === undefined) continue;
				const colour = parse(getComputedStyle(node).backgroundColor);
				if (colour === null || colour.a <= 0) continue;
				// Report the scrim as painted, alpha included: the app needs the alpha to
				// match this layer in the bars.
				return {
					bg: hex(colour.r, colour.g, colour.b),
					alpha: colour.a,
					opaque: colour.a >= 1
				};
			}
			return null;
		}

		/**
		 * Tell the app which palette the page is painting.
		 *
		 * The status and navigation bars are Android's, not the page's, and the app's
		 * window follows the *phone's* dark mode — which routinely disagrees with the
		 * harness setting. That is what left a white bar strip above and below a dark
		 * page. The app cannot read the DOM, so we push the answer: once at startup,
		 * then only when it actually changes. No polling — the observer fires on the
		 * attributes the layout writes, and a value the app already has is not resent.
		 */
		function installThemeReport() {
			// The bundle is also loaded by its own test harness (and could be
			// loaded by an SSR shell) where there is no DOM at all. There is no
			// window chrome to paint there either, so the reporter is simply not
			// installed instead of taking apply() down with a ReferenceError.
			if (typeof MutationObserver !== "function" || typeof document === "undefined") return { disconnect() {} };
			let sent = null;
			let failures = 0;
			let bodyObserver = null;
			const attachBody = () => {
				if (bodyObserver !== null || document.body === null) return;
				bodyObserver = new MutationObserver(sync);
				bodyObserver.observe(document.body, {
					attributes: true,
					attributeFilter: ["data-ds-dark-theme"]
				});
			};
			function sync() {
				attachBody();
				const dark = pageThemeName() === "dark";
				const scrim = pageScrim();
				const key = dark + "|" + JSON.stringify(scrim);
				if (key === sent) return;
				call("/theme", {
					dark,
					bg: scrim === null ? null : scrim.bg,
					alpha: scrim === null ? 1 : scrim.alpha,
					opaque: scrim === null ? false : scrim.opaque
				}).then(() => {
					sent = key;
					failures = 0;
				}).catch(() => {
					// The bridge may not be injected yet; an older app has no
					// `/theme` at all, so give up after a few tries instead of
					// hammering it.
					if (failures++ < 3) window.setTimeout(sync, 1500);
				});
			}
			const observer = new MutationObserver(sync);
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["data-ds-theme-source", "data-ds-dark-theme"]
			});
			const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
			if (media !== null && typeof media.addEventListener === "function") media.addEventListener("change", sync);
			sync();
			return {
				disconnect() {
					observer.disconnect();
					if (bodyObserver !== null) bodyObserver.disconnect();
					if (media !== null && typeof media.removeEventListener === "function") media.removeEventListener("change", sync);
				}
			};
		}

		/* ==== @terminal-tabs:begin — the AI's relay into the tab store. ==== */
		/**
		 * The app cannot touch the terminal tabs: they are state inside this
		 * bundle's store. So the app queues commands (`GET
		 * /terminal/tabs/commands`) and this relay executes them against the
		 * store, then reports the roster back (`POST /terminal/tabs/report`).
		 * Only `open`/`activate`/`close` are page commands: `list` is answered by
		 * the app from its cached last report, so it never reaches this loop.
		 *
		 * The report is not just bookkeeping: it carries one `results` entry per
		 * command id, and the app wakes the waiting `/ai/terminal/tabs` call with
		 * it. A command that is received but never reported leaves the AI call
		 * hanging until the app's own timeout, which is why results are sent
		 * immediately while roster-only updates are throttled.
		 *
		 * Polling continues while the page is hidden on purpose: the browser may
		 * throttle the timer, but a terminal tab opened from the ball's thread
		 * should not wait for the user to come back to the DSH page. The poll also
		 * doubles as a heartbeat: an idle page still reports the unchanged roster
		 * every few seconds, because the app marks its cache stale after ~15s
		 * without a report and `terminal_tabs list` would then answer stale:true.
		 */
		const TERMINAL_TABS_POLL_MS = 900;
		const TERMINAL_TABS_REPORT_MS = 350;
		const TERMINAL_TABS_HEARTBEAT_MS = 5000;
		const TERMINAL_TABS_ERROR_MS = 3000;
		const TERMINAL_TABS_BACKOFF_MS = 10000;

		/**
		 * Install the relay for one store.
		 *
		 * Returns a `{ disconnect }` object shaped like the other installers, so
		 * `ctx.effect` owns the cleanup and a plugin unload stops every timer.
		 */
		function installTerminalTabs(store) {
			// No `bridge() === null` early return: the app may inject
			// window.DshAndroid after the plugin has already started, and a relay
			// installed once must come up with it. `poll()` retries on a missing
			// bridge, so the first successful poll performs the initial report.
			let stopped = false;
			let pollTimer = null;
			let reportTimer = null;
			let pollFailures = 0;
			let lastReportKey = "";
			let lastReportAttemptAt = 0;
			let reportChain = Promise.resolve();

			const schedulePoll = (delay) => {
				if (stopped) return;
				if (pollTimer !== null) clearTimeout(pollTimer);
				pollTimer = setTimeout(poll, delay);
			};

			/** The report body: exactly the app's shape, with "" for "no active tab". */
			const payloadFor = (results) => {
				const snapshot = store.snapshot();
				return {
					tabs: snapshot.tabs,
					activeId: snapshot.activeId === null || snapshot.activeId === undefined ? "" : snapshot.activeId,
					results
				};
			};

			/** Serialize reports; a stale roster is dropped rather than queued. */
			const sendReport = (results, force) => {
				const payload = payloadFor(results);
				const key = JSON.stringify({ tabs: payload.tabs, activeId: payload.activeId });
				if (results.length === 0 && force !== true) {
					if (key === lastReportKey) return;
				}
				lastReportAttemptAt = Date.now();
				reportChain = reportChain
					.then(() => call("/terminal/tabs/report", payload))
					.then(() => {
						lastReportKey = key;
					})
					.catch(() => {
						/* the next poll or roster change reports the fresh state */
					});
			};

			/** Run one command against the store; the result is keyed by command id. */
			const runCommand = (command) => {
				const id = command !== null && typeof command === "object" ? command.id : undefined;
				const action = command !== null && typeof command === "object" && typeof command.action === "string"
					? command.action
					: "";
				const target = command !== null && typeof command === "object" && typeof command.target === "string"
					? command.target
					: "";
				const failed = (message) => ({ id, ok: false, error: message });
				try {
					if (action === "open") {
						if (store.count() >= TERMINAL_MAX_TABS) return failed("标签页已满（最多 " + TERMINAL_MAX_TABS + " 个）");
						const opened = store.openTab();
						return opened === null
							? failed("打不开新标签页：本页没有终端服务（需要从 DSH 应用打开本页）")
							: { id, ok: true, error: "" };
					}
					if (action === "activate") {
						if (target === "") return failed("activate 缺少目标标签页 id");
						if (store.session(target) === null) return failed("没有这个标签页");
						store.activate(target);
						return { id, ok: true, error: "" };
					}
					if (action === "close") {
						if (target === "") return failed("close 缺少目标标签页 id");
						return store.close(target) ? { id, ok: true, error: "" } : failed("没有这个标签页");
					}
					return failed("不认识的标签页操作：" + action);
				} catch (error) {
					return failed(String(error && error.message ? error.message : error));
				}
			};

			const poll = async () => {
				if (stopped) return;
				if (bridge() === null) {
					schedulePoll(TERMINAL_TABS_ERROR_MS);
					return;
				}
				let answer;
				try {
					answer = await call("/terminal/tabs/commands");
					pollFailures = 0;
				} catch (error) {
					pollFailures += 1;
					schedulePoll(pollFailures > 3 ? TERMINAL_TABS_BACKOFF_MS : TERMINAL_TABS_ERROR_MS);
					return;
				}
				if (stopped) return;
				const commands = Array.isArray(answer?.commands) ? answer.commands : [];
				if (commands.length > 0) {
					sendReport(commands.map(runCommand));
				} else if (Date.now() - lastReportAttemptAt >= TERMINAL_TABS_HEARTBEAT_MS) {
					// Same roster, forced past the dedupe: the app treats every report
					// as proof the page is alive and clears `stale` with it.
					sendReport([], true);
				}
				schedulePoll(TERMINAL_TABS_POLL_MS);
			};

			// A tab opened/closed/renamed by the user is worth telling the app
			// about, but the store touches on every PTY output repaint, so the
			// change report is throttled instead of sent on every notification.
			const unsubscribe = store.subscribe(() => {
				if (stopped) return;
				if (reportTimer !== null) clearTimeout(reportTimer);
				reportTimer = setTimeout(() => {
					reportTimer = null;
					if (!stopped) sendReport([]);
				}, TERMINAL_TABS_REPORT_MS);
			});

			// First roster, then commands: the app's `list` should not have to wait
			// for a tab to change before it knows what is open. Before the bridge
			// exists this report simply fails; the heartbeat sends it once polling
			// starts working.
			sendReport([]);
			poll();

			return {
				disconnect() {
					stopped = true;
					unsubscribe();
					if (pollTimer !== null) clearTimeout(pollTimer);
					if (reportTimer !== null) clearTimeout(reportTimer);
					pollTimer = null;
					reportTimer = null;
				}
			};
		}
		/* ==== @terminal-tabs:end ==== */

		/**
		 * One PTY session: its own screen, socket and status.
		 *
		 * Sessions outlive the panel on purpose — that is what makes the rail
		 * button reuse a terminal instead of spawning another shell — so everything
		 * a session needs is captured here. The panel supplies the two things that
		 * are per-view: `onOutput` (repaint) and input (through the active
		 * session's `write`).
		 */
		function openTerminalSession(options) {
			const endpoint = options.endpoint;
			const t = options.t;
			const sequence = options.sequence;
			const onChange = options.onChange;
			const core = options.core;
			const screen = new core.Screen({
				cols: 80,
				rows: 24,
				scrollback: TERMINAL_SCROLLBACK
			});
			screen.setTheme(terminalThemeName());
			const session = {
				id: `pty-${sequence}-${Math.random().toString(36).slice(2, 8)}`,
				title: t("termTabName", { n: String(sequence) }),
				status: "connecting",
				ptyId: null,
				screen,
				socket: null,
				onOutput: null
			};
			const link = {
				socket: null,
				writable: false,
				send(payload) {
					const active = link.socket;
					if (active === null || active.readyState !== 1) return;
					try {
						active.send(JSON.stringify(payload));
					} catch {
						/* the socket died between the check and the send */
					}
				},
				write(data) {
					if (link.writable) link.send({
						type: "input",
						data
					});
				}
			};
			/* Query replies (cursor position, device attributes) are terminal input,
			 * not user typing: they answer the program that asked. */
			screen.onResponse = (data) => link.send({
				type: "input",
				data
			});
			const setStatus = (status) => {
				session.status = status;
				onChange();
			};
			session.link = link;
			session.resize = (cols, rows) => link.send({
				type: "resize",
				cols,
				rows
			});
			session.write = (data) => link.write(data);
			/** End the shell and hand the PTY slot back to the guest service. */
			session.close = () => {
				link.writable = false;
				const socket = link.socket;
				link.socket = null;
				session.socket = null;
				session.status = "closed";
				if (socket !== null) {
					try {
						socket.close();
					} catch {
						/* already closed */
					}
				}
				const ptyId = session.ptyId;
				session.ptyId = null;
				if (ptyId !== null) {
					try {
						fetch(`${endpoint.url}/sessions/${ptyId}`, {
							method: "DELETE",
							headers: { "X-Dsh-Token": endpoint.token ?? "" },
							keepalive: true
						}).catch(() => {});
					} catch {
						/* the page is going away */
					}
				}
			};
			const url = `${endpoint.url.replace(/^http/, "ws")}/pty?token=${endpoint.token}`
				+ `&cols=${screen.cols}&rows=${screen.rows}`;
			const socket = new WebSocket(url);
			socket.binaryType = "arraybuffer";
			link.socket = socket;
			session.socket = socket;
			socket.onopen = () => {
				link.writable = true;
				setStatus("ready");
				link.send({
					type: "resize",
					cols: screen.cols,
					rows: screen.rows
				});
			};
			socket.onmessage = (event) => {
				/* Binary = raw terminal output. Text = JSON control frames. */
				if (typeof event.data !== "string") {
					screen.write(new Uint8Array(event.data));
					if (typeof session.onOutput === "function") session.onOutput();
					return;
				}
				let control = null;
				try {
					control = JSON.parse(event.data);
				} catch {
					control = null;
				}
				if (control !== null && typeof control.type === "string") {
					if (control.type === "ready" && typeof control.id === "string") session.ptyId = control.id;
					else if (control.type === "exit") setStatus("exited");
					return;
				}
				screen.write(event.data);
				if (typeof session.onOutput === "function") session.onOutput();
			};
			socket.onclose = () => {
				link.writable = false;
				if (session.status !== "closed") setStatus("disconnected");
			};
			socket.onerror = () => {
				link.writable = false;
				if (session.status !== "closed") setStatus("error");
			};
			return session;
		}

		/**
		 * The tab strip and the screen, driven by the plugin's terminal store.
		 *
		 * One view serves every tab: the textarea the Android IME owns is a single
		 * element for the whole panel, so switching tabs is a screen swap and
		 * cannot lose (or fight over) the keyboard.
		 */
		function TerminalPanel(props) {
			const t = props.t;
			const store = props.store;
			const host = react.useRef(null);
			const viewRef = react.useRef(null);
			const hapticRef = react.useRef(null);
			const [roster, setRoster] = react.useState(() => store.snapshot());
			const [message, setMessage] = react.useState("");
			const [themeName, setThemeName] = react.useState(() => terminalThemeName());
			const endpoint = ptyEndpoint();

			react.useEffect(() => store.subscribe(() => setRoster(store.snapshot())), [store]);

			/* The harness theme can change under us; follow both attributes it
			 * writes, on the two nodes it writes them to. */
			react.useEffect(() => {
				const sync = () => setThemeName(terminalThemeName());
				const observer = new MutationObserver(sync);
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ["data-ds-theme-source", "data-ds-dark-theme"]
				});
				if (document.body !== null) observer.observe(document.body, {
					attributes: true,
					attributeFilter: ["data-ds-dark-theme"]
				});
				const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
				if (media !== null && typeof media.addEventListener === "function") media.addEventListener("change", sync);
				sync();
				return () => {
					observer.disconnect();
					if (media !== null && typeof media.removeEventListener === "function") media.removeEventListener("change", sync);
				};
			}, []);

			react.useEffect(() => {
				for (const tab of store.snapshot().tabs) {
					const session = store.session(tab.id);
					if (session !== null) session.screen.setTheme(themeName);
				}
				const view = viewRef.current;
				if (view === null) return;
				view.applyTheme(themeName);
				view.schedule();
			}, [themeName, store]);

			/* A panel with no terminal opens one; closing the last tab opens a fresh
			 * one, so the screen host below always has a session behind it. */
			react.useEffect(() => {
				if (endpoint === null) return;
				if (store.count() === 0) store.ensure();
			}, [endpoint, store, roster.tabs.length]);

			react.useEffect(() => {
				if (endpoint === null) return undefined;
				const hostEl = host.current;
				if (hostEl === null) return undefined;
				const session = store.session();
				if (session === null) return undefined;
				const haptic = createVtHaptic({
					call: bridge() === null ? null : (path, body) => call(path, body),
					vibrate: typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
						? (ms) => navigator.vibrate(ms)
						: null
				});
				hapticRef.current = haptic;
				const textarea = document.createElement("textarea");
				const input = createVtInput({
					element: textarea,
					enabled: () => {
						const active = store.session();
						return active !== null && active.link.writable;
					},
					applicationCursor: () => {
						const active = store.session();
						return active !== null && active.screen.modes.applicationCursor;
					},
					bracketedPaste: () => {
						const active = store.session();
						return active !== null && active.screen.modes.bracketedPaste;
					},
					onData: (data) => {
						const active = store.session();
						if (active !== null) active.write(data);
					},
					onState: (name, value) => {
						const view = viewRef.current;
						if (view === null) return;
						if (name === "composing") view.setComposing(value);
						else if (name === "ctrl") view.showCtrlState(value);
					}
				});
				const view = createVtView({
					document,
					screen: session.screen,
					input,
					textarea,
					t,
					flags: terminalFlags,
					haptic,
					cellWidth: terminalCellWidth,
					log: (line) => {
						if (typeof console !== "undefined" && typeof console.debug === "function") console.debug("android-terminal", line);
					},
					label: t("termInputLabel"),
					onResize: (cols, rows) => {
						const active = store.session();
						if (active !== null) active.resize(cols, rows);
					},
					onMessage: (text) => setMessage(text)
				});
				input.attach();
				view.applyTheme(themeName);
				hostEl.appendChild(view.element);
				viewRef.current = view;
				session.onOutput = () => view.schedule();
				view.fit();
				view.paintNow();
				view.focus();
				const observer = new ResizeObserver(() => {
					view.fit();
				});
				observer.observe(hostEl);
				return () => {
					observer.disconnect();
					for (const tab of store.snapshot().tabs) {
						const other = store.session(tab.id);
						if (other !== null) other.onOutput = null;
					}
					view.destroy();
					viewRef.current = null;
				};
			}, [endpoint, store]);

			/* Follow the active tab: swap the screen under the same view, and keep
			 * the keyboard if it was already up. */
			react.useEffect(() => {
				const view = viewRef.current;
				const session = store.session();
				if (view === null || session === null) return;
				for (const tab of store.snapshot().tabs) {
					const other = store.session(tab.id);
					if (other !== null) other.onOutput = other === session ? () => view.schedule() : null;
				}
				view.setScreen(session.screen);
				view.applyTheme(terminalThemeName());
				view.fit();
				view.paintNow();
				if (view.keyboardOpen() === true) view.requestKeyboard("tab-switch");
			}, [roster.activeId, endpoint, store]);

			const active = store.session();
			const status = active === null ? "idle" : active.status;
			const statusText = status === "ready" ? t("termConnected")
				: status === "connecting" ? t("termConnecting")
					: status === "exited" || status === "disconnected" ? t("termDisconnected")
						: status === "error" ? t("termError") : t("termConnecting");
			const canReconnect = endpoint !== null && (status === "disconnected" || status === "error");
			const tap = () => {
				if (hapticRef.current !== null) hapticRef.current.tap();
			};
			return h("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					height: "100%",
					minHeight: 0,
					background: "var(--dsw-alias-bg-base, #fff)"
				}
			},
				h("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "8px 14px",
						borderBottom: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))",
						flex: "none"
					}
				},
					h("strong", { style: { fontSize: 13 } }, t("termTitle")),
					h("span", {
						style: {
							fontSize: 11,
							color: "var(--dsw-alias-label-secondary, #666)"
						}
					}, endpoint === null ? "" : `${endpoint.url} · ${statusText}`),
					h("span", { style: { flex: 1 } }),
					canReconnect ? h(Button, {
						variant: "outline", size: "sm",
						onClick: () => {
							tap();
							const id = store.activeId();
							if (id !== null) store.close(id);
							store.openTab();
						}
					}, t("termReconnect")) : null,
					h(Button, {
						variant: "outline", size: "sm",
						onClick: () => {
							tap();
							const session = store.session();
							const view = viewRef.current;
							if (session === null || view === null) return;
							session.screen.clearAll();
							view.schedule();
							view.scrollToBottom();
						}
					}, t("termClear"))
				),
				endpoint === null ? null : h("div", {
					className: "dsv-tabs",
					role: "tablist"
				},
					roster.tabs.map((tab) => h("div", {
						key: tab.id,
						className: "dsv-tab",
						"data-active": tab.id === roster.activeId ? "true" : "false"
					},
						h("button", {
							type: "button",
							role: "tab",
							className: "dsv-tabLabel",
							"aria-selected": tab.id === roster.activeId,
							onPointerDown: (event) => event.preventDefault(),
							onClick: () => {
								tap();
								store.activate(tab.id);
							}
						},
							h("span", {
								className: "dsv-dot",
								"data-state": tab.status === "ready" ? "ready"
									: tab.status === "connecting" ? "connecting"
										: tab.status === "error" || tab.status === "disconnected" ? "error" : "idle",
								"aria-hidden": "true"
							}),
							h("span", { className: "dsv-tabName" }, tab.title)),
						h("button", {
							type: "button",
							className: "dsv-tabClose",
							"aria-label": t("termCloseTab"),
							onPointerDown: (event) => event.preventDefault(),
							onClick: () => {
								tap();
								store.close(tab.id);
							}
						}, "\u00d7"))),
					h("button", {
						type: "button",
						className: "dsv-tabAdd",
						"aria-label": t("termNewTab"),
						"aria-disabled": roster.canOpen ? "false" : "true",
						onPointerDown: (event) => event.preventDefault(),
						onClick: () => {
							tap();
							if (store.openTab() === null) setMessage(t("termTabLimit", { max: String(TERMINAL_MAX_TABS) }));
							else setMessage("");
						}
					}, "+")),
				message !== "" ? h("div", {
					style: {
						fontSize: 12,
						padding: "6px 14px",
						color: "var(--dsw-alias-label-secondary, #666)"
					}
				}, message) : null,
				endpoint === null
					? h("div", { style: { padding: 16, fontSize: 13 } }, t("termUnavailable"))
					: h("div", { ref: host, className: "dsa-termHost" })
			);
		}

		/** Rail glyph: a prompt chevron in a 20px box, no primitives import. */
		function TerminalIcon() {
			return h("svg", { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", "aria-hidden": "true" },
				h("path", { d: "M4 5.5 L8.5 10 L4 14.5", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }),
				h("path", { d: "M10.5 15 H16", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", fill: "none" })
			);
		}

		/** Shared emulator constants: one core's tables, one screen per session. */
		const terminalCore = createVtCore();
		const terminalFlags = terminalCore;
		const terminalCellWidth = (cp) => terminalCore.cpWidth(cp);

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			/* Terminal sessions live with the plugin, not with the panel. The rail
			 * button remounts the panel, and a remount must reuse the shell that is
			 * already running — with the socket in the mount effect, every press
			 * spawned another PTY in the guest. */
			let terminalSequence = 0;
			const terminalStore = createTerminalStore({
				maxTabs: TERMINAL_MAX_TABS,
				open: () => {
					const endpoint = ptyEndpoint();
					if (endpoint === null) return null;
					terminalSequence += 1;
					return openTerminalSession({
						endpoint,
						t,
						sequence: terminalSequence,
						core: terminalCore,
						onChange: () => terminalStore.touch()
					});
				}
			});
			ctx.effect(() => () => terminalStore.closeAll(), "dsh-plugin-android: terminals");
			// The AI's window into those tabs: the app queues commands, this page
			// runs them against the store and reports the roster back. The store is
			// page-local by design; the app only relays.
			ctx.effect(() => {
				const relay = installTerminalTabs(terminalStore);
				return () => relay.disconnect();
			}, "dsh-plugin-android: terminal tabs relay");
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-plugin-android: dictionaries");
			// The page draws itself in the shell's vocabulary, so its stylesheet
			// rides the same effect: mounted with the plugin, removed with it.
			ctx.effect(() => mountStyles(), "dsh-plugin-android: page styles");
			// The floating ball and the app's own handover both look for this
			// global; it is installed once, with the plugin.
			ctx.effect(() => {
				installPromptHook();
				return () => {
					delete window.__dshAndroidPrompt;
				};
			}, "dsh-plugin-android: prompt hook");
			// Only useful while the ball is up, but harmless otherwise: the bridge
			// answers with shown:false and nothing happens.
			ctx.effect(() => {
				const observer = installBallStatus();
				return () => observer.disconnect();
			}, "dsh-plugin-android: ball status");
			// The ball's words go to their own conversation, or wait in the app's
			// queue until there is one.
			ctx.effect(() => {
				const inbox = installBallInbox(ctx);
				return () => inbox.disconnect();
			}, "dsh-plugin-android: ball inbox");
			// The window's bars belong to the app, but only the page knows which
			// palette it is painting — push it, so a dark page never keeps white
			// strips above and below it.
			ctx.effect(() => {
				const report = installThemeReport();
				return () => report.disconnect();
			}, "dsh-plugin-android: window theme");
			// Three flat entries, the titles the user asked for. Each one renders its own
			// slice of the same component - same bridge calls, same state, no filtering.
			for (const section of [
				{ id: "android", order: 25, label: "nav", part: "sandbox" },
				{ id: "android-ball", order: 26, label: "navBall", part: "ball" },
				{ id: "android-version", order: 27, label: "navVersion", part: "version" }
			]) {
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: section.id,
					order: section.order,
					label: () => t(section.label),
					locale: NS,
					inject: () => ({ t, part: section.part })
				}, AndroidSection));
			}
			// Its own entry instead of a fourth slice of the sandbox page: the
			// permission list changes on its own (a tool call in one conversation
			// adds a row), and revoking is a different kind of action from the
			// sandbox's start/stop controls.
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "android-ai",
				order: 28,
				label: () => t("navAi"),
				locale: NS,
				inject: () => ({ t })
			}, AiConsentSection));

			ctx.slots.inject("main", function* () {
				yield ctx.slots.register({
					name: "main",
					key: TERMINAL_PANEL,
					locale: NS,
					inject: () => ({
						t,
						store: terminalStore
					})
				}, TerminalPanel);
			});

			ctx.slots.inject("sidebar.right.tab.document.action", () => ctx.slots.register({
				name: "sidebar.right.tab.document.action",
				key: "android-export",
				locale: NS,
				inject: () => ({ t })
			}, ExportAction));

			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: TERMINAL_PANEL,
				order: 20,
				label: () => t("termTitle"),
				locale: NS
			}, TerminalIcon));
		}

		/** Required services (cordis fiber inject): the slot ledger and the locale
		 *  registry. The target slot itself is reached through slots.inject(), so
		 *  this plugin does not constrain activation order against the settings
		 *  shell that declares `settings.section`. */
		// "remote.session" is a *dotted* cordis service name (see the session
		// controller's own inject list); reaching it as ctx.remote.session is not
		// guaranteed to resolve, and when it did not, every ball message failed
		// silently and fell back to pasting into the current conversation.
		const inject = ["slots", "locale", "remote", "remote.session"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
