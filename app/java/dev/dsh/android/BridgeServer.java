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

        /** Open the file picker for the floating ball's picture. */
        void onBallImageRequested();

        /**
         * One of the grants the phone-assistant feature needs (see
         * {@link Assist#PERMISSION_ACCESSIBILITY} and friends). The activity owns
         * the system settings pages and the runtime-permission dialogs; the
         * bridge only names what is missing.
         */
        void onAssistPermission(int which);
    }

    private static ServerSocket server;
    private static Thread thread;
    private static volatile boolean running;
    private static String token = "";
    private static Host host;

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
        if (!body.isEmpty()) {
            try {
                request = new JSONObject(body);
            } catch (Throwable ignored) {
            }
        }
        String query = "";
        int q = path.indexOf('?');
        if (q >= 0) {
            query = path.substring(q + 1);
            path = path.substring(0, q);
        }

        try {
            handle(path, request, out, host);
        } catch (Throwable error) {
            // Assist throws IllegalStateException for every "the user has not
            // enabled this yet" case; the message is already written for them.
            try {
                respondJson(out, 200, error(String.valueOf(error.getMessage())));
            } catch (Exception ignored) {
            }
        }
    }

    /** Screen size, so a caller can aim a swipe without guessing the panel size. */
    private static String screenSize() {
        android.util.DisplayMetrics metrics = App.i().getResources().getDisplayMetrics();
        return metrics.widthPixels + "x" + metrics.heightPixels;
    }

    private static void handle(String path, JSONObject request, OutputStream out, Host host)
            throws Exception {
        switch (path) {
            case "/snapshot":
                respondJson(out, 200, snapshot());
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
                ServerBus.stop();
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                        () -> DshService.ensure(App.i()), 800);
                respondJson(out, 200, ok("正在重启"));
                return;
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
                editor.apply();
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
            case "/ball/pick-image":
                if (host != null) host.onBallImageRequested();
                respondJson(out, 200, ok("请选择图片或矢量图 XML"));
                return;
            case "/ball/start":
                BallService.start(App.i());
                respondJson(out, 200, ok(BallService.isRunning() ? "悬浮球已开启" : "需要「显示在其他应用上层」权限"));
                return;
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
