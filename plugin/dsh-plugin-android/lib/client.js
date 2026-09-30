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
			nav: "安卓沙箱",
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
			phoneBallSize: "大小（dp）",
			phoneBallImage: "图标",
			phoneBallBuiltin: "内置（大肥鱼）",
			phoneBallPick: "选择图片…",
			phoneBallImageHint: "PNG/JPG，或 Android 矢量图 XML；换外观不用重装外壳。",
			phoneBallOn: "已开启",
			phoneBallOff: "已关闭",
			phoneEnable: "开启",
			phoneDisable: "关闭",
			phoneCurrent: "当前：应用 %s · 终端 t%s · 热包 %s",
			phoneTerminal: "终端更新可用 · t%s（需要安装新的 APK）",
			hotPick: "选择本地热包…",
			termMissing: "运行时未安装",
			termMissingHint: "这个外壳不含 rootfs：下载一次即可（约 %s MB）。装好之后，外壳更新就只有几 MB。",
			termDownload: "下载运行时",
			hotPicked: "已选文件：%s",
			portHint: "沙箱内 dsh web 监听的端口；改动在服务重启后生效。",
			apiKeyHint: "以 DEEPSEEK_API_KEY 注入沙箱环境；留空则沿用沙箱里已有的配置。"
		};
		const en = {
			nav: "Android sandbox",
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
			phoneBallSize: "Size (dp)",
			phoneBallImage: "Picture",
			phoneBallBuiltin: "Built-in whale",
			phoneBallPick: "Choose a picture…",
			phoneBallImageHint: "PNG/JPG, or an Android vector XML — changing how it looks needs no shell update.",
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
			return h("button", {
				type: "button",
				role: "switch",
				"aria-checked": props.checked === true,
				"aria-label": props.label,
				className: "dsa-plainSwitch",
				onClick: () => props.onChange(!props.checked)
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

		async function call(path, body) {
			const api = bridge();
			if (api === null) throw new Error("no bridge");
			const response = await fetch(api.base + path, {
				method: body === undefined ? "GET" : "POST",
				headers: Object.assign({ "X-Dsh-Token": api.token ?? "" },
					body === undefined ? null : { "Content-Type": "application/json" }),
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			const text = await response.text();
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
			return h("div", { className: "dsa-toggle" },
				h("div", { className: "dsa-copy" },
					h("span", { className: "dsa-title" }, props.title),
					props.desc === undefined ? null : h("span", { className: "dsa-hint" }, props.desc)),
				h(Switch, { checked: props.checked === true, onChange: props.onChange, label: props.title }));
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
												const result = await call("/mounts/test", { id: mount.id });
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
					const data = await call("/export", { path: target });
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
					const data = await call("/export", { path });
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
					const data = await call("/update/check", {});
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
												const result = await call("/hot/fetch", { url: info.hot.url });
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
											url: info !== null && info.terminal !== undefined ? info.terminal.url : "",
											manifest: info !== null && info.terminal !== undefined ? info.terminal.manifest : ""
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
										const result = await call("/shizuku/exec", { command });
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
									autoRestart: form.autoRestart === true
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
						setState(Object.assign({}, access, {
							size: ball.size,
							image: ball.image || ""
						}));
						setBallSize(String(ball.size === undefined ? 58 : ball.size));
					})
					.catch(() => { if (!cancelled) setState({}); });
				return () => { cancelled = true; };
			}, [props.tick]);

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
						h("div", { className: "dsa-field" },
							h("label", { className: "dsa-fieldLabel" }, t("phoneBallSize")),
							h("div", { className: "dsa-inputRow" },
								h(TextInput, {
									inputMode: "numeric",
									value: String(ballSize ?? ""),
									onChange: (event) => setBallSize(event.target.value)
								}),
								h(Button, {
									variant: "outline",
									onClick: () => {
										const size = parseInt(String(ballSize), 10);
										return ask("/ball/config", { size: Number.isFinite(size) ? size : 58 });
									}
								}, t("save")))),
						h("div", { className: "dsa-field" },
							h("label", { className: "dsa-fieldLabel" }, t("phoneBallImage")),
							h("p", { className: "dsa-hint" }, image === "" ? t("phoneBallBuiltin") : image),
							h("div", { className: "dsa-actions" },
								h(Button, {
									variant: "outline", size: "sm",
									onClick: () => ask("/ball/pick-image", {})
								}, t("phoneBallPick")),
								image === "" ? null : h(Button, {
									variant: "ghost", size: "sm",
									onClick: () => ask("/ball/config", { image: "" })
								}, t("remove"))),
							h("p", { className: "dsa-hint" }, t("phoneBallImageHint"))))));
		}

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
		 * The page is the only place that knows which tool is running, and the
		 * ball is the only thing the user sees while they are in another app, so
		 * the two are wired together here: new rows in the conversation are
		 * reported to `/ball/say`, throttled and de-duplicated so the bubble reads
		 * like a status line rather than a log.
		 *
		 * Deliberately class-name agnostic: the shell's CSS modules are hashed, so
		 * this watches for *text* appearing and filters the small set of things
		 * that are not progress (the composer, our own panels, buttons).
		 */
		function installBallStatus() {
			let last = "";
			let lastAt = 0;
			let pending = null;
			const IGNORE = /^(发送|收起|停止|新建会话|设置|插件|终端)$/;
			const send = (text) => {
				const line = text.trim().replace(/\s+/g, " ");
				if (line.length < 2 || line.length > 48 || IGNORE.test(line)) return;
				if (line === last) return;
				const now = Date.now();
				if (now - lastAt < 1200) {
					// Keep only the newest of a burst; a tool row is added together
					// with its spinner and duration, and only the last one matters.
					pending = line;
					return;
				}
				last = line;
				lastAt = now;
				call("/ball/say", { text: line + "…" }).catch(() => {});
			};
			setInterval(() => {
				if (pending === null) return;
				const line = pending;
				pending = null;
				send(line);
			}, 1200);

			const observer = new MutationObserver((records) => {
				for (const record of records) {
					for (const node of record.addedNodes) {
						if (node.nodeType !== 1) continue;
						if (node.closest !== undefined && node.closest("form, [role=textbox], [data-dsa]") !== null) continue;
						const text = (node.innerText ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
						if (text.length > 0) send(text[text.length - 1]);
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
			return observer;
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

			const hotState = (snapshot.hotVersion ?? "") === "" ? t("hotBakedIn") : t("hotImported");
			return h("div", { className: "dsa-root" },
				h("h2", { className: "dsa-heading" }, t("title")),
				h("p", { className: "dsa-intro" }, t("subtitle")),
				// Which build is this? Without it, an older plugin on a device is
				// indistinguishable from a feature that was never written.
				h("p", {
					className: "dsa-meta",
					// The whole version in one string: shell, sandbox runtime, hot
					// package. This is what a bug report quotes.
					"data-dsh-android-version": (snapshot.appVersion ?? "") + "-t" + (snapshot.terminalVersion ?? "?")
						+ "/" + String(snapshot.hotVersion || snapshot.packagedHotVersion || "")
				}, t("verLine")
					.replace("%s", String(snapshot.hotVersion || snapshot.packagedHotVersion || "-"))
					.replace("%s", hotState)),

				h(Group, { title: t("status") },
					h(StatusCard, { status: snapshot.status, t, act, message })),

				h(Group, { title: t("distros") },
					h("ul", { className: "dsa-list" }, (snapshot.distros ?? []).map((distro) => h(DistroCard, {
						key: distro.id,
						distro,
						t,
						onSelect: async (id) => {
							await call("/distros/select", { id });
							await reload();
						},
						onDelete: async (id) => {
							await call("/distros/delete", { id });
							await reload();
						},
						onCommand: async (id, command) => {
							await call("/distros/command", { id, command });
							setMessage(t("saved"));
							await reload();
						}
					})))),

				h(UpdateCard, {
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

				h(ExportCard, { t }),

				h(MountsCard, { t, mounts: snapshot.mounts, onChanged: reload }),

				h(ShizukuCard, { shizuku: snapshot.shizuku, t, act }),

				h(PhoneCard, { t, tick, onChanged: reload }),

				h(SettingsCard, { settings: snapshot.settings, t, onSaved: reload }),

				h(Group, { title: t("log") },
					h("div", { className: "dsa-actions" },
						h(Button, { variant: "outline", size: "sm", onClick: reload }, t("refresh")),
						h(Button, {
							variant: "ghost", size: "sm",
							onClick: async () => {
								await call("/log/clear", {});
								await reload();
							}
						}, t("clear"))),
					h("pre", { className: "dsa-pre" }, (snapshot.log ?? []).join("\n") || t("logEmpty"))));
		}

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
		const XTERM_VERSION = "5";

		/** xterm is served by the guest PTY service, not bundled here. */
		function ptyEndpoint() {
			const api = globalThis.DshAndroid;
			if (api && api.pty && api.pty.url) return api.pty;
			return null;
		}

		function loadStylesheet(href, key) {
			if (document.querySelector(`link[data-dshm="${key}"]`) !== null) return;
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = href;
			link.dataset.dshm = key;
			document.head.appendChild(link);
		}

		let xtermPromise = null;

		function loadScript(src) {
			return new Promise((resolve, reject) => {
				const script = document.createElement("script");
				script.src = src;
				script.onload = () => resolve();
				script.onerror = () => reject(new Error("无法从沙箱加载 " + src));
				document.head.appendChild(script);
			});
		}

		function loadXterm(endpoint) {
			if (globalThis.Terminal !== undefined) return Promise.resolve(globalThis.Terminal);
			if (xtermPromise !== null) return xtermPromise;
			xtermPromise = (async () => {
				loadStylesheet(`${endpoint.url}/assets/xterm.css?token=${endpoint.token}`, "xterm-css");
				const query = `?token=${endpoint.token}&v=${XTERM_VERSION}`;
				await loadScript(`${endpoint.url}/assets/xterm.js${query}`);
				if (globalThis.Terminal === undefined) throw new Error("xterm 未加载");
				// Optional: the fit addon measures real cell metrics, and the canvas
				// renderer is far cheaper than the DOM one on a phone. Both are
				// optional — a missing addon must not cost the user a terminal.
				await loadScript(`${endpoint.url}/assets/addon-fit.js${query}`).catch(() => {});
				await loadScript(`${endpoint.url}/assets/addon-canvas.js${query}`).catch(() => {});
				return globalThis.Terminal;
			})();
			return xtermPromise;
		}

		function isDark() {
			return document.documentElement.hasAttribute("data-ds-dark-theme")
				|| (globalThis.matchMedia !== undefined && matchMedia("(prefers-color-scheme: dark)").matches
					&& !document.documentElement.hasAttribute("data-ds-light-theme"));
		}

		function terminalTheme() {
			return isDark()
				? { background: "#14161a", foreground: "#e8eaed", cursor: "#4c8dff",
					selectionBackground: "#2c3a55", black: "#14161a", brightBlack: "#5f6368" }
				: { background: "#ffffff", foreground: "#1f2329", cursor: "#4c8dff",
					selectionBackground: "#cfe0ff", black: "#1f2329", brightBlack: "#8a9099" };
		}

		function TerminalPanel(props) {
			const t = props.t;
			const host = react.useRef(null);
			const termRef = react.useRef(null);
			const socketRef = react.useRef(null);
			const fitRef = react.useRef(null);
			const [status, setStatus] = react.useState("idle");
			const [message, setMessage] = react.useState("");
			const [draft, setDraft] = react.useState("");
			const historyRef = react.useRef([]);
			const historyIndexRef = react.useRef(-1);
			const endpoint = ptyEndpoint();

			/**
			 * Send a whole line to the shell.
			 *
			 * This is the primary input path on a phone: the terminal's own hidden
			 * textarea is a magnet for IME composition events, and a Chinese IME
			 * happily pushes its candidate and clipboard list through it, which
			 * xterm then echoes as if it were typed. A real <input> is what the IME
			 * was designed for, so the command goes in there and is sent as one line.
			 */
			const sendLine = (text) => {
				const socket = socketRef.current;
				if (socket === null || socket.readyState !== 1) {
					setMessage(t("termDisconnected") + "（终端未连上，点左侧终端图标重开一次）");
					return;
				}
				const line = text ?? draft;
				// Text frame: the JSON input path is the one exercised end to end.
				// Output stays binary (that is where the volume is), but a keystroke
				// is a few bytes and this path is known to work.
				socket.send(JSON.stringify({ type: "input", data: line + "\r" }));
				if (line.trim() !== "") {
					historyRef.current = [line].concat(historyRef.current).slice(0, 50);
				}
				historyIndexRef.current = -1;
				setDraft("");
				if (termRef.current !== null) termRef.current.focus();
			};

			const recall = (direction) => {
				const history = historyRef.current;
				if (history.length === 0) return;
				let index = historyIndexRef.current + direction;
				if (index < 0) index = 0;
				if (index >= history.length) {
					historyIndexRef.current = -1;
					setDraft("");
					return;
				}
				historyIndexRef.current = index;
				setDraft(history[index]);
			};

			const paste = async () => {
				try {
					const text = await navigator.clipboard.readText();
					if (typeof text === "string" && text !== "") setDraft((d) => d + text);
				} catch (error) {
					setMessage(t("termPaste") + "：请长按输入框粘贴");
				}
			};

			react.useEffect(() => {
				if (endpoint === null) {
					setStatus("unavailable");
					return undefined;
				}
				let disposed = false;
				let socket = null;
				let term = null;
				let observer = null;

				(async () => {
					try {
						const Terminal = await loadXterm(endpoint);
						if (disposed) return;
						term = new Terminal({
							convertEol: false,
							cursorBlink: true,
							fontSize: 13,
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							scrollback: 4000,
							theme: terminalTheme(),
							allowProposedApi: true
						});
						termRef.current = term;
						term.open(host.current);

						// Prefer the fit addon (real cell metrics); fall back to the
						// rough 8x17 estimate if it did not load.
						let fitAddon = null;
						if (globalThis.FitAddon !== undefined && globalThis.FitAddon.FitAddon !== undefined) {
							try {
								fitAddon = new globalThis.FitAddon.FitAddon();
								term.loadAddon(fitAddon);
							} catch {
								fitAddon = null;
							}
						}
						if (globalThis.CanvasAddon !== undefined && globalThis.CanvasAddon.CanvasAddon !== undefined) {
							try {
								term.loadAddon(new globalThis.CanvasAddon.CanvasAddon());
							} catch {
								/* keep the DOM renderer */
							}
						}
						const fit = () => {
							const element = host.current;
							if (element === null || term === null) return;
							if (fitAddon !== null) {
								try {
									fitAddon.fit();
									return;
								} catch {
									/* fall through to the estimate */
								}
							}
							const cols = Math.max(20, Math.floor((element.clientWidth - 8) / 8));
							const rows = Math.max(5, Math.floor((element.clientHeight - 8) / 17));
							try {
								term.resize(cols, rows);
							} catch {
								/* not open yet */
							}
						};
						fitRef.current = fit;
						fit();
						// Ask the IME to keep its guesses out of the terminal's hidden
						// textarea; typing happens in the input bar below.
						const helper = host.current === null
							? null : host.current.querySelector(".xterm-helper-textarea");
						if (helper !== null) {
							helper.setAttribute("autocorrect", "off");
							helper.setAttribute("autocapitalize", "none");
							helper.setAttribute("autocomplete", "off");
							helper.setAttribute("spellcheck", "false");
							helper.setAttribute("enterkeyhint", "send");
						}

						const url = `${endpoint.url.replace(/^http/, "ws")}/pty?token=${endpoint.token}`
							+ `&cols=${term.cols}&rows=${term.rows}`;
						setStatus("connecting");
						socket = new WebSocket(url);
						socket.binaryType = "arraybuffer";
						socketRef.current = socket;
						socket.onopen = () => {
							setStatus("ready");
							setMessage("");
							fit();
							socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
						};
						socket.onmessage = (event) => {
							// Binary = raw terminal output, written straight through.
							// Text = control frames only, so no JSON parse on the hot path.
							if (typeof event.data !== "string") {
								term.write(new Uint8Array(event.data));
								return;
							}
							let control = null;
							try {
								control = JSON.parse(event.data);
							} catch {
								control = null;
							}
							if (control !== null && typeof control.type === "string") {
								if (control.type === "exit") {
									setStatus("exited");
									setMessage(`会话已退出（code ${control.code ?? "—"}）`);
								}
								return;
							}
							term.write(event.data);
						};
						socket.onclose = () => {
							if (!disposed) setStatus("disconnected");
						};
						socket.onerror = () => {
							if (!disposed) setStatus("error");
						};
						term.onData((data) => {
							if (socket !== null && socket.readyState === 1) {
								socket.send(JSON.stringify({ type: "input", data }));
							}
						});
						term.onResize(({ cols, rows }) => {
							if (socket !== null && socket.readyState === 1) {
								socket.send(JSON.stringify({ type: "resize", cols, rows }));
							}
						});

						observer = new ResizeObserver(() => {
							if (fitRef.current) fitRef.current();
						});
						observer.observe(host.current);
					} catch (error) {
						if (!disposed) {
							setStatus("error");
							setMessage(String(error?.message ?? error));
						}
					}
				})();

				return () => {
					disposed = true;
					if (observer !== null) observer.disconnect();
					if (socket !== null) {
						try {
							socket.close();
						} catch {
							/* already closed */
						}
					}
					if (term !== null) {
						try {
							term.dispose();
						} catch {
							/* already disposed */
						}
					}
					socketRef.current = null;
					termRef.current = null;
					fitRef.current = null;
				};
			}, []);

			react.useEffect(() => {
				const observer = new MutationObserver(() => {
					if (termRef.current !== null) termRef.current.options.theme = terminalTheme();
				});
				observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ds-dark-theme", "class"] });
				return () => observer.disconnect();
			}, []);

			const statusText = status === "ready" ? t("termConnected")
				: status === "connecting" ? t("termConnecting")
					: status === "unavailable" ? t("termUnavailable")
						: status === "exited" || status === "disconnected" ? t("termDisconnected")
							: status === "error" ? t("failed") : t("termConnecting");

			return h("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--dsw-alias-bg-base, #fff)" } },
				h("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))", flex: "none" } },
					h("strong", { style: { fontSize: 13 } }, t("termTitle")),
					h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)" } }, endpoint === null ? "" : `${endpoint.url} · ${statusText}`),
					h("span", { style: { flex: 1 } }),
					h(Button, {
						variant: "outline", size: "sm",
						onClick: () => {
							if (termRef.current !== null && socketRef.current !== null && socketRef.current.readyState === 1) {
								termRef.current.clear();
							}
						}
					}, t("termClear"))
				),
				message !== "" ? h("div", { style: { fontSize: 12, padding: "6px 14px", color: "var(--dsw-alias-label-secondary, #666)" } }, message) : null,
				endpoint === null
					? h("div", { style: { padding: 16, fontSize: 13 } }, t("termUnavailable"))
					: h("div", {
						ref: host,
						style: { flex: 1, minHeight: 0, padding: 4, overflow: "hidden" }
					}),
				endpoint === null ? null : h("div", {
					style: {
						display: "flex", alignItems: "center", gap: 6, flex: "none",
						padding: "6px 8px",
						borderTop: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))"
					}
				},
					h("input", {
						value: draft,
						placeholder: t("termInputHint"),
						type: "text",
						spellCheck: false,
						autoComplete: "off",
						autoCorrect: "off",
						autoCapitalize: "none",
						enterKeyHint: "send",
						className: "dsa-input",
						style: { flex: 1 },
						onChange: (event) => setDraft(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								sendLine();
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								recall(1);
							} else if (event.key === "ArrowDown") {
								event.preventDefault();
								recall(-1);
							}
						}
					}),
					h(Button, { variant: "primary", size: "sm", onClick: () => sendLine() }, t("termSend")),
					h(Button, { variant: "ghost", size: "sm", onClick: paste }, t("termPaste"))
				)
			);
		}

		/** Rail glyph: a prompt chevron in a 20px box, no primitives import. */
		function TerminalIcon() {
			return h("svg", { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", "aria-hidden": "true" },
				h("path", { d: "M4 5.5 L8.5 10 L4 14.5", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }),
				h("path", { d: "M10.5 15 H16", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", fill: "none" })
			);
		}

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
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
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "android",
				order: 25,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ t })
			}, AndroidSection));

			ctx.slots.inject("main", function* () {
				yield ctx.slots.register({
					name: "main",
					key: TERMINAL_PANEL,
					locale: NS,
					inject: () => ({ t })
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
		const inject = ["slots", "locale"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
