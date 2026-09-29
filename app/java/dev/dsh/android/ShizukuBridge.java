package dev.dsh.android;

import android.os.ParcelFileDescriptor;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

import rikka.shizuku.Shizuku;

/**
 * Shizuku: the privileged Android channel, declared in the manifest as
 * moe.shizuku.manager.permission.API_V23.
 *
 * This is what makes the sandbox useful outside its own rootfs — the same
 * authority `adb shell` has (package manager, settings, activity manager,
 * input, screencap), without root. The app never asks for root: if the user
 * has not granted Shizuku, every call here fails and the UI says so.
 *
 * Commands run as the Shizuku server's uid (shell), NOT as the app: two
 * different worlds, and the callers of this class must not confuse them.
 */
public final class ShizukuBridge {

    public static final int REQUEST_CODE = 0x5348;

    public static final class Result {
        public final int exitCode;
        public final String stdout;
        public final String stderr;
        public final String error;

        Result(int exitCode, String stdout, String stderr, String error) {
            this.exitCode = exitCode;
            this.stdout = stdout;
            this.stderr = stderr;
            this.error = error;
        }
    }

    private ShizukuBridge() {
    }

    /** True once the Shizuku manager process has handed us its binder. */
    public static boolean available() {
        try {
            return Shizuku.pingBinder();
        } catch (Throwable error) {
            return false;
        }
    }

    public static boolean granted() {
        try {
            return available() && Shizuku.checkSelfPermission() == 0;
        } catch (Throwable error) {
            return false;
        }
    }

    public static int version() {
        try {
            return available() ? Shizuku.getVersion() : 0;
        } catch (Throwable error) {
            return 0;
        }
    }

    /**
     * Ask the manager to show its permission dialog.
     *
     * The answer does not come back through the activity: Shizuku handles its
     * own confirmation over the binder, so the result is delivered to listeners
     * registered here (this is the v13 flow, where the grant is not a real
     * Android runtime permission).
     */
    public static void requestPermission() {
        try {
            Shizuku.requestPermission(REQUEST_CODE);
        } catch (Throwable error) {
            App.log("shizuku: requestPermission failed: " + error);
        }
    }

    public static void addPermissionListener() {
        if (permissionListener != null) return;
        permissionListener = (requestCode, grantResult) ->
                App.log("shizuku: permission result " + requestCode + " -> " + grantResult);
        try {
            Shizuku.addRequestPermissionResultListener(permissionListener);
        } catch (Throwable error) {
            App.log("shizuku: addPermissionListener failed: " + error);
            permissionListener = null;
        }
    }

    private static Shizuku.OnRequestPermissionResultListener permissionListener;

    /**
     * Spawn a process as the Shizuku server's user.
     *
     * Shizuku's own process API is {@code private static} in API 13 — the
     * documented replacement is a user service, which would mean shipping a
     * second bound service just to run one command. Reflection keeps the small
     * surface, and the method is the library's own implementation of the same
     * AIDL call the user-service path makes.
     */
    private static Process spawn(String[] command, String[] env, String dir) throws Exception {
        if (newProcessMethod == null) {
            newProcessMethod = Shizuku.class.getDeclaredMethod(
                    "newProcess", String[].class, String[].class, String.class);
            newProcessMethod.setAccessible(true);
        }
        return (Process) newProcessMethod.invoke(null, command, env, dir);
    }

    private static java.lang.reflect.Method newProcessMethod;

    /**
     * Run {@code command} through the Shizuku server's shell.
     *
     * Runs the caller's thread: callers are the bridge server's worker threads,
     * never the main thread.
     */
    public static Result exec(String command, long timeoutMs) {
        if (!available()) {
            return new Result(-1, "", "", "Shizuku 不可用（未安装或服务未运行）");
        }
        if (!granted()) {
            return new Result(-1, "", "", "Shizuku 未授权，请在设置页请求授权");
        }
        Process process = null;
        try {
            process = spawn(new String[]{"sh", "-c", command}, null, null);
            StringBuilder out = new StringBuilder();
            StringBuilder err = new StringBuilder();
            Thread outReader = drain(process.getInputStream(), out);
            Thread errReader = drain(process.getErrorStream(), err);
            final Process spawned = process;
            final boolean[] exited = {false};
            Thread waiter = new Thread(() -> {
                try {
                    spawned.waitFor();
                    exited[0] = true;
                } catch (InterruptedException ignored) {
                }
            }, "shizuku-wait");
            waiter.setDaemon(true);
            waiter.start();
            waiter.join(timeoutMs);
            boolean finished = exited[0];
            if (!finished) {
                process.destroy();
            }
            outReader.join(500);
            errReader.join(500);
            int exit = finished ? process.exitValue() : -1;
            return new Result(exit, out.toString(), err.toString(),
                    finished ? null : "命令执行超时，已终止");
        } catch (Throwable error) {
            App.log("shizuku: exec failed: " + error);
            return new Result(-1, "", "", String.valueOf(error.getMessage()));
        } finally {
            if (process != null) {
                try {
                    process.destroy();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    private static Thread drain(final InputStream stream, final StringBuilder sink) {
        Thread thread = new Thread(() -> {
            try (InputStream in = stream; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int read;
                while ((read = in.read(chunk)) > 0) {
                    buffer.write(chunk, 0, read);
                    if (buffer.size() > (1 << 20)) break;   // keep a runaway command bounded
                }
                synchronized (sink) {
                    sink.append(buffer.toString("UTF-8"));
                }
            } catch (Throwable ignored) {
            }
        }, "shizuku-drain");
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    /** A Shizuku user service needs a ParcelFileDescriptor reference to stay alive; unused. */
    @SuppressWarnings("unused")
    private static void keepAlive(ParcelFileDescriptor descriptor) {
    }
}
