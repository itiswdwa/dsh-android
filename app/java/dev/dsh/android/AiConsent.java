package dev.dsh.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;

/**
 * Per-conversation grants for the AI tools — the `/ai/consent` half of
 * docs/AI-API.md §2.
 *
 * <p>Not every capability needs a confirmation: the user configures a
 * <b>high-risk set</b> (SharedPreferences key {@code ai.risk}) and only those
 * capabilities ask for the system BiometricPrompt once per conversation. The
 * others are allowed directly, with no prompt and no stored grant. The default
 * high-risk set is {@code clipboard/control/screenshot}; {@code read} /
 * {@code notify} / {@code terminal} are low risk until the user moves them.
 *
 * <p>For a high-risk capability the unit is one pair: {@code sessionId ×
 * capability}. A grant is remembered in the app's own SharedPreferences under
 * {@code ai.consent}, so it survives a restart until the user revokes it. First
 * use of that capability by a conversation asks the user through the system
 * BiometricPrompt (via {@link BridgeServer.Host#onBiometric}); after that the
 * same conversation never asks again. Grants for capabilities that later stop
 * being high risk are pruned by {@link #setRisk}.
 *
 * <p>Stored shape (kept in one string key so a single apply() is atomic):
 *
 * <pre>
 * { "sessions": { "&lt;sessionId&gt;": { "title": "...", "updatedMs": 0,
 *     "grants": { "clipboard": 0, "screenshot": 0 } } } }
 * </pre>
 *
 * <p>Everything here may run on a bridge worker thread; the lock below serialises
 * read-modify-write cycles, and the actual prompt blocking happens outside it.
 */
public final class AiConsent {

    /** SharedPreferences key inside {@link App#prefs}. */
    public static final String PREF_KEY = "ai.consent";

    /** SharedPreferences key for the user-configurable high-risk capability set. */
    public static final String RISK_KEY = "ai.risk";

    /** Capability order is the contract's order (docs/AI-API.md §2). */
    private static final String[] CAPABILITIES =
            {"read", "clipboard", "notify", "control", "screenshot", "terminal"};

    /**
     * Capabilities that ask for a confirmation <em>by default</em>.
     *
     * <p>This is only the initial value, not a safety floor: the settings page may
     * move any capability in or out, including turning every confirmation off
     * (an explicit empty array is a valid configuration).
     */
    private static final String[] DEFAULT_RISK = {"clipboard", "control", "screenshot"};

    private static final Object LOCK = new Object();

    /** Conversation titles are bounded before being stored or shown (also used by AiApi). */
    static final int SESSION_TITLE_LIMIT = 60;

    private AiConsent() {
    }

    /** A copy of the capability names; callers cannot mutate the internal array. */
    public static String[] capabilities() {
        return CAPABILITIES.clone();
    }

    /** A copy of the default high-risk set (just a default; any subset is allowed). */
    public static String[] defaultRiskCapabilities() {
        return DEFAULT_RISK.clone();
    }

    // ------------------------------------------------------------------ labels

    /** Human name used in the prompt; fixed so a caller cannot invent one. */
    public static String label(String capability) {
        if (capability == null) return "未知能力";
        switch (capability) {
            case "read": return "读取设备与状态";
            case "clipboard": return "剪贴板";
            case "notify": return "提示与通知";
            case "control": return "操作手机设置";
            case "screenshot": return "截屏";
            case "terminal": return "终端标签页";
            default: return "未知能力";
        }
    }

    public static boolean isCapability(String capability) {
        return capability != null && indexOf(capability) >= 0;
    }

    private static int indexOf(String capability) {
        for (int i = 0; i < CAPABILITIES.length; i++) {
            if (CAPABILITIES[i].equals(capability)) return i;
        }
        return -1;
    }

    // ------------------------------------------------------------------- risk

    /**
     * Whether this capability requires a per-conversation confirmation.
     *
     * <p>The high-risk set is user-configurable from the settings page and is
     * stored under {@link #RISK_KEY}; everything outside it is allowed directly,
     * with no prompt and no stored grant. Unknown capabilities are never high risk.
     */
    public static boolean isHighRisk(String capability) {
        if (!isCapability(capability)) return false;
        return contains(riskJson(), capability);
    }

    /** The configured high-risk set, normalized to {@link #CAPABILITIES} order. */
    public static JSONArray riskJson() {
        synchronized (LOCK) {
            return readRiskLocked();
        }
    }

    /**
     * Save a new high-risk set: only the six known capabilities are accepted,
     * duplicates removed, order normalized. Grants held for capabilities that are
     * no longer high risk are dropped so the settings page does not keep showing
     * entries that no longer mean anything.
     *
     * @return true when the new set was persisted; false when the caller passed
     *         null/garbage or SharedPreferences refused the write. Callers must
     *         not report success on false.
     */
    public static boolean setRisk(JSONArray capabilities) {
        if (capabilities == null) return false;
        JSONArray normalized = normalizeRisk(capabilities);
        // A non-empty list that normalizes to nothing is garbage (unknown names),
        // not "turn everything off": saving that would fail open.
        if (capabilities.length() > 0 && normalized.length() == 0) return false;
        synchronized (LOCK) {
            try {
                App app = App.i();
                if (app == null || app.prefs == null) return false;
                // commit (not apply): the settings page must hear about a failure.
                if (!app.prefs.edit().putString(RISK_KEY, normalized.toString()).commit()) {
                    return false;
                }
                pruneRiskGrantsLocked(normalized);
                return true;
            } catch (Throwable error) {
                App.log("ai consent: write risk failed: " + error);
                return false;
            }
        }
    }

    private static JSONArray normalizeRisk(JSONArray source) {
        JSONArray risk = new JSONArray();
        for (String capability : CAPABILITIES) {
            if (contains(source, capability)) risk.put(capability);
        }
        return risk;
    }

    private static boolean contains(JSONArray array, String value) {
        if (array == null || value == null) return false;
        for (int i = 0; i < array.length(); i++) {
            if (value.equals(array.optString(i, ""))) return true;
        }
        return false;
    }

    private static JSONArray defaultRiskJson() {
        JSONArray risk = new JSONArray();
        for (String capability : DEFAULT_RISK) risk.put(capability);
        return risk;
    }

    /**
     * The stored high-risk set, already normalized.
     *
     * <p>Missing or unparsable storage falls back to the default. A stored array
     * that parses but contains only unknown entries also falls back to the default
     * (fail safe); only an explicit empty array means "nothing is high risk".
     */
    private static JSONArray readRiskLocked() {
        try {
            App app = App.i();
            if (app == null || app.prefs == null) return defaultRiskJson();
            String raw = app.prefs.getString(RISK_KEY, "");
            if (raw == null || raw.trim().isEmpty()) return defaultRiskJson();
            JSONArray stored = new JSONArray(raw);
            JSONArray normalized = normalizeRisk(stored);
            if (stored.length() > 0 && normalized.length() == 0) {
                App.log("ai consent: ai.risk has no known capability, using default: " + raw);
                return defaultRiskJson();
            }
            return normalized;
        } catch (Throwable error) {
            App.log("ai consent: read risk failed: " + error);
            return defaultRiskJson();
        }
    }

    /** Remove grants for capabilities that are not in the new high-risk set. */
    private static void pruneRiskGrantsLocked(JSONArray risk) {
        try {
            JSONObject root = readLocked();
            JSONObject all = root.optJSONObject("sessions");
            if (all == null) return;
            boolean changed = false;
            List<String> ids = new ArrayList<String>();
            Iterator<String> keys = all.keys();
            while (keys.hasNext()) ids.add(keys.next());
            long now = System.currentTimeMillis();
            for (String id : ids) {
                JSONObject session = all.optJSONObject(id);
                if (session == null) continue;
                JSONObject grants = session.optJSONObject("grants");
                if (grants == null) continue;
                boolean sessionChanged = false;
                for (String capability : CAPABILITIES) {
                    if (!grants.has(capability) || contains(risk, capability)) continue;
                    grants.remove(capability);
                    sessionChanged = true;
                    changed = true;
                }
                if (grants.length() == 0) {
                    all.remove(id);
                    changed = true;
                } else if (sessionChanged) {
                    session.put("updatedMs", now);
                }
            }
            if (changed) writeLocked(root);
        } catch (Throwable error) {
            App.log("ai consent: prune risk grants failed: " + error);
        }
    }

    // ------------------------------------------------------------------- read

    /** True when this conversation already holds this capability. */
    public static boolean has(String session, String capability) {
        if (isBlank(session) || !isCapability(capability)) return false;
        synchronized (LOCK) {
            JSONObject sessionObject = sessionLocked(readLocked(), session);
            if (sessionObject == null) return false;
            JSONObject grants = sessionObject.optJSONObject("grants");
            return grants != null && grants.has(capability);
        }
    }

    /**
     * The settings page view — `GET /ai/consent`.
     *
     * <p>No session is needed: this is the local settings UI, which needs to see
     * every conversation and its grants in order to offer per-item revocation.
     * It does expose conversation titles; docs/AI-API.md documents that.
     */
    public static JSONObject list() {
        JSONObject answer = new JSONObject();
        try {
            JSONArray capabilities = new JSONArray();
            for (String capability : CAPABILITIES) capabilities.put(capability);

            JSONArray sessions = new JSONArray();
            JSONArray risk;
            synchronized (LOCK) {
                // Migration + consistency: prune against the current risk set and
                // read both risk and grants under the same lock, so the page never
                // sees a new risk list next to grants that no longer belong to it.
                risk = readRiskLocked();
                pruneRiskGrantsLocked(risk);
                JSONObject all = readLocked().optJSONObject("sessions");
                if (all != null) {
                    List<String> ids = new ArrayList<String>();
                    Iterator<String> keys = all.keys();
                    while (keys.hasNext()) ids.add(keys.next());
                    Collections.sort(ids, new Comparator<String>() {
                        @Override
                        public int compare(String left, String right) {
                            long a = updatedMs(all.optJSONObject(left));
                            long b = updatedMs(all.optJSONObject(right));
                            if (a == b) return 0;
                            return a > b ? -1 : 1;
                        }

                        private long updatedMs(JSONObject object) {
                            return object == null ? 0 : object.optLong("updatedMs", 0);
                        }
                    });
                    for (String id : ids) {
                        JSONObject session = all.optJSONObject(id);
                        if (session == null) continue;
                        JSONObject grants = session.optJSONObject("grants");
                        if (grants == null || grants.length() == 0) continue;
                        JSONObject item = new JSONObject();
                        item.put("session", id);
                        item.put("title", session.optString("title", ""));
                        item.put("updatedMs", session.optLong("updatedMs", 0));
                        JSONArray list = new JSONArray();
                        for (String capability : CAPABILITIES) {
                            if (!grants.has(capability)) continue;
                            JSONObject grant = new JSONObject();
                            grant.put("capability", capability);
                            grant.put("grantedMs", grants.optLong(capability, 0));
                            list.put(grant);
                        }
                        item.put("grants", list);
                        sessions.put(item);
                    }
                }
                answer.put("ok", true);
                answer.put("capabilities", capabilities);
                answer.put("risk", risk);
                answer.put("sessions", sessions);
            }
            return answer;
        } catch (Throwable error) {
            return failure("无法读取 AI 授权：" + error, null, null);
        }
    }

    // ------------------------------------------------------------------ write

    /** Remember one capability for a conversation. */
    public static void grant(String session, String title, String capability) {
        if (isBlank(session) || !isCapability(capability)) return;
        title = cleanSessionTitle(title);
        synchronized (LOCK) {
            // The configuration may have changed while the prompt was up: never
            // record a grant for a capability that is no longer high risk, or it
            // would silently skip the prompt if the user later re-enables it.
            if (!contains(readRiskLocked(), capability)) return;
            JSONObject root = readLocked();
            JSONObject all = sessionsLocked(root);
            JSONObject sessionObject = addSessionLocked(all, session);
            long now = System.currentTimeMillis();
            try {
                if (!isBlank(title)) sessionObject.put("title", title);
                sessionObject.put("updatedMs", now);
                JSONObject grants = grantsLocked(sessionObject);
                grants.put(capability, now);
            } catch (Throwable error) {
                App.log("ai consent: grant failed: " + error);
                return;
            }
            writeLocked(root);
        }
    }

    /** Remove one capability from one conversation; returns 1 when it existed. */
    public static int revoke(String session, String capability) {
        if (isBlank(session) || !isCapability(capability)) return 0;
        synchronized (LOCK) {
            JSONObject root = readLocked();
            JSONObject all = root.optJSONObject("sessions");
            if (all == null) return 0;
            JSONObject sessionObject = all.optJSONObject(session);
            if (sessionObject == null) return 0;
            JSONObject grants = sessionObject.optJSONObject("grants");
            int removed = 0;
            try {
                if (grants != null && grants.has(capability)) {
                    grants.remove(capability);
                    removed = 1;
                }
                if (grants == null || grants.length() == 0) {
                    all.remove(session);
                } else {
                    sessionObject.put("updatedMs", System.currentTimeMillis());
                }
            } catch (Throwable error) {
                App.log("ai consent: revoke failed: " + error);
                return 0;
            }
            writeLocked(root);
            return removed;
        }
    }

    /** Remove every capability of one conversation; returns the number removed. */
    public static int revokeSession(String session) {
        if (isBlank(session)) return 0;
        synchronized (LOCK) {
            JSONObject root = readLocked();
            JSONObject all = root.optJSONObject("sessions");
            if (all == null) return 0;
            JSONObject sessionObject = all.optJSONObject(session);
            if (sessionObject == null) return 0;
            JSONObject grants = sessionObject.optJSONObject("grants");
            int removed = grants == null ? 0 : grants.length();
            try {
                all.remove(session);
            } catch (Throwable error) {
                App.log("ai consent: revoke session failed: " + error);
                return 0;
            }
            writeLocked(root);
            return removed;
        }
    }

    /** Remove every grant of every conversation; returns the number removed. */
    public static int revokeAll() {
        synchronized (LOCK) {
            JSONObject root = readLocked();
            JSONObject all = root.optJSONObject("sessions");
            if (all == null) return 0;
            int removed = 0;
            List<String> ids = new ArrayList<String>();
            Iterator<String> keys = all.keys();
            while (keys.hasNext()) ids.add(keys.next());
            for (String id : ids) {
                JSONObject sessionObject = all.optJSONObject(id);
                JSONObject grants = sessionObject == null ? null : sessionObject.optJSONObject("grants");
                if (grants != null) removed += grants.length();
                try {
                    all.remove(id);
                } catch (Throwable error) {
                    App.log("ai consent: revoke all failed: " + error);
                }
            }
            writeLocked(root);
            return removed;
        }
    }

    // ----------------------------------------------------------------- ensure

    /**
     * Make sure {@code capability} is granted for {@code session}, prompting the
     * user the first time.
     *
     * @return {@code null} when the caller may proceed; otherwise a ready-to-send
     *         failure JSON (`needs:"consent"`, `needs:"biometric"` or
     *         `needs:"android9"`).
     */
    public static JSONObject ensure(BridgeServer.Host host, String session, String title,
            String capability) {
        // Conversation titles come from a plugin: keep them single-line and
        // bounded before they reach the prompt or the settings list.
        title = cleanSessionTitle(title);
        if (!isCapability(capability)) {
            JSONObject failure = failure("未知的能力：" + capability,
                    "可用能力：" + join(CAPABILITIES), null);
            try {
                failure.put("session", session == null ? "" : session);
            } catch (Throwable ignored) {
            }
            return failure;
        }
        if (isBlank(session)) {
            return failure("缺少 session：AI 调用要带上对话 id",
                    "请求体里带 session（通常是 exec.agent.id）", "consent");
        }
        synchronized (LOCK) {
            // Migrate old grants first and decide risk from the same snapshot: a
            // capability that is no longer high risk must not look granted later
            // (and must not linger in the settings list).
            JSONArray risk = readRiskLocked();
            pruneRiskGrantsLocked(risk);
            // Low-risk capabilities are allowed directly: no prompt, no stored grant.
            if (!contains(risk, capability)) return null;

            JSONObject root = readLocked();
            JSONObject all = sessionsLocked(root);
            JSONObject sessionObject = all.optJSONObject(session);
            JSONObject grants = sessionObject == null ? null : sessionObject.optJSONObject("grants");
            if (grants != null && grants.has(capability)) {
                if (!isBlank(title)
                        && !title.equals(sessionObject.optString("title", ""))) {
                    try {
                        sessionObject.put("title", title);
                    } catch (Throwable ignored) {
                    }
                    writeLocked(root);
                }
                return null;
            }
        }

        JSONObject status = Biometric.status();
        int sdk = status.optInt("sdk", android.os.Build.VERSION.SDK_INT);
        if (sdk < 28) {
            JSONObject failure = failure("生物识别需要 Android 9（API 28）及以上（当前 API " + sdk + "）",
                    "升级系统后才能使用 AI 授权确认", "android9");
            putContext(failure, session, capability);
            return failure;
        }
        if (!status.optBoolean("available", false)) {
            JSONObject failure = failure(status.optString("message", "没有可用的生物识别"),
                    "先在系统设置里录入指纹或人脸，然后重试", "biometric");
            putContext(failure, session, capability);
            return failure;
        }

        String promptTitle = "DSH 请求：允许这个对话使用「" + label(capability) + "」？";
        String promptSubtitle = "对话：" + (isBlank(title) ? shortSession(session) : title);
        String promptDescription = "确认后这个对话不再询问，可在 设置 → 安卓沙箱 → AI 授权 撤销。";
        JSONObject auth = Biometric.authenticate(host, promptTitle, promptSubtitle,
                promptDescription, Biometric.TIMEOUT_MS);
        if (auth.optBoolean("authenticated", false)) {
            grant(session, title, capability);
            return null;
        }

        String error = auth.optString("error", "");
        String need = auth.optString("needs", "");
        if (!need.isEmpty()) {
            // Setup problem found between the status check and the prompt.
            JSONObject failure = failure(error.isEmpty() ? "生物识别不可用" : error,
                    auth.optString("hint", ""), need);
            putContext(failure, session, capability);
            return failure;
        }
        if (isDenied(error)) {
            JSONObject failure = failure("用户拒绝了这个对话的授权", null, "consent");
            putContext(failure, session, capability);
            return failure;
        }
        // Busy/foreground/lockout: keep the real message so the user can retry.
        JSONObject failure = failure(error.isEmpty() ? "生物识别确认失败，请重试" : error, null, null);
        putContext(failure, session, capability);
        return failure;
    }

    private static boolean isDenied(String error) {
        if (error == null || error.isEmpty()) return true;
        return error.contains("用户取消") || error.contains("验证失败")
                || error.contains("超时") || error.contains("拒绝");
    }

    private static void putContext(JSONObject failure, String session, String capability) {
        try {
            failure.put("session", session);
            failure.put("capability", capability);
        } catch (Throwable ignored) {
        }
    }

    private static String shortSession(String session) {
        if (session == null) return "";
        return session.length() <= 8 ? session : session.substring(0, 8);
    }

    /** Conversation titles are plugin input: single line, at most 60 chars. */
    static String cleanSessionTitle(String title) {
        if (title == null) return "";
        String text = title.replaceAll("\\s+", " ").trim();
        if (text.length() > SESSION_TITLE_LIMIT) {
            text = text.substring(0, SESSION_TITLE_LIMIT).trim();
        }
        return text;
    }

    // ---------------------------------------------------------------- storage

    private static JSONObject readLocked() {
        try {
            App app = App.i();
            if (app == null || app.prefs == null) return emptyRoot();
            String raw = app.prefs.getString(PREF_KEY, "");
            if (raw == null || raw.trim().isEmpty()) return emptyRoot();
            JSONObject root = new JSONObject(raw);
            if (root.optJSONObject("sessions") == null) root.put("sessions", new JSONObject());
            return root;
        } catch (Throwable error) {
            App.log("ai consent: read failed: " + error);
            return emptyRoot();
        }
    }

    private static JSONObject emptyRoot() {
        JSONObject root = new JSONObject();
        try {
            root.put("sessions", new JSONObject());
        } catch (Throwable ignored) {
        }
        return root;
    }

    private static void writeLocked(JSONObject root) {
        try {
            App app = App.i();
            if (app == null || app.prefs == null) return;
            app.prefs.edit().putString(PREF_KEY, root.toString()).apply();
        } catch (Throwable error) {
            App.log("ai consent: write failed: " + error);
        }
    }

    private static JSONObject sessionsLocked(JSONObject root) {
        JSONObject sessions = root.optJSONObject("sessions");
        if (sessions == null) {
            sessions = new JSONObject();
            try {
                root.put("sessions", sessions);
            } catch (Throwable ignored) {
            }
        }
        return sessions;
    }

    private static JSONObject addSessionLocked(JSONObject sessions, String session) {
        JSONObject object = sessions.optJSONObject(session);
        if (object == null) {
            object = new JSONObject();
            try {
                sessions.put(session, object);
            } catch (Throwable ignored) {
            }
        }
        return object;
    }

    private static JSONObject grantsLocked(JSONObject sessionObject) {
        JSONObject grants = sessionObject.optJSONObject("grants");
        if (grants == null) {
            grants = new JSONObject();
            try {
                sessionObject.put("grants", grants);
            } catch (Throwable ignored) {
            }
        }
        return grants;
    }

    private static JSONObject sessionLocked(JSONObject root, String session) {
        JSONObject all = root.optJSONObject("sessions");
        return all == null ? null : all.optJSONObject(session);
    }

    // ------------------------------------------------------------------ errors

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String join(String[] values) {
        StringBuilder builder = new StringBuilder();
        for (String value : values) {
            if (builder.length() > 0) builder.append(" / ");
            builder.append(value);
        }
        return builder.toString();
    }

    private static JSONObject failure(String error, String hint, String need) {
        JSONObject answer = new JSONObject();
        try {
            answer.put("ok", false);
            answer.put("error", error);
            if (hint != null && !hint.isEmpty()) answer.put("hint", hint);
            if (need != null && !need.isEmpty()) answer.put("needs", need);
        } catch (Throwable ignored) {
        }
        return answer;
    }
}
