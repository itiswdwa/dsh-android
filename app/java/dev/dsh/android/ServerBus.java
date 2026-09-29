package dev.dsh.android;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.io.BufferedReader;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Owns the PRoot/node server process and the state the UI observes.
 *
 * Both the activity and the foreground service live in the same process, so a
 * singleton with listener callbacks is enough and no IPC is needed.
 */
public final class ServerBus {

    public enum State {IDLE, PREPARING, STARTING, RUNNING, ERROR}

    public interface Listener {
        void onServerState();
    }

    /** The URL dsh prints once the Web UI is listening, token included. */
    private static final Pattern URL = Pattern.compile("(http://127\\.0\\.0\\.1:\\d+/\\?token=[A-Za-z0-9_\\-]+)");

    private static final Object LOCK = new Object();
    private static final Deque<String> LOG = new ArrayDeque<>();
    private static final List<Listener> LISTENERS = new ArrayList<>();

    private static State state = State.IDLE;
    private static String url;
    private static String error;
    private static Process process;
    private static Thread pump;
    private static long startedAt;

    private ServerBus() {
    }

    public static State state() {
        return state;
    }

    public static String url() {
        return url;
    }

    public static String error() {
        return error;
    }

    public static long startedAt() {
        return startedAt;
    }

    public static boolean running() {
        return state == State.RUNNING;
    }

    public static List<String> log() {
        synchronized (LOCK) {
            return new ArrayList<>(LOG);
        }
    }

    public static void addListener(Listener listener) {
        synchronized (LISTENERS) {
            LISTENERS.add(listener);
        }
        listener.onServerState();
    }

    public static void removeListener(Listener listener) {
        synchronized (LISTENERS) {
            LISTENERS.remove(listener);
        }
    }

    private static void setState(State next, String detail) {
        synchronized (LOCK) {
            state = next;
            if (detail != null) {
                LOG.addLast(detail);
                while (LOG.size() > 400) LOG.removeFirst();
            }
        }
        if (detail != null) {
            App.log(detail);
        }
        notifyListeners();
    }

    private static void notifyListeners() {
        List<Listener> copy;
        synchronized (LISTENERS) {
            copy = new ArrayList<>(LISTENERS);
        }
        new Handler(Looper.getMainLooper()).post(() -> {
            for (Listener listener : copy) {
                listener.onServerState();
            }
        });
    }

    public static synchronized void start(Context ctx, Distros.Distro distro, String apiKey) {
        if (process != null && process.isAlive()) {
            setState(State.RUNNING, "已在运行，忽略重复启动");
            return;
        }
        if (distro == null) {
            setState(State.ERROR, "没有可用的发行版（先导入一个 rootfs）");
            error = "no distro";
            return;
        }
        url = null;
        error = null;
        App app = App.i();
        app.clearServerLog();
        setState(State.STARTING, "启动 " + distro.name);

        int port = app.resolveFreePort();
        String command = distro.command == null || distro.command.trim().isEmpty()
                ? Proot.bundledCommand(port)
                : distro.command;
        List<String> argv = Proot.argv(ctx, distro.root, command);

        ProcessBuilder builder = new ProcessBuilder(argv);
        builder.redirectErrorStream(true);
        builder.directory(app.distroDir);
        Mounts.ensureGuestDirs(distro.root);
        for (Mounts.Mount mount : Mounts.configured()) {
            String problem = mount.problem();
            App.log(problem.isEmpty()
                    ? "mount: " + mount.host + " -> " + mount.guest
                    : "mount: 跳过 " + mount.host + " -> " + mount.guest + "：" + problem);
        }
        java.util.Map<String, String> env = builder.environment();
        env.put("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
        env.put("HOME", "/root");
        env.put("TERM", "xterm-256color");
        env.put("LANG", "C.UTF-8");
        env.put("TMPDIR", "/tmp");
        // Ports and secrets for the two in-guest services. The PTY token is
        // generated here and handed to the Web UI through the native bridge, so
        // the terminal panel can reach the endpoint without any file on disk.
        env.put("DSH_PORT", String.valueOf(port));
        env.put("DSH_PTY_PORT", String.valueOf(app.ptyPort()));
        env.put("DSH_PTY_TOKEN", app.ensurePtyToken());
        env.put("DSH_ANDROID_BRIDGE_URL", "http://127.0.0.1:" + app.bridgePort());
        env.put("DSH_ANDROID_BRIDGE_TOKEN", app.ensureBridgeToken());
        env.put("DSH_ANDROID_APP", "1");
        Proot.applyHostEnvironment(env);
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            env.put("DEEPSEEK_API_KEY", apiKey.trim());
        }
        App.log("exec: " + String.join(" ", argv));

        try {
            process = builder.start();
            startedAt = System.currentTimeMillis();
            pump = new Thread(() -> pumpOutput(process), "dsh-output");
            pump.setDaemon(true);
            pump.start();
        } catch (Exception e) {
            error = e.toString();
            setState(State.ERROR, "启动失败: " + e);
        }
    }

    private static void pumpOutput(Process p) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8), 1 << 13);
             OutputStream raw = new FileOutputStream(App.i().serverLog, true);
             Writer file = new OutputStreamWriter(raw, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                file.write(line);
                file.write('\n');
                file.flush();
                onLine(line);
            }
        } catch (Exception e) {
            App.log("output pump: " + e);
        }
        int code = -1;
        try {
            code = p.waitFor();
        } catch (InterruptedException ignored) {
        }
        synchronized (LOCK) {
            if (process == p) {
                process = null;
                if (state != State.IDLE) {
                    boolean wasRunning = url != null;
                    state = code == 0 || wasRunning ? State.IDLE : State.ERROR;
                    if (code != 0 && !wasRunning) {
                        error = "进程退出，code=" + code + "（见日志）";
                    }
                }
            }
        }
        setState(state, "服务进程退出，code=" + code);
    }

    private static void onLine(String line) {
        synchronized (LOCK) {
            LOG.addLast(line);
            while (LOG.size() > 400) LOG.removeFirst();
        }
        Matcher matcher = URL.matcher(line);
        if (matcher.find()) {
            url = matcher.group(1);
            setState(State.RUNNING, "服务就绪: " + url);
        } else if (state == State.STARTING && line.trim().length() > 0) {
            notifyListeners();
        }
    }

    public static synchronized void stop() {
        setState(state == State.RUNNING ? State.IDLE : state, "停止服务");
        Process p = process;
        process = null;
        url = null;
        if (p != null) {
            p.destroy();   // proot --kill-on-exit takes the guests with it
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (p.isAlive()) p.destroyForcibly();
            }, 1500);
        }
        setState(State.IDLE, "已停止");
    }

    public static boolean isEmulator() {
        return "generic".equals(Build.BRAND) || Build.FINGERPRINT.contains("generic");
    }
}
