package dev.dsh.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The app's control bridge: a loopback HTTP/JSON service that the harness Web UI
 * (and, through it, the agent) uses to drive the sandbox.
 *
 * It exists because the Web UI is *inside* a WebView looking at the harness on a
 * different port, and because the things the settings page must do — start and
 * stop the PRoot process, install a distro from the phone's storage, ask
 * Shizuku for privileged execution — are app-side capabilities a web page
 * cannot reach on its own.
 *
 *   GET  /snapshot                     everything the settings page polls
 *   POST /theme                     {"dark": true|false}
 *   POST /server/start|stop|restart
 *   POST /open-in-browser
 *   POST /import
 *   POST /distros/select|delete|command
 *   POST /settings
 *   POST /log/clear
 *   POST /shizuku/request|exec
 *
 * Security: 127.0.0.1 only, and every request carries the per-boot token the
 * app also injects into the WebView. Without it, another app on the phone could
 * reach in and get a shell in the sandbox.
 */
public final class BridgeServer {

    public interface Host {
        void onImportRequested();

        void onPickMountFolderRequested();

        void onOpenUrlRequested(String url);

        void onOpenInBrowser();

        void onShizukuPermissionRequested();

        /** Open the file picker so the user can apply a hot package by hand. */
        void onHotPickRequested();

        /**
         * Which palette the page is painting (see `POST /theme`).
         *
         * The window's bars and its own background belong to Android, and its theme
         * follows the *phone's* dark mode - which can disagree with the harness. The
         * page is the only place that knows the harness theme, so it pushes it here.
         */
        void onThemeReported(boolean dark, String background, float alpha);

        /** The window-chrome choice changed in the settings page; repaint the window. */
        void onChromeModeChanged();

        /** Open the file picker for the floating ball's picture. */
        void onBallImageRequested();

        /**
         * One of the grants the phone-assistant feature needs (see
         * {@link Assist#PERMISSION_ACCESSIBILITY} and friends). The activity owns
         * the system settings pages and the runtime-permission dialogs; the
         * bridge only names what is missing.
         */
        void onAssistPermission(int which);

        /**
         * A light tap under the finger for a Web-UI control (the terminal's key
         * row). The activity turns this into the platform's own
         * `HapticFeedbackConstants.KEYBOARD_TAP`, so it follows the user's
         * touch-feedback setting instead of buzzing unconditionally. Defaulted to
         * a no-op so an older host implementation still compiles.
         */
        default void onHapticTap() {
        }

        /**
         * A phone capability the plugin API needs the user to grant (see
         * {@code /android/permissions}). Only the grants the activity must own are
         * routed here — system-settings pages are opened by {@link AndroidApi}
         * directly. Defaulted so an older host implementation still compiles.
         */
        default void onAndroidPermission(String target) {
        }

        /** Keep the DSH window awake for {@code POST /android/display {"keepOn":true}}. */
        default void onScreenKeepOn(boolean on) {
        }

        /**
         * Show the system BiometricPrompt for {@code GET/POST /android/biometric}
         * and the per-conversation consent behind {@code /ai/android}. The
         * activity owns the dialog; the bridge thread blocks until the callback
         * fires (at most 60 s, enforced by {@link Biometric}).
         *
         * <p>Defaulted to an immediate failure so an older host still compiles and
         * a bridge request can never hang waiting for a dialog nobody can show.
         */
        default void onBiometric(String title, String subtitle, String description,
                BiometricCallback callback) {
            if (callback != null) callback.onResult(false, "当前宿主不支持生物识别确认");
        }
    }

    /**
     * Completion of one biometric prompt. The activity calls this exactly once;
     * `error` is already user-readable Chinese when authentication did not
     * succeed.
     */
    public interface BiometricCallback {
        void onResult(boolean authenticated, String error);
    }

    private static ServerSocket server;
    private static Thread thread;
    private static volatile boolean running;
    private static String token = "";
    private static volatile Host host;

    private BridgeServer() {
    }

    public static String token() {
        return token;
    }

    public static int port() {
        return App.i().bridgePort();
    }

    public static synchronized void start(Host callback) {
        host = callback;
        if (running) return;
        token = App.i().ensureBridgeToken();
        final int port = port();
        thread = new Thread(() -> {
            try {
                server = new ServerSocket(port, 16, InetAddress.getByName("127.0.0.1"));
                running = true;
                App.log("bridge: listening on 127.0.0.1:" + port);
                while (running) {
                    Socket socket = server.accept();
                    Thread worker = new Thread(() -> handle(socket), "bridge-request");
                    worker.setDaemon(true);
                    worker.start();
                }
            } catch (IOException error) {
                App.log("bridge: stopped: " + error);
            } finally {
                running = false;
            }
        }, "bridge-server");
        thread.setDaemon(true);
        thread.start();
    }

    public static synchronized void stop() {
        running = false;
        if (server != null) {
            try {
                server.close();
            } catch (IOException ignored) {
            }
            server = null;
        }
    }

    /**
     * Drop the activity callback when its owner is destroyed. Only clears it when
     * {@code callback} is still the registered host, so an activity that was
     * recreated (and already re-registered) is not unregistered by the old
     * instance's teardown.
     */
    public static synchronized void releaseHost(Host callback) {
        if (host == callback) host = null;
    }

    // ------------------------------------------------------------------ request

    private static void handle(Socket socket) {
        try (Socket client = socket;
             InputStream rawIn = new BufferedInputStream(client.getInputStream());
             OutputStream out = new BufferedOutputStream(client.getOutputStream())) {
            String requestLine = readLine(rawIn);
            if (requestLine == null) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1];

            Map<String, String> headers = new HashMap<>();
            String line;
            while ((line = readLine(rawIn)) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon > 0) {
                    headers.put(line.substring(0, colon).trim().toLowerCase(), line.substring(colon + 1).trim());
                }
            }
            int length = 0;
            try {
                length = Integer.parseInt(headers.getOrDefault("content-length", "0"));
            } catch (NumberFormatException ignored) {
            }
            String body = "";
            if (length > 0) {
                byte[] buffer = new byte[Math.min(length, 1 << 20)];
                int read = 0;
                while (read < buffer.length) {
                    int got = rawIn.read(buffer, read, buffer.length - read);
                    if (got < 0) break;
                    read += got;
                }
                body = new String(buffer, 0, read, StandardCharsets.UTF_8);
            }

            if ("OPTIONS".equals(method)) {
                respond(out, 204, "");
                return;
            }
            if (!token.equals(headers.get("x-dsh-token"))) {
                respondJson(out, 401, error("unauthorized"));
                return;
            }
            route(out, method, path, body);
        } catch (Throwable error) {
            App.log("bridge: request failed: " + error);
        }
    }

    private static void route(OutputStream out, String method, String path, String body) throws IOException {
        JSONObject request = new JSONObject();
        boolean invalidBody = false;
        if (!body.isEmpty()) {
            try {
                request = new JSONObject(body);
            } catch (Throwable ignored) {
                invalidBody = true;
            }
        }
        String query = "";
        int q = path.indexOf('?');
        if (q >= 0) {
            query = path.substring(q + 1);
            path = path.substring(0, q);
        }

        try {
            // The plugin/AI surface promises a JSON error for every failure. An
            // unparsable body used to become an empty object, which made POST
            // /android/clipboard look like a successful "clear the clipboard" and
            // POST /android/display look like a no-op.
            if (invalidBody && isJsonSurface(path)) {
                respondJson(out, 200, error("请求体不是合法 JSON"));
                return;
            }
            handle(path, query, request, out, host, method);
        } catch (Throwable error) {
            // Assist throws IllegalStateException for every "the user has not
            // enabled this yet" case; the message is already written for them.
            try {
                respondJson(out, 200, error(String.valueOf(error.getMessage())));
            } catch (Exception ignored) {
            }
        }
    }

    /** Paths whose contract says every failure is `{ok:false,error,...}`. */
    private static boolean isJsonSurface(String path) {
        return path.equals("/android") || path.startsWith("/android/")
                || path.startsWith("/ai/") || path.startsWith("/terminal/tabs/");
    }

    /**
     * Stop the sandbox and bring it back up.
     *
     * The 800 ms gap is the same one `/server/restart` always used: PRoot's
     * --kill-on-exit needs a moment to reap the guest, and starting into a port
     * the dying tree still holds is the one failure that looks random.
     */
    private static void restartServer() {
        ServerBus.stop();
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                () -> DshService.ensure(App.i()), 800);
    }

    /** Screen size, so a caller can aim a swipe without guessing the panel size. */
    private static String screenSize() {
        android.util.DisplayMetrics metrics = App.i().getResources().getDisplayMetrics();
        return metrics.widthPixels + "x" + metrics.heightPixels;
    }

    private static void handle(String path, String query, JSONObject request, OutputStream out, Host host,
            String method) throws Exception {
        // Biometric is its own thing: GET is a status probe, POST shows the system
        // prompt. It therefore sits in front of the generic /android dispatch.
        if (path.equals("/android/biometric")) {
            respondJson(out, 200, Biometric.handle(method, request, host));
            return;
        }
        // The AI surface (docs/AI-API.md) wraps the Android endpoints with
        // per-conversation consent, and relays UI terminal tabs.
        if (path.startsWith("/ai/")) {
            respondJson(out, 200, AiApi.handle(method, path, query, request, host));
            return;
        }
        if (path.startsWith("/terminal/tabs/")) {
            respondJson(out, 200, TerminalTabs.handle(method, path, request));
            return;
        }
        // The plugin-facing Android surface (docs/ANDROID-API.md). It owns its own
        // error shape (`{ok:false,error,hint,needs}`) and never throws for a missing
        // grant, so it gets first refusal before the app's own switch.
        if (path.equals("/android") || path.startsWith("/android/")) {
            respondJson(out, 200, AndroidApi.handle(path, query, request, host));
            return;
        }
        switch (path) {
            case "/snapshot":
                respondJson(out, 200, snapshot());
                return;
            case "/theme":
                // The page's palette, so the window can paint its bars and its own
                // background to match it. Fire-and-forget: the app remembers the last
                // value and re-applies it on every load, so a lost report is corrected
                // by the next one instead of leaving white edges behind.
                // `bg` is the page's own background colour (#rrggbb); it is what the
                // bars are filled with, so they match the page instead of our guess.
                String background = request.optString("bg", "");
                if (!background.matches("^#[0-9a-fA-F]{6}$")) background = null;
                // `alpha` is how opaque the page paints its own scrim; the bars copy it so
                // the top, middle and bottom read as one surface.
                float alpha = (float) request.optDouble("alpha", 1);
                if (!(alpha > 0) || alpha > 1) alpha = 1f;
                host.onThemeReported(request.optBoolean("dark", false), background, alpha);
                respondJson(out, 200, ok("主题已同步"));
                return;
            case "/haptic":
                // Fire-and-forget feedback for a Web-UI control: the terminal's key
                // row sends this on every press and debounces it on the page, so the
                // answer carries no state and a missed tick is invisible.
                host.onHapticTap();
                respondJson(out, 200, ok("已反馈"));
                return;
            case "/server/start":
                DshService.ensure(App.i());
                respondJson(out, 200, ok("已请求启动"));
                return;
            case "/server/stop":
                DshService.stopServer(App.i());
                respondJson(out, 200, ok("已停止"));
                return;
            case "/server/restart":
                restartServer();
                respondJson(out, 200, ok("正在重启"));
                return;
            case "/recovery/status":
                respondJson(out, 200, Recovery.status());
                return;
            case "/recovery/start": {
                // Entering recovery is a restart: the guest's entry point (and so
                // whether sshd exists at all) is decided when the PRoot process
                // starts, not after.
                if (request.has("port")) Recovery.setPort(request.optInt("port", Recovery.port()));
                if (request.has("auto")) Recovery.setAuto(request.optBoolean("auto", Recovery.auto()));
                Recovery.enter("桥请求");
                restartServer();
                JSONObject answer = Recovery.status();
                answer.put("ok", true);
                answer.put("message", "已进入恢复模式，正在启动 sshd");
                respondJson(out, 200, answer);
                return;
            }
            case "/recovery/stop":
                Recovery.exit("桥请求");
                restartServer();
                respondJson(out, 200, ok("已退出恢复模式，正在回到 harness"));
                return;
            case "/recovery/token": {
                String fresh = Recovery.rotateToken();
                JSONObject answer = Recovery.status();
                answer.put("ok", true);
                answer.put("token", fresh);
                answer.put("message", "令牌已换新；重启恢复模式后才生效");
                respondJson(out, 200, answer);
                return;
            }
            case "/open-in-browser":
                if (host != null) host.onOpenInBrowser();
                respondJson(out, 200, ok("已交给系统浏览器"));
                return;
            case "/import":
                if (host != null) host.onImportRequested();
                respondJson(out, 200, ok("请在手机上选择 rootfs 归档"));
                return;
            case "/update/check": {
                respondJson(out, 200, Updates.check(request.optString("url", Updates.MANIFEST)));
                return;
            }
            case "/terminal/fetch": {
                // The slim shell ships without the runtime; this pulls the one
                // published for its terminal version. Idempotent: a second call
                // while a download is running is ignored.
                JSONObject answer = new JSONObject();
                if (Payload.terminalBusy()) {
                    answer.put("ok", true);
                    answer.put("message", "正在下载（" + Payload.terminalProgress() + "）");
                } else if (App.i().isBundledReady()) {
                    answer.put("ok", true);
                    answer.put("message", "运行时已经在位");
                } else {
                    Payload.fetchTerminal(App.i(), request.optString("url", ""),
                            request.optString("manifest", ""));
                    answer.put("ok", true);
                    answer.put("message", "已开始下载，进度看这一行");
                }
                respondJson(out, 200, answer);
                return;
            }
            case "/hot/pick":
                if (host != null) host.onHotPickRequested();
                respondJson(out, 200, ok("请在手机上选择 dsh-hot.zip"));
                return;
            case "/hot/fetch": {
                respondJson(out, 200, Payload.fetchAndApply(App.i(), request.optString("url", "")));
                return;
            }
            case "/open-url": {
                if (host != null) host.onOpenUrlRequested(request.optString("url", ""));
                respondJson(out, 200, ok("已在浏览器打开"));
                return;
            }
            case "/export": {
                respondJson(out, 200, Exports.run(request.optString("path", "")));
                return;
            }
            case "/export/recent":
                respondJson(out, 200, Exports.recent());
                return;
            case "/mounts/test": {
                String id = request.optString("id", "");
                for (Mounts.Mount mount : Mounts.list()) {
                    if (!mount.id.equals(id)) continue;
                    JSONObject answer = new JSONObject();
                    try {
                        answer.put("ok", true);
                        answer.put("problem", mount.problem());
                        answer.put("host", mount.host);
                        answer.put("guest", mount.guest);
                        // Ask the guest itself: the only way to tell a bind that
                        // worked from one that produced an empty directory.
                        String script = "ls -la -- " + shellQuote(mount.guest)
                                + " 2>&1 | head -20; echo '---'; "
                                + "mount | grep -F -- " + shellQuote(mount.guest) + " || true";
                        Proot.Result result = Proot.exec(App.i(),
                                java.util.Collections.emptyList(), script, 30000);
                        answer.put("output", result.stdout.trim());
                        answer.put("exit", result.exitCode);
                    } catch (Throwable error) {
                        try {
                            answer.put("ok", false);
                            answer.put("error", String.valueOf(error.getMessage()));
                        } catch (Throwable ignored) {
                        }
                    }
                    respondJson(out, 200, answer);
                    return;
                }
                respondJson(out, 404, error("没有这条挂载"));
                return;
            }
            case "/mounts/add": {
                Mounts.Mount added = Mounts.add(request.optString("host", ""),
                        request.optString("guest", ""));
                JSONObject answer = ok(added == null ? "挂载路径为空" : "已添加挂载");
                try {
                    if (added != null) answer.put("mount", added.toJson());
                    answer.put("restartRequired", true);
                } catch (Throwable ignored) {
                }
                respondJson(out, 200, answer);
                return;
            }
            case "/mounts/pick":
                if (host != null) host.onPickMountFolderRequested();
                respondJson(out, 200, ok("请在手机上选择文件夹"));
                return;
            case "/mounts/remove": {
                Mounts.remove(request.optString("id", ""));
                JSONObject answer = ok("已移除挂载");
                try {
                    answer.put("restartRequired", true);
                } catch (Throwable ignored) {
                }
                respondJson(out, 200, answer);
                return;
            }
            case "/mounts/toggle":
                Mounts.setEnabled(request.optString("id", ""), request.optBoolean("enabled", true));
                respondJson(out, 200, ok("已更新挂载"));
                return;
            case "/mounts/guest":
                Mounts.setGuestPath(request.optString("id", ""), request.optString("guest", ""));
                respondJson(out, 200, ok("已更新挂载路径"));
                return;
            case "/distros/select": {
                String id = request.optString("id", App.BUNDLED_ID);
                App.i().setActiveDistroId(id);
                respondJson(out, 200, ok("已选中 " + id));
                return;
            }
            case "/distros/delete": {
                String id = request.optString("id", "");
                Distros.remove(id);
                if (id.equals(App.i().activeDistroId())) App.i().setActiveDistroId(App.BUNDLED_ID);
                respondJson(out, 200, ok("已删除 " + id));
                return;
            }
            case "/distros/command": {
                String id = request.optString("id", "");
                Distros.setCommand(id, request.optString("command", ""));
                respondJson(out, 200, ok("命令已保存"));
                return;
            }
            case "/settings": {
                App app = App.i();
                android.content.SharedPreferences.Editor editor = app.prefs.edit();
                if (request.has("port")) {
                    int port = request.optInt("port", app.port());
                    editor.putInt("port", port < 1 || port > 65535 ? 3080 : port);
                }
                if (request.has("apiKey")) editor.putString("apiKey", request.optString("apiKey", ""));
                if (request.has("shareStorage")) editor.putBoolean("shareStorage", request.optBoolean("shareStorage", true));
                if (request.has("keepAwake")) editor.putBoolean("keepAwake", request.optBoolean("keepAwake", true));
                if (request.has("autoRestart")) editor.putBoolean("autoRestart", request.optBoolean("autoRestart", true));
                if (request.has("chromeMode")) {
                    String chrome = request.optString("chromeMode", "auto");
                    editor.putString("window_chrome_mode",
                            "acrylic".equals(chrome) || "solid".equals(chrome) ? chrome : "auto");
                }
                editor.apply();
                if (request.has("chromeMode")) host.onChromeModeChanged();
                JSONObject answer = ok("设置已保存");
                try {
                    if (request.has("port")) answer.put("restartRequired", true);
                } catch (Throwable ignored) {
                }
                respondJson(out, 200, answer);
                return;
            }
            case "/log/clear":
                App.i().clearServerLog();
                respondJson(out, 200, ok("日志已清空"));
                return;
            // ---------------------------------------------------------- 手机助手
            // The screen-control surface. Every one of these is a no-op with an
            // explanatory error until the user has switched the accessibility
            // service on, which is what `/a11y/request` is for.
            case "/a11y/status": {
                JSONObject answer = new JSONObject();
                answer.put("ok", true);
                answer.put("service", Assist.available());
                answer.put("overlay", Assist.canOverlay(App.i()));
                answer.put("microphone", App.i().checkSelfPermission(
                        android.Manifest.permission.RECORD_AUDIO)
                        == android.content.pm.PackageManager.PERMISSION_GRANTED);
                answer.put("ball", BallService.isRunning());
                answer.put("screen", screenSize());
                respondJson(out, 200, answer);
                return;
            }
            case "/a11y/request":
                if (host != null) host.onAssistPermission(Assist.PERMISSION_ACCESSIBILITY);
                respondJson(out, 200, ok("请在「已下载的服务」里开启 DSH 手机助手"));
                return;
            case "/overlay/request":
                if (host != null) host.onAssistPermission(Assist.PERMISSION_OVERLAY);
                respondJson(out, 200, ok("请允许 DSH 显示在其他应用上层"));
                return;
            case "/mic/request":
                if (host != null) host.onAssistPermission(Assist.PERMISSION_MICROPHONE);
                respondJson(out, 200, ok("请允许 DSH 录音"));
                return;
            case "/ball/inbox": {
                // The ball's own conversation. `text` present means "the user just
                // said this"; absent means "what is still waiting". The plugin
                // drains it (see installBallInbox) and acks by id.
                JSONObject answer = new JSONObject();
                if (request.has("text")) {
                    answer.put("id", BallInbox.add(request.optString("text", "")));
                }
                answer.put("ok", true);
                answer.put("items", BallInbox.pending());
                respondJson(out, 200, answer);
                return;
            }
            case "/ball/inbox/ack": {
                BallInbox.ack(request.optJSONArray("ids"));
                JSONObject answer = new JSONObject();
                answer.put("ok", true);
                answer.put("items", BallInbox.pending());
                respondJson(out, 200, answer);
                return;
            }
            case "/ball/state": {
                // The status channel. `phase` present means "this is what I am
                // doing" (the `ball` CLI, or the page); absent means "tell me what
                // the ball is showing", which the page polls so its own fallback
                // stays out of the way.
                JSONObject answer = new JSONObject();
                if (request.has("phase")) {
                    BallService.setState(request.optString("phase", "idle"), request.optString("text", ""));
                    answer.put("ok", true);
                }
                answer.put("state", BallService.stateJson());
                respondJson(out, 200, answer);
                return;
            }
            case "/ball/say": {
                // Anything with something to report: the page (which tool is
                // running), a guest script, or the agent itself.
                String text = request.optString("text", "");
                BallService.sayFromOutside(text);
                JSONObject answer = new JSONObject();
                answer.put("ok", true);
                answer.put("shown", BallService.isRunning());
                respondJson(out, 200, answer);
                return;
            }
            case "/ball/config": {
                // Appearance only — size and picture. Everything about how it
                // behaves is code, but this is what makes tweaks to how it looks
                // a hot package away rather than a new shell.
                android.content.SharedPreferences.Editor edit = App.i().prefs.edit();
                if (request.has("size")) {
                    edit.putInt(BallService.PREF_SIZE, request.optInt("size", BallService.DEFAULT_SIZE_DP));
                }
                if (request.has("image")) edit.putString(BallService.PREF_IMAGE, request.optString("image", ""));
                edit.apply();
                BallService.reload(App.i());
                respondJson(out, 200, ok("已应用"));
                return;
            }
            case "/ball/settings": {
                // The flat settings map: one read returns everything, and a body writes
                // only the keys it carries, so adding a key never changes the protocol.
                android.content.SharedPreferences.Editor edit = App.i().prefs.edit();
                boolean wrote = false;
                if (request.has("ballShowStatus")) { edit.putBoolean(BallService.PREF_SHOW_STATUS, request.optBoolean("ballShowStatus", true)); wrote = true; }
                if (request.has("ballShowThink")) { edit.putBoolean(BallService.PREF_SHOW_THINK, request.optBoolean("ballShowThink", true)); wrote = true; }
                if (request.has("ballShowRing")) { edit.putBoolean(BallService.PREF_SHOW_RING, request.optBoolean("ballShowRing", true)); wrote = true; }
                if (request.has("ballBubbleLines")) {
                    int lines = request.optInt("ballBubbleLines", 3);
                    edit.putInt(BallService.PREF_BUBBLE_LINES, lines < 1 ? 1 : Math.min(lines, 3));
                    wrote = true;
                }
                if (request.has("ballSizeDp")) {
                    int size = request.optInt("ballSizeDp", BallService.DEFAULT_SIZE_DP);
                    edit.putInt(BallService.PREF_SIZE, size < 32 ? 32 : Math.min(size, 96));
                    wrote = true;
                }
                if (request.has("ballImagePath")) { edit.putString(BallService.PREF_IMAGE, request.optString("ballImagePath", "")); wrote = true; }
                if (wrote) {
                    edit.apply();
                    BallService.applySettings();
                    BallService.reload(App.i());
                }
                JSONObject answer = new JSONObject(BallService.settingsJson());
                answer.put("ok", true);
                respondJson(out, 200, answer);
                return;
            }
            case "/ball/reset-position":
                BallService.resetPosition(App.i());
                respondJson(out, 200, ok("已重置到默认位置"));
                return;
            case "/ball/pick-image":
                if (host != null) host.onBallImageRequested();
                respondJson(out, 200, ok("请选择图片或矢量图 XML"));
                return;
            case "/ball/start": {
                // `start` hands the work to a foreground service, so asking isRunning()
                // right here answers "not yet" even on the happy path - which used to be
                // reported as a missing overlay permission. The permission is the only
                // thing that can actually refuse the request, so ask that instead, and
                // treat "still coming up" as the success it is.
                App app = App.i();
                boolean allowed = Assist.canOverlay(app);
                BallService.start(app);
                JSONObject answer = allowed
                        ? ok(BallService.isRunning() ? "悬浮球已开启" : "正在开启悬浮球")
                        : error("需要「显示在其他应用上层」权限，请在「权限与助手」里授予");
                if (!allowed) answer.put("needsOverlayPermission", true);
                respondJson(out, 200, answer);
                return;
            }
            case "/ball/stop":
                BallService.stop(App.i());
                respondJson(out, 200, ok("悬浮球已关闭"));
                return;
            case "/a11y/tree": {
                JSONObject answer = new JSONObject(Assist.describe(request.optBoolean("text", false)));
                answer.put("ok", answer.optBoolean("ok", false));
                respondJson(out, 200, answer);
                return;
            }
            case "/a11y/tap":
                Assist.tap((float) request.optDouble("x", -1), (float) request.optDouble("y", -1));
                respondJson(out, 200, ok("已点击"));
                return;
            case "/a11y/swipe":
                Assist.swipe((float) request.optDouble("x1", -1), (float) request.optDouble("y1", -1),
                        (float) request.optDouble("x2", -1), (float) request.optDouble("y2", -1),
                        request.optLong("ms", 300));
                respondJson(out, 200, ok("已滑动"));
                return;
            case "/a11y/key":
                Assist.key(request.optString("name", ""));
                respondJson(out, 200, ok("已发送 " + request.optString("name", "")));
                return;
            case "/a11y/type":
                Assist.type(request.optString("text", ""));
                respondJson(out, 200, ok("已输入"));
                return;
            case "/a11y/click": {
                String label = request.optString("label", "");
                respondJson(out, 200, ok(Assist.click(label)));
                return;
            }
            case "/a11y/open": {
                String app = request.optString("app", "");
                respondJson(out, 200, ok(Assist.launch(app, App.i())));
                return;
            }
            case "/shizuku/request":
                if (host != null) host.onShizukuPermissionRequested();
                respondJson(out, 200, ok("已请求授权，请在手机上确认"));
                return;
            case "/shizuku/exec": {
                final String command = request.optString("command", "");
                ShizukuBridge.Result result = ShizukuBridge.exec(command,
                        request.optLong("timeoutMs", 20000));
                JSONObject answer = new JSONObject();
                try {
                    answer.put("exit", result.exitCode);
                    answer.put("stdout", result.stdout);
                    answer.put("stderr", result.stderr);
                    if (result.error != null) answer.put("error", result.error);
                } catch (Throwable ignored) {
                }
                respondJson(out, 200, answer);
                return;
            }
            default:
                respondJson(out, 404, error("not found: " + path));
        }
    }

    // ----------------------------------------------------------------- snapshot

    private static JSONObject snapshot() {
        App app = App.i();
        JSONObject root = new JSONObject();
        try {
            JSONObject status = new JSONObject();
            status.put("state", ServerBus.state().name());
            status.put("url", ServerBus.url() == null ? "" : ServerBus.url());
            status.put("port", app.activePort());
            status.put("error", ServerBus.error() == null ? "" : ServerBus.error());
            status.put("uptimeMs", ServerBus.startedAt() == 0 ? 0
                    : System.currentTimeMillis() - ServerBus.startedAt());
            root.put("status", status);

            JSONArray distros = new JSONArray();
            String active = app.activeDistroId();
            for (Distros.Distro distro : Distros.list(app)) {
                JSONObject item = new JSONObject();
                item.put("id", distro.id);
                item.put("name", distro.name);
                item.put("path", distro.root.getAbsolutePath());
                item.put("bundled", distro.bundled);
                item.put("active", distro.id.equals(active));
                item.put("usable", distro.isUsable());
                item.put("command", distro.command == null ? "" : distro.command);
                distros.put(item);
            }
            root.put("distros", distros);

            JSONObject settings = new JSONObject();
            settings.put("port", app.port());
            settings.put("apiKey", app.prefs.getString("apiKey", ""));
            settings.put("shareStorage", app.prefs.getBoolean("shareStorage", true));
            settings.put("keepAwake", app.prefs.getBoolean("keepAwake", true));
            settings.put("chromeMode", app.prefs.getString("window_chrome_mode", "auto"));
            settings.put("autoRestart", app.prefs.getBoolean("autoRestart", true));
            root.put("settings", settings);

            JSONArray mounts = new JSONArray();
            for (Mounts.Mount mount : Mounts.list()) {
                mounts.put(mount.toJson());
            }
            root.put("mounts", mounts);
            root.put("sharedStorage", app.sharedStorage() == null ? ""
                    : app.sharedStorage().getAbsolutePath());

            root.put("appVersion", App.appVersion());
            root.put("appVersionCode", App.appVersionCode());
            root.put("terminalVersion", App.terminalVersion());
            root.put("hotVersion", Payload.hotVersion());
            root.put("packagedHotVersion", Payload.packagedHotVersion());
            root.put("hotMessage", Payload.hotMessage());
            root.put("terminalVersion", App.terminalVersion());
            // Is the runtime in this APK, or does it have to be fetched?
            root.put("payloadBundled", Payload.hasBundledPayload(app));
            root.put("terminalReady", app.isBundledReady());
            root.put("terminalBusy", Payload.terminalBusy());
            root.put("terminalProgress", Payload.terminalProgress());
            JSONObject ball = new JSONObject();
            ball.put("size", App.i().prefs.getInt(BallService.PREF_SIZE, BallService.DEFAULT_SIZE_DP));
            ball.put("image", App.i().prefs.getString(BallService.PREF_IMAGE, ""));
            root.put("ball", ball);

            JSONObject shizuku = new JSONObject();
            shizuku.put("installed", ShizukuBridge.available());
            shizuku.put("granted", ShizukuBridge.granted());
            shizuku.put("version", ShizukuBridge.version());
            root.put("shizuku", shizuku);

            JSONObject pty = new JSONObject();
            pty.put("url", "http://127.0.0.1:" + app.ptyPort());
            pty.put("token", app.ptyToken());
            root.put("pty", pty);

            JSONObject bridge = new JSONObject();
            bridge.put("url", "http://127.0.0.1:" + port());
            bridge.put("token", token);
            root.put("bridge", bridge);

            // Recovery state travels with the snapshot so the Web UI can show it
            // too — but note that the page is only reachable when the harness is
            // up, which is exactly when recovery is not needed. Its real consumer
            // is the native console.
            root.put("recovery", Recovery.status());

            JSONArray log = new JSONArray();
            List<String> lines = ServerBus.log();
            for (int i = Math.max(0, lines.size() - 160); i < lines.size(); i++) {
                log.put(lines.get(i));
            }
            root.put("log", log);
        } catch (Throwable error) {
            App.log("bridge: snapshot failed: " + error);
        }
        return root;
    }

    // ------------------------------------------------------------------ plumbing

    /** Single-quote for the guest shell: the path comes from the UI. */
    private static String shellQuote(String value) {
        return "'" + (value == null ? "" : value.replace("'", "'\\''")) + "'";
    }

    private static JSONObject ok(String message) {
        JSONObject object = new JSONObject();
        try {
            object.put("ok", true);
            object.put("message", message);
        } catch (Throwable ignored) {
        }
        return object;
    }

    private static JSONObject error(String message) {
        JSONObject object = new JSONObject();
        try {
            object.put("ok", false);
            object.put("error", message);
        } catch (Throwable ignored) {
        }
        return object;
    }

    private static void respondJson(OutputStream out, int code, JSONObject payload) throws IOException {
        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        StringBuilder head = new StringBuilder()
                .append("HTTP/1.1 ").append(code).append(' ').append(code == 200 ? "OK" : "ERR").append("\r\n")
                .append("Content-Type: application/json; charset=utf-8\r\n")
                .append("Content-Length: ").append(body.length).append("\r\n")
                .append("Connection: close\r\n")
                .append("Access-Control-Allow-Origin: *\r\n")
                .append("Access-Control-Allow-Headers: X-Dsh-Token, Content-Type\r\n")
                .append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\r\n");
        out.write(head.toString().getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static void respond(OutputStream out, int code, String text) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 " + code + " No Content\r\nContent-Length: " + body.length
                + "\r\nAccess-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Headers: X-Dsh-Token, Content-Type\r\n"
                + "Connection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder builder = new StringBuilder();
        int c;
        while ((c = in.read()) >= 0) {
            if (c == '\n') break;
            if (c != '\r') builder.append((char) c);
            if (builder.length() > 8192) break;
        }
        return c < 0 && builder.length() == 0 ? null : builder.toString();
    }
}
