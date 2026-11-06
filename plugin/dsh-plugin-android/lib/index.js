/**
 * dsh-plugin-android — host half.
 *
 * Two seams this uses, both public:
 *
 *   systemPrompt.section()  adds an ordered block to the model-visible system
 *                           prompt. The stock Web bundle already contributes
 *                           `app:web-surface` describing the browser GUI; this
 *                           plugin slots in right after it and describes what
 *                           the session actually is here — a phone, inside a
 *                           PRoot sandbox, with a mobile-sized screen and an
 *                           Android control channel.
 *   shellEnv.register()     publishes the loopback control-bridge address so
 *                           shell tools and the model can address it by name.
 *
 * plus one more, for the floating ball's own conversation (`app:ball-surface`):
 *
 *   The ball's thread is created by this package's client half
 *   (`installBallInbox`: `remote.session.create` → `rename("悬浮球")` →
 *   `prompt`). The user is in another app with a one-line bubble and a one-line
 *   input bar, so anything that needs the DSH GUI cannot be answered at all.
 *   Rather than asking the model to remember that, the two things that would
 *   need the GUI are removed structurally for those sessions:
 *
 *     * the GUI question tools are withheld from the tool assembly
 *       (`system-prompt/assemble`), so no card can be rendered;
 *     * the session's permission preset is pinned to full access, so no
 *       approval card can appear mid-task. See BALL_DEFAULTS.permissionPreset
 *       for the consequence of that and how to turn it off.
 *
 *   What is left — how to ask in plain text with numbered options, how to reply
 *   into a bubble — is the `floating-ball` skill plus the prompt section below,
 *   which is contributed only for a ball session (an empty section is dropped
 *   from the prompt by the registry).
 *
 * The browser half (exports["./client"]) adds the matching settings page.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { disposeTerminalSessions, runTerminalAction } from "./terminal.js";

const ANDROID_SURFACE_SECTION = "app:android-surface";

/** The section name for the floating ball's own conversation. */
const BALL_SURFACE_SECTION = "app:ball-surface";

/** The title this package's client half pins on the ball's session. */
const BALL_SESSION_TITLE = "悬浮球";

/** Session-id prefix reserved for ball sessions, if one is ever minted. */
const BALL_SESSION_PREFIX = "session-ball-";

/** Agent preset name reserved for the ball, if a composition ever declares one. */
const BALL_AGENT_PRESET = "ball";

/**
 * Tools that can only be answered in the DSH GUI.
 *
 * `ask_user_question` renders a card with options and waits for a click;
 * `request_user_input` is the same shape under another name. Both are dead
 * weight in a ball session: the user has no card to click, so a call to either
 * one hangs until it is aborted. The list is config, not a constant, so an
 * install that gains another such tool can extend it without a new build.
 */
const BALL_WITHHELD_TOOLS = ["ask_user_question", "request_user_input"];

/**
 * Written for the model, not the user. Kept short: it is the *reminder* next to
 * the skill, not a replacement for it. No `{{` may appear here — a registered
 * section is scanned for prompt variables, and a malformed reference throws.
 */
const BALL_SURFACE_PROMPT = `这次对话是悬浮球（floating ball）自己的对话，不是 DSH 窗口里的会话。

用户很可能正在别的 App 里，眼前只有球上那一行气泡，回话只能靠球下面那条一行输入条。任何"要点一下才能回答"的东西都到不了他手上。

- 需要澄清时写成一条普通消息：一句话问一件事，下面给编号选项，例如「1 按日期分（默认） 2 按类型分 3 先别动」。用户回一个数字就能继续。
- 能自己拍板就别问：选一个合理默认值往下做，做完在结论里说明你按什么做的。只有不可逆、会误解、或只有用户知道的事才停下来问。
- 一个任务里不要每步都问用户；先说一句「我开始做了」，然后自己把活干完，最后给结论。
- 回复适配球上的小气泡：球上最多显示 3 行 / 约 180 字，**最后一条消息的前两三行必须能独立读懂**（问题、结论、"还差什么"都写在那儿）；细节等用户要了再展开；中文；不要大表格、长代码块、重 markdown 排版。
- 球上的状态行由外部总结器维护，不要为了汇报进度去调用 ball；把消息本身写好就行。
- 作业规范全文在 skill floating-ball 里：开工前先调用 skill 工具加载它并遵守。`;

/**
 * Defaults for the ball surface; the Loader row's `config` overrides them.
 *
 * `permissionPreset: "danger-full-access"` is the one setting with a real
 * consequence, so it is stated plainly here and in the README: a ball session
 * runs with the sandbox unconfined and the approval policy at `never`, i.e.
 * anything the user types into the ball executes without a confirmation card.
 * That is the *point* — the user cannot confirm anything from another app, so
 * an `ask` policy would either hang the task or silently fail it closed — but
 * it means the ball's thread must be treated as a trusted channel. To turn the
 * behaviour back to asking (a card in the DSH GUI, as before this change), set
 * this key to `""` in the plugin row's config:
 *
 *     - id: android-sandbox
 *       name: 'dsh-plugin-android'
 *       config:
 *         permissionPreset: ''
 *
 * With `""` the session keeps whatever preset it was created with; a new ball
 * session then starts at the deployment default (`workspace-write` + `ask` on
 * this phone) and its approval cards land in the DSH GUI again. `withheldTools`
 * and `title`/`sessionPrefix`/`agentPreset` are the other knobs; `enabled:
 * false` removes the whole ball surface.
 */
const BALL_DEFAULTS = {
	/** Master switch for the ball surface. */
	enabled: true,
	/** Session title the client half pins on the ball's thread. */
	title: BALL_SESSION_TITLE,
	/** Session-id prefix that also marks a ball session. */
	sessionPrefix: BALL_SESSION_PREFIX,
	/** Agent preset name that also marks a ball session. */
	agentPreset: BALL_AGENT_PRESET,
	/** GUI-only tools withheld from a ball session's tool assembly. */
	withheldTools: BALL_WITHHELD_TOOLS,
	/** Permission preset pinned on a ball session; '' keeps the session's own. */
	permissionPreset: "danger-full-access",
	/** The prompt section's text; a string replaces it wholesale. */
	promptText: undefined,
	/**
	 * Where the ball hooks record why they fired or did not. One line per
	 * session, so a device-side "it didn't work" can be answered from the file
	 * instead of a guess; `''` turns it off.
	 */
	diagFile: `${process.env.DSH_HOME ?? "/root/.dsh"}/ball-surface/diag.jsonl`
};

/**
 * Written for the model, not the user. Keeps to facts that change behaviour:
 * where files are, what the screen is, what is slow, what can be reached.
 */
const ANDROID_SURFACE_PROMPT = `You are running on the user's Android phone, inside a PRoot sandbox — not on a desktop, not in the cloud.

Environment facts:
- The sandbox is an Ubuntu rootfs (glibc, aarch64) owned by the DSH Android app. It is a minimal base: \`node\` (official build, /usr/local/bin/node), \`npm\`, \`bash\`, \`apt\`/\`dpkg\`, \`tar\`, \`gzip\` and \`perl\` are present; \`python3\`, \`git\`, \`curl\`, \`make\` and compilers are NOT. Install what you need with \`apt update && apt install -y <pkg>\` — the first update downloads the index and takes a minute. There is no systemd, no display server, and no root beyond the faked uid 0 inside the sandbox.
- \`/root\` is the harness home and persists across restarts. \`/opt/dsh\` holds the harness installation and \`/opt/dsh/android\` the app's own guest-side services; treat both as read-only unless the user asks otherwise.
- \`/sdcard\` is the phone's shared storage (Downloads, Documents, DCIM) bind-mounted read-write, but only once the user has granted storage access to the app. Extra folders the user mounted appear at their own paths (listed under 挂载/Mounts in the app's settings page). If a path is missing or unreadable, say so rather than retrying.
- The phone's privileged Android surface can be reached with the \`shiz\` CLI (e.g. \`shiz settings get global airplane_mode_on\`, \`shiz pm list packages\`, \`shiz am start -n pkg/.Activity\`). It runs the command as the Android shell user through Shizuku, so it can do what \`adb shell\` can. It only works while the user has granted Shizuku in the DSH app; without it the command fails, and that failure is not fixable from inside the sandbox.
- Network works, but the phone may be on mobile data or behind a VPN in "fake-IP" mode where every public hostname resolves into 198.18.0.0/15. \`web_fetch\` refuses non-public addresses by design, so it reports WEB_BLOCKED_URL for hosts that are perfectly reachable. When that happens, fetch with \`node -e 'fetch(url).then(r => r.text()).then(console.log)'\` from \`bash\` instead of retrying web_fetch.
- Android's filesystem refuses hard links, so file creation goes through a copy-based publish path locally. If a newly written file ever shows up as a dangling symlink, that is a sandbox bug worth reporting rather than working around.
- Files opened through the Web UI (attachments, workspace picks) live inside the sandbox; /sdcard is the path that reaches the user's own storage.
- The floating ball is the only thing the user sees while they are in another app. Its status field is \`ball_doing\`: one short line saying what is running right now, and an empty \`ball_doing\` means "nothing running, fold the bubble away". You do NOT report to it — a separate summarizer watches the work and keeps that line up to date, so there is nothing to remember and nothing to do per step. The \`ball\` command still exists for scripts and for anything that wants to put one line on the ball itself: \`ball "<line>"\`, \`ball --doing "<line>"\`, \`ball --json '{"ball_doing":"<line>"}'\`, \`ball think\`, \`ball done "<line>"\`, \`ball idle\`. A reply is never expected to call it.

Android tools (they go through the app's control bridge, not \`shiz\`):
- \`android_info\` reads device/system/screen/battery/network/storage state plus the capability matrix; \`android_clipboard\` reads or writes the clipboard; \`android_notify\` shows a toast, posts or cancels a notification, or vibrates; \`android_control\` changes volume/brightness/do-not-disturb, shares text, opens a URL/app/settings page, runs a global action or launches an app; \`android_screenshot\` captures the screen to a JPEG file and returns its path and size (the image itself is not put into the context); \`android_biometric\` asks the user for a fingerprint/face or lock-screen credential confirmation; \`terminal_tabs\` lists, opens, activates or closes the terminal tabs of the DSH page; \`terminal\` runs a command in the sandbox or keeps a persistent AI terminal session (\`exec\`/\`start\`/\`write\`/\`read\`/\`close\`/\`list\`). An AI terminal is its own PTY in the same PRoot guest, not one of the page's visible tabs; it runs as the same root user and reaches the same files.
- Which capabilities are sensitive is the **user's** choice, set per capability at 设置 → 安卓沙箱 → AI 授权 (defaults: clipboard, 操作手机设置, 截屏; the rest pass directly). Only a capability the user marked high-risk asks for confirmation, and only the first time it is used in a conversation; that conversation is then remembered. Unmarked capabilities are allowed directly, with no prompt. If the user declines, the tool fails with a readable reason — do not retry in a loop and do not look for a way around it; tell the user what was refused.
- The user reviews and revokes grants and changes the high-risk set at 设置 → 安卓沙箱 → AI 授权; after a revoke the next high-risk call asks again.
- This gate guards the AI entry point, not the bridge: plugins that hold the bridge token and call \`/android/*\` directly are not subject to these per-conversation grants. That is not a way around a refusal — the user's decision stands, and you must not route a declined action through such a plugin.
- \`terminal_tabs\` needs the DSH page to be open in the app (the app relays each command to the page). If it reports that the page did not answer, ask the user to switch back to the DSH page instead of retrying.
- \`terminal\` does not need the DSH page: it starts its own PTY in the guest. Use it for real shell work (builds, scripts, package installs); use \`terminal_tabs\` only when the user asked to see or drive the page's visible tabs. Both go through the same 设置 → 安卓沙箱 → AI 授权 中的「终端」能力。`;

/** Loopback bridge of the DSH Android app; the app exports these on launch. */
const BRIDGE_URL_VAR = "DSH_ANDROID_BRIDGE_URL";
const BRIDGE_TOKEN_VAR = "DSH_ANDROID_BRIDGE_TOKEN";

function bridgeUrl() {
  return process.env[BRIDGE_URL_VAR] ?? "";
}

function bridgeToken() {
  return process.env[BRIDGE_TOKEN_VAR] ?? "";
}

/* ======================================================================
 * AI tools (docs/AI-API.md §4)
 * ----------------------------------------------------------------------
 * The app, not this plugin, owns the permission decision: `/ai/android`
 * and `/ai/terminal/tabs` take the calling conversation's session id and,
 * on the first call for a capability, pop the system biometric sheet and
 * remember the grant under that id. `exec.agent.id` is therefore the whole
 * authorization key — never reuse a constant or a title here.
 *
 * `@deepseek-ai/dsh-tools` is deliberately not imported: this plugin is
 * shipped as a hot package, where that package does not resolve from the
 * profile. The raw ToolDefinition shape is built by hand instead.
 * ========================================================================== */

const AI_ANDROID_PATH = "/ai/android";
const AI_TERMINAL_TABS_PATH = "/ai/terminal/tabs";
const AI_CONSENT_PATH = "/ai/consent";
const BIOMETRIC_PATH = "/android/biometric";

/** One normal bridge round-trip; the app answers in milliseconds. */
const AI_TIMEOUT_MS = 20000;
/** A first call may block on the system biometric sheet (the app caps it at 60s). */
const AI_CONSENT_TIMEOUT_MS = 70000;
/** The consent preflight is a loopback GET; do not wait long on an app without it. */
const AI_PREFLIGHT_TIMEOUT_MS = 5000;

/** `render` is model-facing text; keep one result under this many characters. */
const AI_RENDER_LIMIT = 16000;

/** The six capabilities from the contract, named for a human. */
const AI_CAPABILITY_LABELS = {
  read: "读取设备与状态",
  clipboard: "剪贴板",
  notify: "提示与通知",
  control: "操作手机设置",
  screenshot: "截屏",
  terminal: "终端（标签页与命令）"
};

/**
 * What to tell the model when the app answers with `needs`.
 *
 * The value is not an error code to swallow: every entry names the switch the
 * user would have to flip, because "failed" with no next step is how a phone
 * assistant gets called useless.
 */
const AI_NEEDS_HINTS = {
  consent: "用户拒绝了这个对话的授权，或当前高危能力配置不允许这次调用（可在 设置 → 安卓沙箱 → AI 授权 查看或调整）",
  biometric: "需要先在系统里录入指纹/人脸或设置锁屏，然后再试一次",
  foreground: "请回到 DSH 页面再试",
  android9: "需要 Android 9 及以上",
  android11: "需要 Android 11 及以上",
  android12: "需要 Android 12 及以上",
  accessibility: "需要先在 设置 → 安卓沙箱 → 手机助手 打开无障碍服务",
  overlay: "需要在 设置 → 安卓沙箱 里授予悬浮窗权限",
  write_settings: "需要在 设置 → 应用 → DSH → 修改系统设置 里授权",
  dnd_access: "需要在系统「勿扰」设置里授予 DSH 访问权限（设置 → 通知 → 勿扰）",
  notification: "请在 设置 → 应用 → DSH → 通知 里打开通知",
  microphone: "需要在 设置 → 应用 → DSH → 权限 → 麦克风 里授权",
  shizuku: "需要先在 Shizuku 应用里授予 DSH 权限",
  battery: "请在 设置 → 应用 → DSH → 电池 里允许后台运行"
};

/** The message field of an error, for messages that wrap another failure. */
function describeError(error) {
  if (error === null || error === undefined) return "未知错误";
  if (typeof error === "string") return error;
  return typeof error.message === "string" && error.message !== "" ? error.message : String(error);
}

/**
 * One authenticated JSON call to the loopback control bridge.
 *
 * `options.method` defaults to POST; the body is serialized only when supplied,
 * so GETs carry no `Content-Type`. The timeout covers the response body read
 * too — a bridge that accepts the connection and then stalls is the same
 * failure to the caller as one that never answers.
 *
 * @param path - bridge path, e.g. `/ai/android`.
 * @param options - `{ method, body, timeoutMs, signal }`.
 * @returns The parsed JSON object the bridge answered with.
 */
async function bridgeRequest(path, options = {}) {
  const base = bridgeUrl();
  if (base === "") {
    throw new Error("安卓控制桥不可用：没有拿到 DSH_ANDROID_BRIDGE_URL（这个会话不在 DSH Android 应用里运行）");
  }
  const url = base.replace(/\/+$/, "") + path;
  const timeoutMs = typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : AI_TIMEOUT_MS;
  const signal = options.signal;
  const method = typeof options.method === "string" ? options.method : "POST";
  const body = options.body;
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => {
    cancelled = true;
    controller.abort();
  };
  const external = signal !== undefined && signal !== null && typeof signal.addEventListener === "function";
  if (external) {
    if (signal.aborted === true) onAbort();
    else signal.addEventListener("abort", onAbort);
  }
  const cleanup = () => {
    clearTimeout(timer);
    if (external) signal.removeEventListener("abort", onAbort);
  };
  let response;
  let text;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined
        ? { "X-Dsh-Token": bridgeToken() }
        : { "X-Dsh-Token": bridgeToken(), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (timedOut) throw new Error(`安卓控制桥 ${Math.round(timeoutMs / 1000)} 秒内没有响应（${path}），请稍后重试`);
    if (cancelled) throw new Error("调用已被取消");
    throw new Error(`连不上安卓控制桥（${base}）：${describeError(error)}。请确认 DSH Android 应用正在运行`);
  } finally {
    cleanup();
  }
  let data;
  try {
    data = text === "" ? {} : JSON.parse(text);
  } catch (error) {
    throw new Error(`安卓控制桥返回了无法解析的响应（${path}）：${String(text).slice(0, 200)}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`安卓控制桥返回了意外响应（${path}）`);
  }
  if (response.ok !== true) {
    const message = typeof data.error === "string" && data.error !== "" ? data.error : `HTTP ${response.status}`;
    throw new Error(`安卓控制桥拒绝了请求（${path}）：${message}`);
  }
  return data;
}

/** A readable `Error` for one failed `{ ok: false, error, hint, needs }` answer. */
function aiFailure(data, path) {
  const parts = [];
  const message = typeof data.error === "string" && data.error.trim() !== ""
    ? data.error.trim()
    : `安卓接口失败（${path}）`;
  const capability = typeof data.capability === "string" && data.capability !== ""
    ? `（能力：${AI_CAPABILITY_LABELS[data.capability] ?? data.capability}）`
    : "";
  parts.push(message + capability);
  if (typeof data.needs === "string" && data.needs !== "" && AI_NEEDS_HINTS[data.needs] !== undefined) {
    parts.push(AI_NEEDS_HINTS[data.needs]);
  }
  if (typeof data.hint === "string" && data.hint.trim() !== "") parts.push(data.hint.trim());
  return new Error(parts.join("；"));
}

/** `{ ok: true, ...result }` — the contract's uniform tool value. */
function unwrapAiResult(data) {
  const { ok: _ok, ...rest } = data;
  return { ok: true, ...rest };
}

/** Whether `session` already holds `capability`, so no biometric sheet is due. */
async function hasGrant(session, capability, signal) {
  if (session === "" || capability === "") return false;
  try {
    const data = await bridgeRequest(AI_CONSENT_PATH, {
      method: "GET",
      timeoutMs: AI_PREFLIGHT_TIMEOUT_MS,
      signal
    });
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    for (const entry of sessions) {
      if (entry === null || typeof entry !== "object" || entry.session !== session) continue;
      const grants = Array.isArray(entry.grants) ? entry.grants : [];
      return grants.some((grant) => grant !== null && typeof grant === "object" && grant.capability === capability);
    }
    return false;
  } catch {
    // An app without GET /ai/consent — or a transient failure — is exactly the
    // case where the call may pop the confirmation: the long budget is right.
    return false;
  }
}

/**
 * The timeout for one capability call.
 *
 * A granted capability cannot prompt, so it gets the normal budget; a call
 * that may still pop the biometric sheet gets the long one. This is a hint
 * only — the app is authoritative and its 60s cap is below both values.
 */
async function timeoutFor(session, capability, signal) {
  const granted = await hasGrant(session, capability, signal);
  return granted ? AI_TIMEOUT_MS : AI_CONSENT_TIMEOUT_MS;
}

/**
 * Pass the app's existing `terminal` capability check before touching a PTY.
 *
 * The terminal was already a capability (the page-tab relay gates on it); the
 * AI terminal reuses that switch rather than inventing a second one. A `list`
 * is enough to run the app's high-risk check without touching the page: if the
 * user marked 终端 as high-risk, this is where the system biometric sheet
 * appears, and only a granted call gets past it.
 */
async function ensureTerminalAccess(session, title, signal) {
  const payload = { session, action: "list" };
  if (title !== "") payload.sessionTitle = title;
  const timeoutMs = await timeoutFor(session, "terminal", signal);
  const data = await bridgeRequest(AI_TERMINAL_TABS_PATH, { body: payload, timeoutMs, signal });
  if (data.ok !== true) throw aiFailure(data, AI_TERMINAL_TABS_PATH);
  return data;
}

/** The calling conversation's id: the authorization key. */
function sessionIdOf(exec) {
  const id = exec?.agent?.id;
  if (typeof id === "string" && id !== "") return id;
  throw new Error("这个工具需要在 DSH 会话里运行：拿不到会话 id，无法按对话请求安卓授权");
}

/** The conversation's title, best effort, so the app can show it in 设置. */
function sessionTitleOf(ctx, exec) {
  try {
    const session = exec?.agent?.session;
    if (session === undefined || session === null) return "";
    const title = ctx.sessionProjections?.stateOf?.(session, "title");
    if (typeof title === "string") return title.trim();
  } catch {
    /* no projection service: the title is optional */
  }
  return "";
}

/** A model-facing text block; the render side of every AI tool. */
function renderToolValue(value) {
  let text;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = "";
  }
  if (typeof text !== "string" || text === "") text = String(value ?? "");
  if (text.length <= AI_RENDER_LIMIT) return text;
  return `${text.slice(0, AI_RENDER_LIMIT)}\n…（结果超过约 16KB，已截断；完整结果没有放进上下文）`;
}

/** One parameter schema: an object with the named properties and allowed ones only. */
function objectParameters(properties, required) {
  return {
    type: "object",
    properties: properties ?? {},
    ...(Array.isArray(required) && required.length > 0 ? { required } : {}),
    additionalProperties: false
  };
}

/**
 * The shared output contract.
 *
 * `additionalProperties: true` is load-bearing: the app's answer is forwarded
 * almost verbatim (tabs, file, width, battery, …), and a schema that demanded
 * named fields would reject a perfectly good result from a newer app.
 */
const AI_TOOL_OUTPUT = {
  schema: {
    type: "object",
    properties: {
      ok: { type: "boolean", description: "Whether the call succeeded." }
    },
    required: ["ok"],
    additionalProperties: true
  },
  render: (_args, value) => [{ type: "text", text: renderToolValue(value) }]
};

/** Exported for the tool-level tests; the plugin itself only uses it internally. */
export { createAiToolDefinitions };

/** Run one AI tool: the capability check, the bridge call, the readable failure. */
async function executeAiTool(ctx, spec, args, exec) {
  const input = args !== null && typeof args === "object" && !Array.isArray(args) ? args : {};
  const session = sessionIdOf(exec);
  const signal = exec?.signal;
  const title = sessionTitleOf(ctx, exec);

  if (spec.kind === "biometric") {
    // The reason is the *subtitle* of the system sheet: the app prefixes its
    // own "DSH 请求：" title, so passing reason as title would fight it.
    const subtitle = typeof input.reason === "string" && input.reason.trim() !== ""
      ? input.reason.trim()
      : "请确认这次操作";
    const data = await bridgeRequest(BIOMETRIC_PATH, {
      body: { subtitle },
      timeoutMs: AI_CONSENT_TIMEOUT_MS,
      signal
    });
    if (data.ok !== true) throw aiFailure(data, BIOMETRIC_PATH);
    return unwrapAiResult(data);
  }

  if (spec.kind === "terminal") {
    const action = typeof input.action === "string" ? input.action : "";
    if (!["list", "open", "activate", "close"].includes(action)) {
      throw new Error("terminal_tabs 的 action 必须是 list / open / activate / close");
    }
    const id = typeof input.id === "string" ? input.id : "";
    if ((action === "activate" || action === "close") && id === "") {
      throw new Error(`terminal_tabs 的 ${action} 需要 id：先用 action="list" 看一下标签页 id`);
    }
    const payload = { session, action };
    if (title !== "") payload.sessionTitle = title;
    if (id !== "") payload.id = id;
    const timeoutMs = await timeoutFor(session, "terminal", signal);
    const data = await bridgeRequest(AI_TERMINAL_TABS_PATH, { body: payload, timeoutMs, signal });
    if (data.ok !== true) throw aiFailure(data, AI_TERMINAL_TABS_PATH);
    return unwrapAiResult(data);
  }

  if (spec.kind === "pty") {
    // The app owns the permission decision (including a possible biometric
    // sheet); the PTY itself is only started after that gate answers ok.
    await ensureTerminalAccess(session, title, signal);
    return runTerminalAction(input);
  }

  const request = spec.request(input);
  const payload = {
    session,
    path: request.path,
    method: request.method,
    query: request.query ?? "",
    body: request.body ?? {}
  };
  if (title !== "") payload.sessionTitle = title;
  const timeoutMs = await timeoutFor(session, spec.capability, signal);
  const data = await bridgeRequest(AI_ANDROID_PATH, { body: payload, timeoutMs, signal });
  if (data.ok !== true) throw aiFailure(data, request.path);
  return unwrapAiResult(data);
}

/** Build one raw ToolDefinition (the shape `ctx.tools.register` accepts). */
function aiToolDefinition(ctx, spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: AI_TOOL_OUTPUT,
    execute: (args, exec) => executeAiTool(ctx, spec, args, exec)
  };
}

/** The seven tools from the contract, each mapped onto the endpoint it wraps. */
function createAiToolDefinitions(ctx) {
  const post = (path, body) => ({ path, method: "POST", body });
  return [
    aiToolDefinition(ctx, {
      name: "android_info",
      description: "读取这台 Android 手机的状态：设备与系统、屏幕、电池、网络、存储，以及能力矩阵（哪些权限/服务已开启）。只读，不改动手机。若用户把「读取设备与状态」设为高危能力，第一次用于某个对话时会要求指纹/人脸确认；否则直接放行（设置 → 安卓沙箱 → AI 授权 里配置）。",
      capability: "read",
      parameters: objectParameters({}),
      request: () => ({ path: "/android/info", method: "GET", body: {} })
    }),
    aiToolDefinition(ctx, {
      name: "android_clipboard",
      description: "读写手机剪贴板。action=get 读取当前文本；action=set 把 text 写入剪贴板。若用户把「剪贴板」设为高危能力，第一次用于某个对话时会要求指纹/人脸确认；否则直接放行（设置 → 安卓沙箱 → AI 授权 里配置）。",
      capability: "clipboard",
      parameters: objectParameters({
        action: { type: "string", enum: ["get", "set"], description: "get 读取；set 写入。" },
        text: { type: "string", description: "action=set 时要写入的文本。" }
      }, ["action"]),
      request: (input) => {
        if (input.action === "get") return { path: "/android/clipboard", method: "GET", body: {} };
        if (input.action === "set") {
          const text = typeof input.text === "string" ? input.text : "";
          if (text === "") throw new Error("android_clipboard 写剪贴板需要 text");
          return post("/android/clipboard", { text });
        }
        throw new Error("android_clipboard 的 action 必须是 get 或 set");
      }
    }),
    aiToolDefinition(ctx, {
      name: "android_notify",
      description: "在手机上提醒用户：action=toast 弹一条轻提示（text）、action=notify 发一条通知（title 和/或 text，可选 id）、action=cancel 取消通知（id 或 all=true 二选一）、action=vibrate 震动（ms）。若用户把「提示与通知」设为高危能力，第一次用于某个对话时会要求指纹/人脸确认；否则直接放行（设置 → 安卓沙箱 → AI 授权 里配置）。",
      capability: "notify",
      parameters: objectParameters({
        action: { type: "string", enum: ["toast", "notify", "cancel", "vibrate"], description: "要做的提示动作。" },
        text: { type: "string", description: "toast/notify 的正文。" },
        title: { type: "string", description: "notify 的标题。" },
        id: { type: "integer", description: "notify/cancel 的通知 id（1–999）。" },
        all: { type: "boolean", description: "cancel 时取消全部插件通知。" },
        ms: { type: "integer", description: "vibrate 的时长（毫秒）。" }
      }, ["action"]),
      request: (input) => {
        const number = (key, min, max) => {
          const value = input[key];
          if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
          return Math.min(max, Math.max(min, Math.round(value)));
        };
        if (input.action === "toast") {
          const text = typeof input.text === "string" ? input.text : "";
          if (text === "") throw new Error("android_notify 的 toast 需要 text");
          return post("/android/toast", { text });
        }
        if (input.action === "notify") {
          const body = {};
          const title = typeof input.title === "string" ? input.title : "";
          const text = typeof input.text === "string" ? input.text : "";
          if (title === "" && text === "") throw new Error("android_notify 的 notify 至少需要 title 或 text");
          if (title !== "") body.title = title;
          if (text !== "") body.text = text;
          const id = number("id", 1, 999);
          if (id !== undefined) body.id = id;
          return post("/android/notify", body);
        }
        if (input.action === "cancel") {
          if (input.all === true) return post("/android/notify/cancel", { all: true });
          const id = number("id", 1, 999);
          if (id === undefined) {
            throw new Error("android_notify 的 cancel 需要 id（取消哪条通知）或 all=true（取消全部插件通知）");
          }
          return post("/android/notify/cancel", { id });
        }
        if (input.action === "vibrate") {
          const body = {};
          const ms = number("ms", 1, 60000);
          if (ms !== undefined) body.ms = ms;
          return post("/android/vibrate", body);
        }
        throw new Error("android_notify 的 action 必须是 toast / notify / cancel / vibrate");
      }
    }),
    aiToolDefinition(ctx, {
      name: "android_control",
      description: "改动手机或拉起界面，params 直接透传给对应接口。示例：volume {\"stream\":\"music\",\"percent\":30}；brightness {\"brightness\":50}；dnd {\"filter\":\"priority\"}；share {\"text\":\"看这个\"}；open {\"url\":\"https://example.com\"}；global {\"action\":\"home\"}（global 还支持 {\"action\":\"dismiss_notifications\"} 与 {\"action\":\"screenshot\"}）；apps {\"action\":\"launch\",\"package\":\"com.tencent.mm\"}。字段全集：volume（stream/percent/adjust/ringer/media）、brightness（brightness/auto/rotation/keepOn）、dnd（filter）、share（text/title）、open（url/package/settings）、global（back/home/recents/notifications/lock/quick_settings/power_dialog/split_screen/dismiss_notifications/screenshot）、apps（action=launch|details|uninstall + package）。若用户把「操作手机设置」设为高危能力，第一次用于某个对话时会要求指纹/人脸确认；否则直接放行（设置 → 安卓沙箱 → AI 授权 里配置）。",
      capability: "control",
      parameters: objectParameters({
        action: { type: "string", enum: ["volume", "brightness", "dnd", "share", "open", "global", "apps"], description: "要改哪一类。" },
        params: { type: "object", additionalProperties: true, description: "对应接口的字段，例如 {stream:\"music\",percent:30}。" }
      }, ["action"]),
      request: (input) => {
        const params = input.params !== null && typeof input.params === "object" && !Array.isArray(input.params) ? input.params : {};
        const routes = {
          volume: "/android/volume",
          brightness: "/android/display",
          dnd: "/android/dnd",
          share: "/android/share",
          open: "/android/open",
          global: "/android/global",
          apps: "/android/apps"
        };
        const path = routes[input.action];
        if (path === undefined) {
          throw new Error("android_control 的 action 必须是 volume / brightness / dnd / share / open / global / apps");
        }
        return post(path, params);
      }
    }),
    aiToolDefinition(ctx, {
      name: "android_screenshot",
      description: "截一张手机屏幕，保存成 JPEG 文件并返回路径、宽高与字节数；截图内容不会进入上下文（需要时可让用户打开那个文件）。若用户把「截屏」设为高危能力，第一次用于某个对话时会要求指纹/人脸确认；否则直接放行（设置 → 安卓沙箱 → AI 授权 里配置）。另外需要开启无障碍服务和 Android 11 及以上。",
      capability: "screenshot",
      parameters: objectParameters({}),
      request: () => post("/android/screenshot", {})
    }),
    aiToolDefinition(ctx, {
      name: "android_biometric",
      description: "请求用户在手机上做一次指纹/人脸（或锁屏凭据）确认，用来确认敏感操作。不需要按对话授权：每次调用都会真的弹窗。reason 会显示在系统弹窗上。",
      kind: "biometric",
      parameters: objectParameters({
        reason: { type: "string", description: "为什么需要确认，会显示给用户。" }
      })
    }),
    aiToolDefinition(ctx, {
      name: "terminal_tabs",
      description: "管理 DSH 页面里的终端标签页：action=list 列出、open 新建、activate 切换到 id、close 关闭 id。返回 tabs（id/title/active）与 activeId。若用户把「终端标签页」设为高危能力，第一次用于某个对话时会要求指纹/人脸确认；否则直接放行（设置 → 安卓沙箱 → AI 授权 里配置）。页面不在前台/被冻结时可能没有响应，需要用户回到 DSH 页面。",
      kind: "terminal",
      parameters: objectParameters({
        action: { type: "string", enum: ["list", "open", "activate", "close"], description: "要做的标签页操作。" },
        id: { type: "string", description: "activate/close 的标签页 id（来自 list）。" }
      }, ["action"])
    }),
    aiToolDefinition(ctx, {
      name: "terminal",
      description: "在手机沙箱里执行终端命令，或维护持久终端会话。action=exec 执行一条命令并返回输出/退出码；start 新建持久会话（返回 sessionId）；write 向会话写入（enter 默认 true）；read 读取新输出；close 关闭；list 列出 AI 会话。命令以 root 在同一个 PRoot guest 运行，和终端面板同一文件系统，但 AI 会话不显示在页面标签页里。属于「终端」能力：若用户把终端设为高危，第一次使用会要求指纹/人脸确认；否则直接放行。",
      kind: "pty",
      parameters: objectParameters({
        action: { type: "string", enum: ["exec", "start", "write", "read", "close", "list"], description: "exec 一次性执行；start/write/read/close 管持久会话；list 列出 AI 会话。" },
        command: { type: "string", description: "action=exec 要执行的 shell 命令（可多行）。" },
        cwd: { type: "string", description: "工作目录，默认 /root。" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000, description: "exec 超时毫秒，默认 30000，最大 120000。" },
        sessionId: { type: "string", description: "write/read/close 的会话 id（来自 start 或 list）。" },
        text: { type: "string", description: "action=write 要写入的文本。" },
        enter: { type: "boolean", description: "write 时是否补一个回车，默认 true。" }
      }, ["action"])
    })
  ];
}

/**
 * Register the AI tools through the `tools` service.
 *
 * `ctx.inject` is what keeps an older profile without a `tools` service from
 * failing the whole plugin load: the callback simply never runs there.
 */
function installAiTools(ctx) {
  ctx.inject(["tools"], (scope) => {
    const registry = scope?.tools;
    if (registry === null || registry === undefined || typeof registry.register !== "function") {
      ctx.logger?.warn?.("android-ai-tools: tools service is unavailable; android_* tools not registered");
      return;
    }
    let registered = 0;
    for (const definition of createAiToolDefinitions(ctx)) {
      try {
        registry.register(definition);
        registered += 1;
      } catch (error) {
        ctx.logger?.warn?.(`android-ai-tools: could not register ${definition.name}: ${describeError(error)}`);
      }
    }
    ctx.logger?.info?.(`android-ai-tools: registered ${registered} tool(s)`);
  });
}

/** Drop the tools a ball session cannot use; other sessions are untouched. */
function withoutTools(assembly, names) {
  const tools = assembly?.tools;
  if (!Array.isArray(tools) || tools.length === 0) return assembly;
  const withheld = new Set(names ?? []);
  if (withheld.size === 0) return assembly;
  const kept = tools.filter((tool) => !withheld.has(tool?.name));
  return kept.length === tools.length ? assembly : { ...assembly, tools: kept };
}

/**
 * The floating ball's own conversation.
 *
 * Identity is by *title* first: this package's client half renames the ball's
 * session to {@link BALL_SESSION_TITLE} as a user title, and a user title is
 * durable in the session log and pins the title against the automatic
 * title-generator — so it is still readable after a harness restart, which is
 * when a client-only marker would be lost. A session-id prefix and an agent
 * preset are accepted as additional markers for a deployment that adds them.
 *
 * Every hook is error-contained: this plugin is loaded for the whole profile,
 * and a throw here would take the session's prompt down with it.
 *
 * @param ctx - Cordis context of the plugin row.
 * @param cfg - resolved {@link BALL_DEFAULTS}.
 */
function installBallSurface(ctx, cfg) {
  if (cfg.enabled === false) return;
  /** Session ids already recognised as the ball's own conversation. */
  const ballSessions = new Set();
  /** Session ids whose permission preset this plugin has already pinned. */
  const pinned = new Set();
  /** session id -> delegating parent session id, for the descendant walk. */
  const parentOf = new Map();
  /** The `permissionPresets` service, once it is available. */
  let permissionPresets = null;
  /**
   * Why the ball hooks are or are not firing, on the device.
   *
   * Identification has three inputs — a session-id prefix, an agent preset, and
   * a session title that arrives as an event or is read back through a
   * projection — and a silent "not a ball session" is indistinguishable from a
   * hook that never ran. One capped JSONL file makes that difference visible
   * without a debugger; `diagFile: ''` turns it off.
   */
  const diagSeen = new Set();
  const diag = (entry) => {
    if (typeof cfg.diagFile !== "string" || cfg.diagFile === "") return;
    try {
      mkdirSync(dirname(cfg.diagFile), { recursive: true });
      appendFileSync(cfg.diagFile, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
    } catch {
      /* a diagnostic is never worth failing a prompt for */
    }
  };
  const diagOnce = (key, entry) => {
    if (diagSeen.has(key)) return;
    diagSeen.add(key);
    diag(entry);
  };

  /** The non-empty prompt text for a ball session. */
  const permissionLine = (canPin) => (canPin
    ? `- 这个会话的权限已经钉成「${cfg.permissionPreset}」：直接干活，不要发起提权审批，也不要把 sandbox_permissions 当第一步；真做不到就直说。`
    : "- 需要审批的动作在球上无法确认：换成不需要审批的做法，或者一句话告诉用户这件事得他回 DSH 点一下。");
  /**
   * The section text. The permission sentence follows what is actually true at
   * render time: claiming a pinned preset before `permissionPresets` exists
   * would tell the model to skip an approval it will really be asked for.
   */
  const promptFor = (canPin) => (typeof cfg.promptText === "string" && cfg.promptText.length > 0
    ? cfg.promptText
    : `${BALL_SURFACE_PROMPT}\n${permissionLine(canPin)}`);

  const idOf = (session) => {
    const id = session?.header?.id;
    if (typeof id === "string" && id.length > 0) return id;
    return typeof session?.id === "string" ? session.id : "";
  };
  /** The session's current title, out of the title projection. */
  const titleOf = (session) => {
    try {
      const title = ctx.sessionProjections?.stateOf?.(session, "title");
      if (typeof title === "string") return title.trim();
    } catch {
      /* no projection service, or the session is gone: fall back to the marks */
    }
    return "";
  };
  /**
   * Whether this session is the floating ball's own conversation.
   *
   * Three inputs, because each covers a different history:
   *   * the `session-ball-` id prefix the client half mints (durable, and
   *     visible on the very first assembly — no event has to arrive first);
   *   * a `session/title` event whose source is the user and whose title is
   *     {@link BALL_SESSION_TITLE} — how a thread created before this plugin
   *     loaded is recognised again after a restart (see the listener below);
   *   * the title projection read back out of the session log, for a thread
   *     whose title event predates the process *and* whose projection is warm.
   */
  const isBall = (session) => {
    if (session === null || session === undefined) return false;
    const id = idOf(session);
    if (id !== "" && ballSessions.has(id)) return true;
    const marked = (cfg.sessionPrefix !== "" && id.startsWith(cfg.sessionPrefix))
      || (cfg.agentPreset !== "" && session?.header?.agentPreset === cfg.agentPreset)
      || (cfg.title !== "" && titleOf(session) === cfg.title);
    if (!marked) return false;
    // Recorded however it was recognised: a teammate is traced back through
    // these ids; a prefix or preset match that never lands here would leave the
    // descendant walk blind.
    if (id !== "") ballSessions.add(id);
    return true;
  };
  /** Remember one session's delegation parent, for the descendant walk below. */
  const rememberFamily = (session) => {
    const id = idOf(session);
    const parent = session?.header?.parentSession;
    if (id !== "" && typeof parent === "string" && parent !== "") parentOf.set(id, parent);
  };
  /**
   * Whether this session is a teammate spawned by a ball session.
   *
   * A subagent gets its own session and its own tool list, and a question asked
   * there is just as unanswerable from the ball — worse, since the parent's
   * task waits on it. Descendants therefore lose the GUI tools too; they keep
   * their own prompt, because their replies go back to the parent model, not to
   * the ball.
   */
  const isDerived = (session) => {
    let cursor = session?.header?.parentSession;
    for (let depth = 0; typeof cursor === "string" && cursor !== "" && depth < 8; depth += 1) {
      if (ballSessions.has(cursor)) return true;
      cursor = parentOf.get(cursor);
    }
    return false;
  };
  /** Pin the ball session's permission preset, once per session. */
  const pinPermission = (session) => {
    const preset = cfg.permissionPreset;
    if (permissionPresets === null || preset === "" || preset === null || preset === undefined) return;
    const id = idOf(session);
    if (id === "" || pinned.has(id)) return;
    pinned.add(id);
    try {
      permissionPresets.set(session, preset);
      ctx.logger?.info?.(`ball-surface: session ${id} pinned to permission preset "${preset}"`);
    } catch (error) {
      pinned.delete(id);
      ctx.logger?.warn?.(`ball-surface: could not pin ${id} to "${preset}": ${error}`);
    }
  };

  // The service arrives when its own plugin row activates; until then the hooks
  // below simply skip the pin and keep withholding tools.
  ctx.inject(["permissionPresets"], (scope) => {
    permissionPresets = scope.permissionPresets;
    diag({ ev: "permission-service", available: permissionPresets !== null });
  });

  // A title arriving as an event is the one mark that needs no service and no
  // warm projection: the client half renames the thread it just created, so the
  // next prompt of that session already sees it. A user-source title also pins
  // the title against the automatic titler, so this mark stays true.
  ctx.on("session/event", (session, event) => {
    try {
      if (event?.type !== "session/title") return;
      const title = event.data?.title;
      if (typeof title !== "string" || title.trim() !== cfg.title) return;
      const id = idOf(session);
      if (id === "") return;
      ballSessions.add(id);
      diagOnce(`title:${id}`, { ev: "title-event", session: id, title: title.trim(), source: event.data?.source?.kind ?? null });
    } catch {
      /* never throw from a listener */
    }
  });

  // The ball's prompt section. Registered globally and empty for every other
  // session — the registry drops empty sections, so nothing is added to them.
  ctx.inject(["systemPrompt"], (scope) => {
    let order = 10165;
    try {
      order = scope.systemPrompt.getSectionOrder("WEB_SURFACE") + 65;
    } catch {
      // Order table moved upstream: keep the fixed slot after the web surface,
      // the Android surface (+50) and the summarizer's hint (+60).
    }
    scope.systemPrompt.section({
      name: BALL_SURFACE_SECTION,
      order,
      text: (context) => {
        try {
          const session = context?.agent?.session;
          rememberFamily(session);
          const ball = isBall(session);
          const id = idOf(session);
          if (id !== "") diagOnce(`section:${id}`, { ev: "section", session: id, ball, title: titleOf(session), preset: session?.header?.agentPreset ?? null });
          if (!ball) return "";
          return promptFor(permissionPresets !== null && cfg.permissionPreset !== "");
        } catch {
          return "";
        }
      }
    });
  });

  // Delegation parents, recorded as sessions appear, so a teammate's session
  // can be traced back to a ball session. Best effort: a missing event only
  // means an old teammate keeps the GUI tools it already had.
  ctx.on("session/created", (session) => {
    try {
      rememberFamily(session);
    } catch {
      /* never throw from a listener */
    }
  });

  // The structural half: a ball session never sees a tool it cannot answer, and
  // neither does a teammate it spawns (a question in the child is just as
  // unanswerable — and the parent's task waits on it).
  // Runs inside the assembly waterfall, so it filters the final tool list — the
  // one the harness logs and the model receives.
  ctx.on("system-prompt/assemble", async (assembly, context, next) => {
    const result = await next();
    try {
      const session = context?.agent?.session;
      rememberFamily(session);
      const ball = isBall(session);
      const id = idOf(session);
      if (id !== "") diagOnce(`assemble:${id}`, { ev: "assemble", session: id, ball, tools: Array.isArray(result?.tools) ? result.tools.length : null });
      if (!ball && !isDerived(session)) return result;
      if (ball) pinPermission(session);
      return withoutTools(result, cfg.withheldTools);
    } catch (error) {
      ctx.logger?.warn?.(`ball-surface: assembly filter skipped: ${error}`);
      return result;
    }
  }, { global: true });
}

export function apply(ctx, config = {}) {
  installAiTools(ctx);

  // Persistent AI PTYs belong to this plugin instance. Close them when the row
  // unloads so a reload does not leave shells nobody can address.
  try {
    ctx.effect(() => () => { disposeTerminalSessions().catch(() => {}); }, "dsh-plugin-android: ai terminal sessions");
  } catch {
    /* older host without effect(): the PTY service still reaps detached shells */
  }

  ctx.inject(["systemPrompt"], (scope) => {
    let order = 10150;
    try {
      order = scope.systemPrompt.getSectionOrder("WEB_SURFACE") + 50;
    } catch {
      // Order table moved upstream: a fixed slot after the web surface keeps
      // the two deployment blocks adjacent.
    }
    scope.systemPrompt.section({
      name: ANDROID_SURFACE_SECTION,
      order,
      text: () => ANDROID_SURFACE_PROMPT
    });
  });

  ctx.inject(["shellEnv"], (scope) => {
    scope.shellEnv.register({
      name: "android-bridge",
      variables: {
        [BRIDGE_URL_VAR]: {
          description: "Loopback HTTP control bridge of the DSH Android app (server start/stop, distro management, Shizuku)."
        },
        [BRIDGE_TOKEN_VAR]: {
          description: "Bearer token for the DSH Android control bridge; send it as the X-Dsh-Token header."
        }
      },
      resolve: () => ({
        [BRIDGE_URL_VAR]: bridgeUrl(),
        [BRIDGE_TOKEN_VAR]: bridgeToken()
      })
    });
  });

  installBallSurface(ctx, { ...BALL_DEFAULTS, ...config });
}
