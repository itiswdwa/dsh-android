/**
 * AI terminal operations for dsh-plugin-android.
 *
 * The visible terminal tabs live in the Web UI, and the app's Java relay can
 * only queue open/activate/close for them. This module deliberately does not
 * touch that relay: it talks to the same guest-side PTY service the terminal
 * panel uses (`/opt/dsh/android/pty-server.mjs`), which is reachable from the
 * plugin process at 127.0.0.1 and authenticated by `DSH_PTY_TOKEN`.
 *
 * That means an AI session runs in the same PRoot guest, with the same root
 * and files as the user's terminal, but it is its own PTY: it is not painted
 * into one of the page's tabs. The tool description says so, so the model does
 * not claim it typed into the user's tab.
 *
 * Consent is not decided here. The caller must first pass the app's existing
 * `terminal` capability check (`/ai/terminal/tabs` with action=list); the app
 * then applies the user's high-risk setting and, if needed, shows the system
 * biometric sheet. Only after that gate returns does this module spawn a PTY.
 */

import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;
const MAX_OUTPUT_CHARS = 16000;
const MAX_SESSION_OUTPUT = 65536;
const MAX_AI_SESSIONS = 4;
const MAX_COMMAND_CHARS = 12000;
const MAX_TEXT_CHARS = 65536;

/** Session id -> persistent state. One per `start`, removed by `close`. */
const sessions = new Map();

function errorText(error) {
  if (error === null || error === undefined) return "未知错误";
  if (typeof error === "string") return error;
  return typeof error.message === "string" && error.message !== "" ? error.message : String(error);
}

function ptyConfig() {
  const token = process.env.DSH_PTY_TOKEN ?? "";
  if (token === "") {
    throw new Error("终端服务不可用：DSH_PTY_TOKEN 没有传进插件进程（需要带终端的 1.2.2 及以上外壳）");
  }
  const port = Number(process.env.DSH_PTY_PORT ?? 3099);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("终端服务端口无效：DSH_PTY_PORT=" + String(process.env.DSH_PTY_PORT));
  }
  return { base: `http://127.0.0.1:${port}`, wsBase: `ws://127.0.0.1:${port}`, token };
}

function clampTimeout(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(value)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip ANSI, carriage returns and control bytes; keep newlines/tabs. */
function cleanTerminal(text) {
  return String(text ?? "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[()][A-Za-z0-9]/g, "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function trimOutput(text, limit = MAX_OUTPUT_CHARS) {
  const value = cleanTerminal(text).replace(/^\n+/, "").replace(/\n+$/, "");
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: value.slice(-limit), truncated: true };
}

async function httpJson(config, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const response = await fetch(config.base + path, {
      method: options.method ?? "POST",
      headers: {
        "X-Dsh-Token": config.token,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try {
      data = text === "" ? {} : JSON.parse(text);
    } catch {
      throw new Error(`终端服务返回了无法解析的响应（${path}）：${text.slice(0, 200)}`);
    }
    if (!response.ok) {
      throw new Error(`终端服务拒绝了请求（${path}）：${typeof data.error === "string" ? data.error : "HTTP " + response.status}`);
    }
    return data;
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error(`终端服务 ${Math.round((options.timeoutMs ?? 5000) / 1000)} 秒内没有响应（${path}）`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function deletePty(config, id) {
  try {
    await httpJson(config, `/sessions/${encodeURIComponent(id)}`, { method: "DELETE", timeoutMs: 3000 });
  } catch {
    /* the shell may already be gone; closing the socket is enough */
  }
}

/**
 * Create a PTY and attach a WebSocket.
 *
 * Resolves only after the server's `{type:"ready"}` control frame, so a caller
 * cannot send input before the shell exists. The returned state keeps `unread`
 * for `read`/`exec` and closes itself on WebSocket close.
 */
async function openPty(config, options = {}) {
  const created = await httpJson(config, "/sessions", {
    body: { cols: 120, rows: 30, term: "xterm-256color", cwd: typeof options.cwd === "string" && options.cwd !== "" ? options.cwd : "/root" },
    timeoutMs: 5000
  });
  const id = typeof created.id === "string" ? created.id : "";
  if (id === "") throw new Error("终端服务没有返回会话 id");

  const socket = new WebSocket(`${config.wsBase}/pty?id=${encodeURIComponent(id)}&token=${encodeURIComponent(config.token)}`);
  socket.binaryType = "arraybuffer";
  const state = {
    id,
    socket,
    config,
    ready: false,
    closed: false,
    unread: "",
    createdAt: Date.now()
  };
  let settleReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => {
    settleReady = resolve;
    rejectReady = reject;
  });
  const readyTimer = setTimeout(() => rejectReady(new Error("终端会话没有在 5 秒内就绪")), 5000);

  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      try {
        const control = JSON.parse(event.data);
        if (control && control.type === "ready") {
          state.ready = true;
          clearTimeout(readyTimer);
          settleReady();
        }
      } catch {
        /* a text frame the server did not intend as control: ignore */
      }
      return;
    }
    const bytes = event.data instanceof ArrayBuffer ? Buffer.from(event.data) : Buffer.from(String(event.data));
    state.unread += bytes.toString("utf8");
    if (state.unread.length > MAX_SESSION_OUTPUT * 2) {
      state.unread = state.unread.slice(-MAX_SESSION_OUTPUT);
    }
  });
  socket.addEventListener("close", () => {
    state.closed = true;
  });
  socket.addEventListener("error", () => {
    state.closed = true;
    if (!state.ready) {
      clearTimeout(readyTimer);
      rejectReady(new Error("连不上终端会话 WebSocket"));
    }
  });

  try {
    await readyPromise;
  } catch (error) {
    clearTimeout(readyTimer);
    try { socket.close(); } catch { /* ignore */ }
    await deletePty(config, id);
    throw error;
  }
  // Echo off: the shell would otherwise echo the whole command (and its
  // sentinel) into the capture, which is both noisy and a false-positive risk.
  socket.send(JSON.stringify({ type: "input", data: "stty -echo\n" }));
  await sleep(120);
  // No prompts in an AI capture: the prompt is the shell's, not the command's,
  // and a tool result that starts with `root@localhost:~#` is just noise.
  socket.send(JSON.stringify({ type: "input", data: "PS1=''; PS2=''\n" }));
  await sleep(60);
  state.unread = "";
  return state;
}

async function closePty(state) {
  if (state === null || state === undefined) return;
  try { state.socket.close(); } catch { /* ignore */ }
  await deletePty(state.config, state.id);
}

function sessionFor(id) {
  const state = sessions.get(id);
  if (state === undefined) throw new Error("没有这个 AI 终端会话：先用 action=start 建一个，或 action=list 看一下");
  return state;
}

function sessionSnapshots() {
  return [...sessions.entries()].map(([id, state]) => ({
    sessionId: id,
    alive: state.closed !== true,
    createdAt: new Date(state.createdAt).toISOString(),
    buffered: state.unread.length
  }));
}

/**
 * One command in a fresh PTY, captured between two markers.
 *
 * The marker is printed by the shell itself, so it is not confused with
 * command output; the command is wrapped in a brace group so a trailing `;`
 * or a multi-line body cannot swallow the exit-status line.
 */
async function execOnce(config, command, timeoutMs, cwd) {
  const state = await openPty(config, { cwd });
  const nonce = randomUUID().replace(/-/g, "").slice(0, 12);
  const start = `__DSH_AI_START_${nonce}__`;
  const end = `__DSH_AI_END_${nonce}__`;
  // A base64 payload avoids the interactive shell's continuation prompts
  // (`> `) and quoting rules; the command runs in a non-interactive bash child,
  // so a multi-line body or an `exit` cannot eat the sentinel line.
  const encoded = Buffer.from(command, "utf8").toString("base64");
  const body = `printf '\\n${start}\\n'\nprintf '%s' '${encoded}' | base64 -d | bash\n__dsh_rc=$?\nprintf '\\n${end}%s\\n' "$__dsh_rc"\n`;
  try {
    state.socket.send(JSON.stringify({ type: "input", data: body }));
    const deadline = Date.now() + timeoutMs;
    let code = null;
    let captured = "";
    let timedOut = false;
    while (Date.now() < deadline) {
      const raw = state.unread;
      const startAt = raw.indexOf(start);
      const endAt = startAt === -1 ? -1 : raw.indexOf(end, startAt + start.length);
      if (startAt !== -1 && endAt !== -1) {
        captured = raw.slice(startAt + start.length, endAt);
        const match = raw.slice(endAt + end.length).match(/^(-?\d+)/);
        code = match === null ? null : Number(match[1]);
        break;
      }
      if (startAt !== -1) captured = raw.slice(startAt + start.length);
      if (state.closed) break;
      await sleep(25);
    }
    if (code === null && Date.now() >= deadline) timedOut = true;
    if (code === null && !timedOut) {
      // Shell gone (exit, crash): report what we have rather than hanging.
      timedOut = false;
    }
    const output = trimOutput(captured);
    return {
      ok: true,
      output: output.text,
      exitCode: code,
      timedOut,
      truncated: output.truncated,
      sessionId: state.id
    };
  } finally {
    await closePty(state);
  }
}

/**
 * Run one terminal action after the caller has passed the app's consent gate.
 *
 * @param input - raw tool arguments.
 * @param options - `{ cwd?, timeoutMs? }` is not used; all validation is here.
 * @returns a plain object; the tool framework wraps it in the output contract.
 */
export async function runTerminalAction(input) {
  const args = input !== null && typeof input === "object" && !Array.isArray(input) ? input : {};
  const action = typeof args.action === "string" ? args.action : "";
  if (!["exec", "start", "write", "read", "close", "list"].includes(action)) {
    throw new Error("terminal 的 action 必须是 exec / start / write / read / close / list");
  }
  const config = ptyConfig();

  if (action === "list") {
    return { ok: true, sessions: sessionSnapshots() };
  }

  if (action === "exec") {
    const command = typeof args.command === "string" ? args.command : "";
    if (command.trim() === "") throw new Error("terminal exec 需要 command");
    if (command.length > MAX_COMMAND_CHARS) throw new Error(`terminal 命令太长（上限 ${MAX_COMMAND_CHARS} 字符）`);
    const cwd = typeof args.cwd === "string" && args.cwd !== "" ? args.cwd : undefined;
    return execOnce(config, command, clampTimeout(args.timeoutMs), cwd);
  }

  if (action === "start") {
    if (sessions.size >= MAX_AI_SESSIONS) {
      throw new Error(`同时最多 ${MAX_AI_SESSIONS} 个 AI 终端会话，先用 action=close 关掉一个`);
    }
    const cwd = typeof args.cwd === "string" && args.cwd !== "" ? args.cwd : undefined;
    const state = await openPty(config, { cwd });
    sessions.set(state.id, state);
    const initial = trimOutput(state.unread);
    state.unread = "";
    return { ok: true, sessionId: state.id, output: initial.text, truncated: initial.truncated };
  }

  const id = typeof args.sessionId === "string" ? args.sessionId : "";
  if (id === "") throw new Error(`terminal ${action} 需要 sessionId（来自 action=start 或 list）`);
  const state = sessionFor(id);

  if (action === "write") {
    const text = typeof args.text === "string" ? args.text : "";
    if (text.length > MAX_TEXT_CHARS) throw new Error(`terminal 写入太长（上限 ${MAX_TEXT_CHARS} 字符）`);
    if (text === "") throw new Error("terminal write 需要 text");
    const enter = args.enter !== false;
    state.socket.send(JSON.stringify({ type: "input", data: enter && !text.endsWith("\n") ? text + "\n" : text }));
    return { ok: true, sessionId: id, bytes: Buffer.byteLength(text, "utf8") };
  }

  if (action === "read") {
    const output = trimOutput(state.unread);
    state.unread = "";
    return { ok: true, sessionId: id, output: output.text, truncated: output.truncated, exited: state.closed === true };
  }

  // close
  sessions.delete(id);
  await closePty(state);
  return { ok: true, sessionId: id };
}

/** Close every persistent AI session; used when the plugin unloads/restarts. */
export async function disposeTerminalSessions() {
  const all = [...sessions.values()];
  sessions.clear();
  await Promise.all(all.map((state) => closePty(state)));
}
