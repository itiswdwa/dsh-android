package dev.dsh.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Relay between the AI and the terminal tab strip that lives inside the Web UI —
 * docs/AI-API.md §3.
 *
 * <p>The tabs themselves are page state. The app only:
 *
 * <ul>
 *   <li>caches the last snapshot the page reported ({@code GET
 *       /terminal/tabs/commands} piggybacks on the poll, the page answers with
 *       {@code POST /terminal/tabs/report});</li>
 *   <li>queues {@code open/activate/close} commands for the page and blocks the
 *       AI's request for at most 4 s, waking it with the page's result;</li>
 *   <li>answers {@code list} from the cache, with {@code stale:true} once the page
 *       has been silent for 15 s.</li>
 * </ul>
 *
 * <p>Like the terminal itself, this is a global resource: any conversation with
 * the {@code terminal} capability can list/close the tabs the user is looking at.
 * The authorization model covers that (docs/AI-API.md §2 and §5).
 */
public final class TerminalTabs {

    /** How long an AI action waits for the page to pick up and finish a command. */
    private static final long WAIT_MS = 4000L;

    /** A snapshot older than this is reported as stale. */
    private static final long STALE_MS = 15000L;

    /**
     * Commands live only as long as their caller waits (plus a small margin): a
     * stale command must not surprise the user by opening a tab after the AI
     * already reported "no response". The caller removes its own command when the
     * 4 s wait expires; this TTL covers a request whose bridge thread died.
     */
    private static final long COMMAND_TTL_MS = WAIT_MS + 1000L;

    /** Defensive caps; the page enforces its own 4-tab limit. */
    private static final int MAX_COMMANDS = 32;
    private static final int MAX_TABS = 32;

    private static final Object LOCK = new Object();
    private static final ArrayDeque<Command> QUEUE = new ArrayDeque<Command>();
    private static final Map<Integer, Command> WAITING = new LinkedHashMap<Integer, Command>();

    private static JSONArray tabs = new JSONArray();
    private static String activeId = "";
    private static long updatedMs = 0L;
    private static int nextCommandId = 1;

    private TerminalTabs() {
    }

    // ----------------------------------------------------------------- routing

    /** Page-side endpoints: the client plugin polls/answers these with the bridge token. */
    public static JSONObject handle(String method, String path, JSONObject request) {
        try {
            if ("/terminal/tabs/commands".equals(path)) {
                if (!"GET".equalsIgnoreCase(method == null ? "" : method)) {
                    return failure("/terminal/tabs/commands 只支持 GET", null);
                }
                return commands();
            }
            if ("/terminal/tabs/report".equals(path)) {
                if (!"POST".equalsIgnoreCase(method == null ? "" : method)) {
                    return failure("/terminal/tabs/report 只支持 POST", null);
                }
                return report(request == null ? new JSONObject() : request);
            }
            return failure("未知的终端标签中继接口：" + path, null);
        } catch (Throwable error) {
            return failure("终端标签中继失败：" + error, null);
        }
    }

    /** Page poll: hand over queued commands (once) and the latest cached state. */
    private static JSONObject commands() {
        JSONObject answer = new JSONObject();
        try {
            JSONArray list = new JSONArray();
            long now = System.currentTimeMillis();
            synchronized (LOCK) {
                Iterator<Command> iterator = QUEUE.iterator();
                while (iterator.hasNext()) {
                    Command command = iterator.next();
                    if (now - command.createdAt > COMMAND_TTL_MS) {
                        // The caller has already (or is about to) give up; do not
                        // let an old command act behind its back.
                        iterator.remove();
                        WAITING.remove(command.id);
                        command.finish(false, "命令已过期：终端页面没有及时取走");
                        continue;
                    }
                    iterator.remove();
                    JSONObject item = new JSONObject();
                    item.put("id", command.id);
                    item.put("action", command.action);
                    item.put("target", command.target);
                    list.put(item);
                }
                answer.put("ok", true);
                answer.put("commands", list);
                answer.put("state", stateLocked());
            }
            return answer;
        } catch (Throwable error) {
            return failure("读取终端标签命令失败：" + error, null);
        }
    }

    /** Page report: refresh the snapshot and wake any waiting AI action. */
    private static JSONObject report(JSONObject request) {
        List<Command> finished = new ArrayList<Command>();
        try {
            long now = System.currentTimeMillis();
            synchronized (LOCK) {
                JSONArray reportedTabs = request.optJSONArray("tabs");
                if (reportedTabs != null) {
                    tabs = sanitizeTabs(reportedTabs);
                    // The page's snapshot is authoritative: a missing activeId means
                    // no tab is active, not "keep whatever the last report said".
                    activeId = request.optString("activeId", "");
                    updatedMs = now;
                } else if (request.has("activeId")) {
                    activeId = request.optString("activeId", "");
                    updatedMs = now;
                }
                JSONArray results = request.optJSONArray("results");
                if (results != null) {
                    for (int i = 0; i < results.length(); i++) {
                        JSONObject result = results.optJSONObject(i);
                        if (result == null) continue;
                        Command command = WAITING.remove(result.optInt("id", -1));
                        if (command == null) continue;
                        command.ok = result.optBoolean("ok", true);
                        command.error = result.optString("error", "");
                        finished.add(command);
                    }
                }
            }
            for (Command command : finished) command.latch.countDown();
            JSONObject answer = new JSONObject();
            answer.put("ok", true);
            return answer;
        } catch (Throwable error) {
            for (Command command : finished) command.latch.countDown();
            return failure("处理终端标签回报失败：" + error, null);
        }
    }

    // ------------------------------------------------------------------- AI

    /**
     * `POST /ai/terminal/tabs` (the caller has already checked the `terminal`
     * capability). `list` answers from the cache; the other actions queue a page
     * command and wait at most 4 s.
     */
    public static JSONObject action(JSONObject request) {
        try {
            String action = request == null ? "" : request.optString("action", "");
            action = action.trim().toLowerCase(Locale.ROOT);
            if (action.isEmpty()) {
                return failure("缺少 action", "可选 list / open / activate / close");
            }
            if ("list".equals(action)) return snapshot();
            if (!"open".equals(action) && !"activate".equals(action) && !"close".equals(action)) {
                return failure("不认识的标签页动作：" + action,
                        "可选 list / open / activate / close");
            }

            // open takes no target; activate/close name the tab they act on. The
            // page may still answer "没有这个标签页" for a stale id.
            String target = request.optString("id", "").trim();
            Command command;
            synchronized (LOCK) {
                if (QUEUE.size() >= MAX_COMMANDS) {
                    return failure("终端页面还没处理完上一条命令，请稍后再试", null);
                }
                command = new Command(nextCommandId++, action, target);
                QUEUE.add(command);
                WAITING.put(command.id, command);
            }

            boolean answered;
            try {
                answered = command.latch.await(WAIT_MS, TimeUnit.MILLISECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                answered = false;
            }
            if (!answered) {
                synchronized (LOCK) {
                    QUEUE.remove(command);
                    WAITING.remove(command.id);
                }
                JSONObject failure = failure("终端页面没有响应：请回到 DSH 页面再试", null);
                failure.put("needs", "foreground");
                return failure;
            }
            if (!command.ok) {
                String error = command.error == null || command.error.isEmpty()
                        ? "终端标签操作失败" : command.error;
                return failure(error, null);
            }
            return snapshot();
        } catch (Throwable error) {
            return failure("终端标签操作失败：" + error, null);
        }
    }

    /**
     * The cached state, shaped for the AI: tabs carry a derived {@code active}
     * boolean and the page's raw {@code status} is not exposed.
     */
    public static JSONObject snapshot() {
        JSONObject answer = new JSONObject();
        try {
            synchronized (LOCK) {
                JSONArray list = new JSONArray();
                for (int i = 0; i < tabs.length(); i++) {
                    JSONObject tab = tabs.optJSONObject(i);
                    if (tab == null) continue;
                    String id = tab.optString("id", "");
                    JSONObject item = new JSONObject();
                    item.put("id", id);
                    item.put("title", tab.optString("title", ""));
                    item.put("active", !activeId.isEmpty() && activeId.equals(id));
                    list.put(item);
                }
                answer.put("ok", true);
                answer.put("tabs", list);
                answer.put("activeId", activeId);
                answer.put("count", list.length());
                boolean stale = updatedMs == 0
                        || System.currentTimeMillis() - updatedMs > STALE_MS;
                answer.put("stale", stale);
            }
            return answer;
        } catch (Throwable error) {
            return failure("读取终端标签缓存失败：" + error, null);
        }
    }

    private static JSONObject stateLocked() throws Exception {
        JSONObject state = new JSONObject();
        state.put("tabs", sanitizeTabs(tabs));
        state.put("activeId", activeId);
        state.put("updatedMs", updatedMs);
        return state;
    }

    private static JSONArray sanitizeTabs(JSONArray source) {
        JSONArray clean = new JSONArray();
        try {
            for (int i = 0; i < source.length() && clean.length() < MAX_TABS; i++) {
                JSONObject item = source.optJSONObject(i);
                if (item == null) continue;
                JSONObject tab = new JSONObject();
                tab.put("id", item.optString("id", ""));
                tab.put("title", item.optString("title", ""));
                String status = item.optString("status", "");
                if (!status.isEmpty()) tab.put("status", status);
                clean.put(tab);
            }
        } catch (Throwable ignored) {
        }
        return clean;
    }

    // ---------------------------------------------------------------- plumbing

    /** A command handed to the page; its latch is released by the matching report. */
    private static final class Command {
        final int id;
        final String action;
        final String target;
        final long createdAt;
        final CountDownLatch latch = new CountDownLatch(1);
        volatile boolean ok = false;
        volatile String error = "";

        Command(int id, String action, String target) {
            this.id = id;
            this.action = action;
            this.target = target;
            this.createdAt = System.currentTimeMillis();
        }

        void finish(boolean ok, String error) {
            this.ok = ok;
            this.error = error == null ? "" : error;
            latch.countDown();
        }
    }

    private static JSONObject failure(String error, String hint) {
        JSONObject answer = new JSONObject();
        try {
            answer.put("ok", false);
            answer.put("error", error);
            if (hint != null && !hint.isEmpty()) answer.put("hint", hint);
        } catch (Throwable ignored) {
        }
        return answer;
    }
}
