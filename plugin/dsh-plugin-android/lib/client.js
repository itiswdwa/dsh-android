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
			hotTitle: "热更新包",
			hotCurrent: "当前：内置 %s",
			hotApplied: "已导入外部包 %s",
			hotHint: "收到 dsh-hot.zip 后放进手机的 Download 目录，重新打开应用即可导入（插件、技能、沙箱脚本都能这样更新，不必重装 APK）。",
			updCheck: "检查更新",
			updChecking: "检查中…",
			updLatest: "已是最新（%s）",
			updFailed: "检查失败：%s（也可以手动把 dsh-hot.zip 放进 Download 导入）",
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
			termUnavailable: "终端不可用：本页没有连到 DSH Android 应用的沙箱 PTY 服务（在电脑浏览器里打开时正常）。"
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
			hotTitle: "Hot package",
			hotCurrent: "packaged %s",
			hotApplied: "imported %s",
			hotHint: "Drop a received dsh-hot.zip into the phone's Download folder and reopen the app to apply it. Plugins, skills and sandbox scripts update this way — no APK reinstall.",
			updCheck: "Check for updates",
			updChecking: "Checking…",
			updLatest: "Up to date (%s)",
			updFailed: "Check failed: %s (you can also drop dsh-hot.zip into Download)",
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
			termUnavailable: "Terminal unavailable: this page is not connected to the DSH Android sandbox PTY service (expected in a desktop browser)."
		};

		const S = {
			card: {
				background: "var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, #fff))",
				border: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))",
				borderRadius: 10,
				padding: "12px 14px",
				marginBottom: 12
			},
			row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
			h: { fontSize: 13, fontWeight: 600, margin: "18px 0 8px", color: "var(--dsw-alias-label-primary, #111)" },
			label: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", margin: "8px 0 4px" },
			mono: {
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: 11,
				whiteSpace: "pre-wrap",
				wordBreak: "break-all",
				maxHeight: 220,
				overflow: "auto",
				background: "var(--dsw-alias-bg-base, #fafafa)",
				borderRadius: 8,
				padding: 10,
				color: "var(--dsw-alias-label-secondary, #555)"
			},
			dot: { width: 8, height: 8, borderRadius: 4, display: "inline-block" }
		};

		function buttonStyle(kind) {
			return {
				font: "inherit",
				fontSize: 13,
				padding: "6px 12px",
				minHeight: 34,
				borderRadius: 8,
				cursor: "pointer",
				color: kind === "primary"
					? "var(--dsw-alias-label-on-primary, #fff)"
					: "var(--dsw-alias-label-primary, #111)",
				background: kind === "primary"
					? "var(--dsw-alias-state-business-primary, #4c8dff)"
					: "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06))",
				border: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.12))"
			};
		}

		function fieldStyle() {
			return {
				font: "inherit",
				fontSize: 13,
				padding: "7px 10px",
				minHeight: 34,
				width: "100%",
				boxSizing: "border-box",
				borderRadius: 8,
				color: "var(--dsw-alias-label-primary, #111)",
				background: "var(--dsw-alias-bg-base, #fff)",
				border: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.2))"
			};
		}

		function Button(props) {
			const style = Object.assign({}, buttonStyle(props.kind), props.disabled ? { opacity: 0.5, cursor: "default" } : null, props.style);
			return h("button", {
				type: "button",
				style,
				disabled: props.disabled === true,
				onClick: props.onClick
			}, props.children);
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

		function StatusCard(props) {
			const status = props.status;
			const colour = status.state === "RUNNING" ? "#3fb950"
				: status.state === "ERROR" ? "#f85149"
					: status.state === "STARTING" ? "#d29922" : "var(--dsw-alias-label-secondary, #888)";
			return h("div", { style: S.card },
				h("div", { style: S.row },
					h("span", { style: Object.assign({}, S.dot, { background: colour }) }),
					h("strong", { style: { fontSize: 13 } }, props.t(status.state === "RUNNING" ? "running"
						: status.state === "STARTING" ? "starting"
							: status.state === "ERROR" ? "failed" : "stopped")),
					h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" } },
						"127.0.0.1:" + status.port)
				),
				status.url !== null && status.url !== ""
					? h("div", { style: { fontSize: 11, marginTop: 6, wordBreak: "break-all", color: "var(--dsw-alias-label-secondary, #666)" } }, status.url)
					: null,
				status.error !== null && status.error !== ""
					? h("div", { style: { fontSize: 12, marginTop: 6, color: "#f85149" } }, status.error)
					: null,
				h("div", { style: Object.assign({}, S.row, { marginTop: 10 }) },
					h(Button, { kind: "primary", onClick: () => props.act("/server/start") }, props.t("start")),
					h(Button, { onClick: () => props.act("/server/stop") }, props.t("stop")),
					h(Button, { onClick: () => props.act("/server/restart") }, props.t("restart")),
					h(Button, { onClick: () => props.act("/open-in-browser") }, props.t("openBrowser")),
					h(Button, { onClick: () => props.act("/import") }, props.t("import"))
				),
				props.message !== null ? h("div", { style: { fontSize: 12, marginTop: 8, color: "var(--dsw-alias-label-secondary, #666)" } }, props.message) : null
			);
		}

		function DistroCard(props) {
			const [command, setCommand] = react.useState(null);
			react.useEffect(() => {
				setCommand(props.distro.command);
			}, [props.distro.id, props.distro.command]);
			return h("div", { style: Object.assign({}, S.card, { marginBottom: 8 }) },
				h("div", { style: S.row },
					h("strong", { style: { fontSize: 13 } }, props.distro.name),
					props.distro.active ? h("span", { style: { fontSize: 11, color: "#3fb950" } }, "●") : null,
					h("span", { style: { flex: 1 } }),
					props.distro.active ? null : h(Button, { onClick: () => props.onSelect(props.distro.id) }, props.t("select")),
					props.distro.bundled ? null : h(Button, { onClick: () => props.onDelete(props.distro.id) }, props.t("remove"))
				),
				h("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)", marginTop: 4 } },
					props.distro.id + " · " + props.distro.path),
				props.distro.active
					? h("div", null,
						h("div", { style: S.label }, props.t("command")),
						h("textarea", {
							value: command ?? "",
							rows: 2,
							style: Object.assign({}, fieldStyle(), { resize: "vertical" }),
							onChange: (event) => setCommand(event.target.value)
						}),
						h(Button, {
							style: { marginTop: 6 },
							onClick: () => props.onCommand(props.distro.id, command ?? "")
						}, props.t("saveCommand"))
					)
					: null
			);
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
			return h("div", { style: S.card },
				mounts.length === 0
					? h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" } }, t("mountEmpty"))
					: mounts.map((mount) => h("div", {
						key: mount.id,
						style: { borderBottom: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.08))", paddingBottom: 8, marginBottom: 8 }
					},
						h("div", { style: S.row },
							h("strong", { style: { fontSize: 13 } }, mount.guest),
							h("span", { style: { flex: 1 } }),
							h(Button, {
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
								onClick: () => act("/mounts/toggle", { id: mount.id, enabled: mount.enabled !== true })
							}, mount.enabled === true ? "停用" : "启用"),
							h(Button, { onClick: () => act("/mounts/remove", { id: mount.id }) }, t("remove"))
						),
						h("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)", marginTop: 4, wordBreak: "break-all" } }, mount.host),
						// Why this mount will show nothing, in the user's terms. The
						// app used to drop unreadable paths from the PRoot command
						// line, which looked exactly like the feature being broken.
						mount.problem
							? h("div", { style: { fontSize: 11, marginTop: 4, color: "#d29922" } }, "⚠ " + mount.problem)
							: null,
						mount.enabled !== true
							? h("div", { style: { fontSize: 11, marginTop: 4, color: "var(--dsw-alias-label-tertiary, #888)" } }, "已停用")
							: null
					)),
				h("div", { style: S.row },
					h(Button, { kind: "primary", onClick: () => act("/mounts/pick", {}) }, t("mountPick"))
				),
				h("div", { style: S.label }, t("mountHost") + " → " + t("mountGuest")),
				h("div", { style: S.row },
					h("input", {
						value: host,
						placeholder: "/storage/emulated/0/Documents",
						style: Object.assign({}, fieldStyle(), { flex: 2 }),
						onChange: (event) => setHost(event.target.value)
					}),
					h("input", {
						value: guest,
						placeholder: "/mnt/docs",
						style: Object.assign({}, fieldStyle(), { flex: 1 }),
						onChange: (event) => setGuest(event.target.value)
					}),
					h(Button, { onClick: () => act("/mounts/add", { host, guest }) }, t("mountAdd"))
				),
				message !== "" ? h("div", { style: { fontSize: 12, marginTop: 8, color: "var(--dsw-alias-label-secondary, #666)" } }, message) : null,
				output !== ""
					? h("pre", { style: Object.assign({}, S.mono, { marginTop: 8, maxHeight: 160 }) }, output)
					: null,
				h("div", { style: S.row },
					h(Button, { kind: "primary", onClick: () => act("/server/restart", {}) }, t("mountRestart"))
				),
				h("div", { style: { fontSize: 11, marginTop: 6, color: "var(--dsw-alias-label-tertiary, #888)" } }, t("mountHint"))
			);
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
			return h("div", { style: S.card },
				h("div", { style: S.label }, t("exportRecent")),
				recent === null
					? h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" } }, t("busy"))
					: recent.length === 0
						? h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" } }, t("exportEmpty"))
						: recent.slice(0, 8).map((file) => h("div", { key: file.path, style: Object.assign({}, S.row, { marginBottom: 6 }) },
							h("span", {
								style: { fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
							}, file.path),
							h(Button, { onClick: () => doExport(file.path) }, t("export"))
						)),
				h("div", { style: S.label }, t("exportPath")),
				h("div", { style: S.row },
					h("input", {
						value: path,
						placeholder: "/root/1/tool-test-report.md",
						style: Object.assign({}, fieldStyle(), { flex: 1 }),
						onChange: (event) => setPath(event.target.value)
					}),
					h(Button, { kind: "primary", onClick: () => doExport(path) }, t("export"))
				),
				message !== "" ? h("div", { style: { fontSize: 12, marginTop: 8, color: "var(--dsw-alias-label-secondary, #666)" } }, message) : null,
				h("div", { style: { fontSize: 11, marginTop: 6, color: "var(--dsw-alias-label-tertiary, #888)" } }, t("exportHint"))
			);
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
			return h("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
				h(Button, { style: { minHeight: 26, padding: "2px 8px", fontSize: 12 }, onClick: run }, t("export")),
				message === "" ? null : h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)" } }, message)
			);
		}

		function HotCard(props) {
			const t = props.t;
			const packaged = props.packaged ?? "";
			const applied = props.applied ?? "";
			return h("div", { style: S.card },
				h("div", { style: S.row },
					h("strong", { style: { fontSize: 13 } }, t("hotTitle")),
					h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)" } },
						(applied === "" ? t("hotCurrent").replace("%s", packaged) : t("hotApplied").replace("%s", applied)))
				),
				h("div", { style: { fontSize: 11, marginTop: 6, color: "var(--dsw-alias-label-tertiary, #888)" } }, t("hotHint"))
			);
		}


		function UpdateCard(props) {
			const t = props.t;
			const app = props.app ?? "";
			const applied = props.applied ?? "";
			const packaged = props.packaged ?? "";
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
					if (data.ok !== true) throw new Error(data.error ?? "未知错误");
					setInfo(data);
					setState("done");
				} catch (error) {
					setState("failed");
					setMessage(String(error.message ?? error));
				}
			};
			react.useEffect(() => { check(); }, []);

			const hotNew = info !== null && info.hot !== undefined && info.hot.version !== ""
				&& info.hot.version !== current && info.hot.version !== packaged;
			const appNew = info !== null && info.app !== undefined
				&& (info.app.versionCode ?? 0) > versionCode;

			return h("div", { style: S.card },
				h("div", { style: S.row },
					h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)" } },
						t("updChannels").replace("%s", app).replace("%s", current || "-")),
					h("span", { style: { flex: 1 } }),
					h(Button, { onClick: check, disabled: state === "checking" },
						state === "checking" ? t("updChecking") : t("updCheck"))
				),
				state === "done" && !hotNew && !appNew
					? h("div", { style: { fontSize: 12, marginTop: 8, color: "var(--dsw-alias-label-secondary, #666)" } },
						t("updLatest").replace("%s", app))
					: null,
				state === "failed"
					? h("div", { style: { fontSize: 12, marginTop: 8, color: "var(--dsw-alias-label-secondary, #666)" } },
						t("updFailed").replace("%s", message))
					: null,
				hotNew
					? h("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.08))" } },
						h("div", { style: { fontSize: 13, fontWeight: 600 } },
							t("updHotTitle").replace("%s", String(info.hot.version).slice(0, 8))),
						h("div", { style: { fontSize: 11, margin: "4px 0 8px", color: "var(--dsw-alias-label-secondary, #666)" } },
							t("updHotHint").replace("%s", String(Math.round((info.hot.bytes ?? 54000) / 1024)))),
						h(Button, {
							kind: "primary",
							onClick: async () => {
								setMessage(t("busy"));
								try {
									const result = await call("/hot/fetch", { url: info.hot.url });
									setMessage(result.message ?? result.error ?? "");
								} catch (error) {
									setMessage(String(error.message ?? error));
								}
							}
						}, t("updHotApply"))
					)
					: null,
				appNew
					? h("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--dsw-alias-border-l3, rgba(0,0,0,0.08))" } },
						h("div", { style: { fontSize: 13, fontWeight: 600 } },
							t("updAppTitle").replace("%s", info.app.version)),
						h("div", { style: { fontSize: 11, margin: "4px 0 8px", color: "var(--dsw-alias-label-secondary, #666)" } },
							t("updAppHint").replace("%s", "143")),
						h(Button, {
							onClick: () => call("/open-url", { url: info.app.page ?? info.app.url })
						}, t("updAppDownload"))
					)
					: null,
				message !== "" ? h("div", { style: { fontSize: 12, marginTop: 8, color: "var(--dsw-alias-label-secondary, #666)" } }, message) : null
			);
		}

		function ShizukuCard(props) {
			const [output, setOutput] = react.useState("");
			const [command, setCommand] = react.useState("id");
			const shizuku = props.shizuku ?? {};
			const state = shizuku.installed !== true ? props.t("unavailable")
				: shizuku.granted === true ? props.t("granted") : props.t("denied");
			const colour = shizuku.granted === true ? "#3fb950" : "#d29922";
			return h("div", { style: S.card },
				h("div", { style: S.row },
					h("span", { style: Object.assign({}, S.dot, { background: colour }) }),
					h("strong", { style: { fontSize: 13 } }, state),
					shizuku.version !== undefined ? h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)" } }, "Shizuku " + String(shizuku.version)) : null,
					h("span", { style: { flex: 1 } }),
					shizuku.installed === true && shizuku.granted !== true
						? h(Button, { kind: "primary", onClick: () => props.act("/shizuku/request") }, props.t("request"))
						: null
				),
				h("div", { style: S.label }, props.t("testCommand")),
				h("div", { style: S.row },
					h("input", {
						value: command,
						style: Object.assign({}, fieldStyle(), { flex: 1 }),
						onChange: (event) => setCommand(event.target.value)
					}),
					h(Button, {
						disabled: shizuku.granted !== true,
						onClick: async () => {
							try {
								const result = await call("/shizuku/exec", { command });
								setOutput("exit " + result.exit + "\n" + (result.stdout ?? "") + (result.stderr ?? ""));
							} catch (error) {
								setOutput(String(error.message ?? error));
							}
						}
					}, props.t("run"))
				),
				output !== "" ? h("div", { style: Object.assign({}, S.mono, { marginTop: 8 }) }, output) : null
			);
		}

		function AndroidSection(props) {			const t = (key) => props.t(key);
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

			if (bridge() === null) {
				return h("div", { style: { padding: "0 0 24px" } },
					h("div", { style: S.h }, t("title")),
					h("div", { style: S.card }, t("noBridge"))
				);
			}
			if (snapshot === null) {
				return h("div", { style: { padding: "0 0 24px" } },
					h("div", { style: S.h }, t("title")),
					h("div", { style: S.card }, error === null ? t("busy") : error)
				);
			}

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

			return h("div", { style: { padding: "0 0 24px" } },
				h("div", { style: S.h }, t("title")),
				h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", marginBottom: 12 } }, t("subtitle")),

				h(StatusCard, { status: snapshot.status, t, act, message }),

				h("div", { style: S.h }, t("distros")),
				(snapshot.distros ?? []).map((distro) => h(DistroCard, {
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
						setMessage("saved");
						await reload();
					}
				})),

				h("div", { style: S.h }, t("hotTitle")),
			h(UpdateCard, {
				t,
				app: snapshot.appVersion,
				versionCode: snapshot.appVersionCode,
				packaged: snapshot.packagedHotVersion,
				applied: snapshot.hotVersion
			}),
			h(HotCard, { t, packaged: snapshot.packagedHotVersion, applied: snapshot.hotVersion }),

			h("div", { style: S.h }, t("exportTitle")),
			h(ExportCard, { t }),

			h("div", { style: S.h }, t("mounts")),
			h(MountsCard, { t, mounts: snapshot.mounts, onChanged: reload }),

			h("div", { style: S.h }, t("shizuku")),
				h(ShizukuCard, { shizuku: snapshot.shizuku, t, act }),

				h("div", { style: S.h }, t("settings")),
				h(SettingsCard, { settings: snapshot.settings, t, onSaved: reload }),

				h("div", { style: S.h }, t("log")),
				h("div", { style: S.row },
					h(Button, { onClick: reload }, t("refresh")),
					h(Button, {
						onClick: async () => {
							await call("/log/clear", {});
							await reload();
						}
					}, t("clear"))
				),
				h("div", { style: Object.assign({}, S.mono, { marginTop: 8 }) }, (snapshot.log ?? []).join("\n") || "（无输出）")
			);
		}

		function SettingsCard(props) {
			const t = props.t;
			const [form, setForm] = react.useState(null);
			react.useEffect(() => {
				if (props.settings !== undefined) setForm(Object.assign({}, props.settings));
			}, [props.settings]);
			if (form === null) return null;
			const update = (key, value) => setForm(Object.assign({}, form, { [key]: value }));
			return h("div", { style: S.card },
				h("div", { style: S.label }, t("port")),
				h("input", {
					value: String(form.port ?? ""),
					inputMode: "numeric",
					style: fieldStyle(),
					onChange: (event) => update("port", event.target.value)
				}),
				h("div", { style: S.label }, t("apiKey")),
				h("input", {
					type: "password",
					value: form.apiKey ?? "",
					style: fieldStyle(),
					onChange: (event) => update("apiKey", event.target.value)
				}),
				[["shareStorage", "share"], ["keepAwake", "keepAwake"], ["autoRestart", "autoRestart"]].map(([key, label]) => h("label", {
					key,
					style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 10 }
				},
					h("input", {
						type: "checkbox",
						checked: form[key] === true,
						onChange: (event) => update(key, event.target.checked)
					}),
					t(label)
				)),
				h(Button, {
					kind: "primary",
					style: { marginTop: 12 },
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
				}, t("save"))
			);
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
						style: Object.assign({}, fieldStyle(), {
							flex: 1,
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: 13
						}),
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
					h(Button, { onClick: () => sendLine() }, t("termSend")),
					h(Button, { onClick: paste }, t("termPaste"))
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
