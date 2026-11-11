package dev.dsh.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * The AI-facing surface — `/ai/*` in docs/AI-API.md.
 *
 * <p>One entry point, {@code POST /ai/android}, fronts every Android endpoint so
 * the plugin does not have to carry the capability table: this class derives the
 * capability from the nested path/method and calls {@link AiConsent#ensure}. Only
 * the user-configured high-risk capabilities there ask for a per-conversation
 * biometric confirmation; low-risk ones pass straight through. The one exception
 * is {@code /android/biometric}: it is a user confirmation itself, so it stays
 * directly reachable and is rejected here.
 *
 * <p>{@code /ai/consent}, {@code /ai/consent/revoke} and
 * {@code /ai/consent/risk} serve the settings page (local, no session needed);
 * {@code /ai/terminal/tabs} wraps {@link TerminalTabs}. All failures are JSON;
 * nothing throws out of {@link #handle}.
 */
public final class AiApi {

    private AiApi() {
    }

    // ----------------------------------------------------------------- routing

    public static JSONObject handle(String method, String path, String query, JSONObject request,
            BridgeServer.Host host) {
        try {
            JSONObject body = request == null ? new JSONObject() : request;
            if ("/ai/android".equals(path)) {
                if (!"POST".equalsIgnoreCase(method == null ? "" : method)) {
                    return failure("/ai/android 只支持 POST", null);
                }
                return android(host, body);
            }
            if ("/ai/consent".equals(path)) {
                if (!"GET".equalsIgnoreCase(method == null ? "" : method)) {
                    return failure("/ai/consent 只支持 GET", "设置页读取授权列表用 GET");
                }
                return AiConsent.list();
            }
            if ("/ai/consent/revoke".equals(path)) {
                if (!"POST".equalsIgnoreCase(method == null ? "" : method)) {
                    return failure("/ai/consent/revoke 只支持 POST", null);
                }
                return revoke(body);
            }
            if ("/ai/consent/risk".equals(path)) {
                if (!"POST".equalsIgnoreCase(method == null ? "" : method)) {
                    return failure("/ai/consent/risk 只支持 POST", null);
                }
                return setRisk(body);
            }
            if ("/ai/terminal/tabs".equals(path)) {
                if (!"POST".equalsIgnoreCase(method == null ? "" : method)) {
                    return failure("/ai/terminal/tabs 只支持 POST", null);
                }
                return terminalTabs(host, body);
            }
            return failure("未知的 AI 接口：" + path,
                    "可用：/ai/android、/ai/consent、/ai/consent/revoke、/ai/consent/risk、/ai/terminal/tabs");
        } catch (Throwable error) {
            App.log("ai api " + path + " failed: " + error);
            return failure("AI 接口执行失败：" + error, null);
        }
    }

    // -------------------------------------------------------------- /ai/android

    private static JSONObject android(BridgeServer.Host host, JSONObject request) {
        String session = request.optString("session", "").trim();
        if (session.isEmpty()) {
            return failure("缺少 session：AI 调用要带上对话 id",
                    "请求体里带 session（通常是工具调用所在的 exec.agent.id）");
        }
        String sessionTitle = AiConsent.cleanSessionTitle(request.optString("sessionTitle", ""));

        String path = request.optString("path", "").trim();
        if (path.isEmpty()) {
            return failure("缺少 path：要调用哪个 Android 接口？",
                    "例如 /android/clipboard、/android/screenshot");
        }
        if ("/android/biometric".equals(path)) {
            return failure("AI 不能经 /ai/android 调用 /android/biometric",
                    "生物识别确认直接 POST /android/biometric（android_biometric 工具）");
        }
        if (!path.equals("/android") && !path.startsWith("/android/")) {
            return failure("AI 只能调用 /android/* 接口（收到 " + path + "）", null);
        }

        String method = request.optString("method", "").trim().toUpperCase(Locale.ROOT);
        if (method.isEmpty()) method = "POST";
        if (!"GET".equals(method) && !"POST".equals(method)) {
            return failure("method 只能是 GET 或 POST（收到 " + method + "）", null);
        }

        String capability = capabilityFor(path, method);
        if (capability == null) {
            return failure("AI 无权调用 " + path,
                    "可用接口见 docs/AI-API.md 的能力表；/android/biometric 走它自己的端点");
        }

        // Validate the nested request before asking for consent: a malformed body
        // must never pop a system prompt, and a GET must never smuggle a write
        // body past a `read` grant (volume/display/dnd/apps/notify/permissions).
        JSONObject nested = request.optJSONObject("body");
        if (nested == null) {
            if (request.has("body") && !request.isNull("body")) {
                return failure("body 必须是 JSON 对象", null);
            }
            nested = new JSONObject();
        }
        if ("GET".equals(method) && nested.length() > 0) {
            return failure("GET 不能带请求体", "读用 query，写把 method 设为 POST");
        }
        String nestedQuery = request.optString("query", "");
        if (nestedQuery.startsWith("?")) nestedQuery = nestedQuery.substring(1);

        JSONObject consentFailure = AiConsent.ensure(host, session, sessionTitle, capability);
        if (consentFailure != null) {
            putCapability(consentFailure, capability);
            return consentFailure;
        }

        JSONObject result = AndroidApi.handle(path, nestedQuery, nested, host);
        putCapability(result, capability);
        if ("/android/screenshot".equals(path) && result.optBoolean("ok", false)) {
            return saveScreenshot(result);
        }
        return result;
    }

    /**
     * Path→capability table from docs/AI-API.md §2. `method` is the nested call's
     * method (the outer request is always POST).
     */
    private static String capabilityFor(String path, String method) {
        boolean post = "POST".equals(method);
        if ("/android".equals(path)) return "read";
        if ("/android/info".equals(path) || "/android/foreground".equals(path)) return "read";
        if ("/android/permissions".equals(path)) return post ? "control" : "read";
        if ("/android/clipboard".equals(path)) return "clipboard";
        if ("/android/toast".equals(path) || "/android/vibrate".equals(path)
                || "/android/notify/cancel".equals(path)) return "notify";
        if ("/android/notify".equals(path)) return post ? "notify" : "read";
        if ("/android/screenshot".equals(path)) return "screenshot";
        if ("/android/share".equals(path) || "/android/open".equals(path)
                || "/android/global".equals(path)) return "control";
        if ("/android/volume".equals(path) || "/android/display".equals(path)
                || "/android/dnd".equals(path) || "/android/apps".equals(path)) {
            return post ? "control" : "read";
        }
        return null;
    }

    // -------------------------------------------------------------- /ai/consent

    private static JSONObject revoke(JSONObject request) {
        boolean all = request.optBoolean("all", false);
        String session = request.optString("session", "").trim();
        String capability = request.optString("capability", "").trim();
        int revoked;
        if (all) {
            revoked = AiConsent.revokeAll();
        } else if (!session.isEmpty()) {
            if (!capability.isEmpty()) {
                if (!AiConsent.isCapability(capability)) {
                    return failure("未知的能力：" + capability,
                            "可用：" + join(AiConsent.capabilities()));
                }
                revoked = AiConsent.revoke(session, capability);
            } else {
                revoked = AiConsent.revokeSession(session);
            }
        } else {
            return failure("要撤销什么？",
                    "带 session（可再带 capability），或 all:true");
        }
        JSONObject answer = new JSONObject();
        try {
            answer.put("ok", true);
            answer.put("revoked", revoked);
            answer.put("message", revoked > 0 ? "已撤销" : "没有匹配的授权");
        } catch (Throwable ignored) {
        }
        return answer;
    }

    // ------------------------------------------------------------ /ai/consent/risk

    /**
     * Save which capabilities need a per-conversation confirmation.
     *
     * <p>Body: {@code {"capabilities":["control","screenshot"]}}. An empty array
     * is a valid choice ("nothing is high risk"). Only the six known capabilities
     * are accepted; duplicates are removed and the response returns the normalized
     * set. {@link AiConsent#setRisk} also prunes grants that are no longer relevant.
     */
    private static JSONObject setRisk(JSONObject request) {
        if (!request.has("capabilities") || request.isNull("capabilities")) {
            return failure("缺少 capabilities 数组",
                    "请求体形如 {\"capabilities\":[\"control\",\"screenshot\"]}；空数组表示都不需要确认");
        }
        JSONArray requested = request.optJSONArray("capabilities");
        if (requested == null) {
            return failure("capabilities 必须是数组",
                    "请求体形如 {\"capabilities\":[\"control\",\"screenshot\"]}；空数组表示都不需要确认");
        }
        for (int i = 0; i < requested.length(); i++) {
            if (requested.isNull(i)) {
                return failure("capabilities 里不能有 null", null);
            }
            String capability = requested.optString(i, "");
            if (!AiConsent.isCapability(capability)) {
                return failure("未知的能力：" + capability,
                        "可用：" + join(AiConsent.capabilities()));
            }
        }
        if (!AiConsent.setRisk(requested)) {
            // Never report "saved" when SharedPreferences refused the write.
            return failure("保存高危能力设置失败",
                    "请重试；如果一直失败，检查应用的存储空间或存储权限");
        }
        JSONArray saved = AiConsent.riskJson();
        JSONObject answer = new JSONObject();
        try {
            answer.put("ok", true);
            answer.put("risk", saved);
            answer.put("message", "已保存高危能力设置");
        } catch (Throwable ignored) {
        }
        return answer;
    }

    // --------------------------------------------------------- /ai/terminal/tabs

    private static JSONObject terminalTabs(BridgeServer.Host host, JSONObject request) {
        String session = request.optString("session", "").trim();
        if (session.isEmpty()) {
            return failure("缺少 session：AI 调用要带上对话 id", null);
        }
        // Validate the action *before* asking for consent: a malformed request must
        // never pop the system prompt (terminal may be configured as high risk).
        String action = request.optString("action", "").trim().toLowerCase(Locale.ROOT);
        if (action.isEmpty()) {
            return failure("缺少 action", "可选 list / open / activate / close");
        }
        if (!"list".equals(action) && !"open".equals(action)
                && !"activate".equals(action) && !"close".equals(action)) {
            return failure("不认识的标签页动作：" + action,
                    "可选 list / open / activate / close");
        }
        String sessionTitle = AiConsent.cleanSessionTitle(request.optString("sessionTitle", ""));
        JSONObject consentFailure = AiConsent.ensure(host, session, sessionTitle, "terminal");
        if (consentFailure != null) {
            putCapability(consentFailure, "terminal");
            return consentFailure;
        }
        return TerminalTabs.action(request);
    }

    // --------------------------------------------------------------- screenshot

    /**
     * The model gets a file path, not a few hundred KB of base64.
     *
     * <p>The bridge answer for `/android/screenshot` carries {@code image}; this
     * decodes it to {@code Download/dsh-shot-<ts>-<seq>.jpg} on shared storage and
     * replaces it with the file path the guest can open at {@code /sdcard/...}.
     * The sequence suffix keeps concurrent same-millisecond captures apart, and
     * only the newest 20 are kept.
     */
    private static JSONObject saveScreenshot(JSONObject captured) {
        String encoded = captured.optString("image", "");
        if (encoded.isEmpty()) return captured;
        byte[] jpeg;
        try {
            jpeg = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
        } catch (Throwable error) {
            JSONObject failure = failure("截屏数据无法解码：" + error, null);
            putCapability(failure, "screenshot");
            return failure;
        }
        JSONObject saved = ShotStore.saveJpeg(jpeg, captured.optInt("width", 0),
                captured.optInt("height", 0), "dsh-shot");
        if (!saved.optBoolean("ok", false)) {
            putCapability(saved, "screenshot");
            return saved;
        }
        try {
            captured.remove("image");
            captured.put("file", saved.optString("file", ""));
            captured.put("bytes", saved.optInt("bytes", jpeg.length));
            return captured;
        } catch (Throwable error) {
            JSONObject failure = failure("截屏已保存，但无法组装响应：" + error, null);
            putCapability(failure, "screenshot");
            return failure;
        }
    }

    // ---------------------------------------------------------------- plumbing

    private static void putCapability(JSONObject answer, String capability) {
        try {
            if (answer != null && !answer.has("capability")) {
                answer.put("capability", capability);
            }
        } catch (Throwable ignored) {
        }
    }

    private static String join(String[] values) {
        StringBuilder builder = new StringBuilder();
        for (String value : values) {
            if (builder.length() > 0) builder.append(" / ");
            builder.append(value);
        }
        return builder.toString();
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
