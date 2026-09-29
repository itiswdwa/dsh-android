package dev.dsh.android;

import android.content.Context;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * PRoot invocation.
 *
 * The binary ships as lib/arm64-v8a/libproot.so: an app's native library
 * directory is the one location Android reliably lets an app execve() from,
 * while the payload it launches lives in the private files dir.
 *
 * -0              fake root inside the guest (uid 0 view, no real privilege)
 * --kill-on-exit  guests die with proot, which is what makes "stop server"
 *                 actually stop node instead of orphaning it
 *
 * Deliberately NOT passing --link2symlink. It makes link() produce a relative
 * symlink into a hidden temporary file, which is invisible until something
 * deletes the original: the harness's atomic writer creates a temp directory,
 * links the new file into place, drops the directory — and with link2symlink
 * every freshly created file becomes a dangling symlink while the tool still
 * reports success. App-private storage is a normal filesystem that supports
 * hardlinks, so the honest behaviour is available and strictly better.
 */
public final class Proot {

    public static final String LIB_NAME = "libproot.so";

    private static final String DEFAULT_PATH =
            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

    /**
     * Where the *host-side* proot process keeps its scratch: glue roots for
     * binds, link2symlink metadata. Android has no /tmp an app may write, so
     * without this proot fails with "can't create temporary directory" and then
     * reports the misleading execve failure that follows it.
     */
    public static File hostTmpDir() {
        File dir = new File(App.i().tmpDir, "proot");
        if (!dir.isDirectory() && !dir.mkdirs()) {
            App.log("cannot create proot tmp dir " + dir);
        }
        return dir;
    }

    /**
     * Host environment every proot invocation needs.
     *
     * Only the scratch directory: PRoot's default (seccomp-accelerated) syscall
     * path is the one that works on current Android. Forcing PROOT_NO_SECCOMP
     * makes it fall back to a slower, less complete ptrace path, which surfaces
     * as ENOSYS ("Function not implemented") from ordinary calls like chdir.
     */
    public static void applyHostEnvironment(Map<String, String> env) {
        env.put("PROOT_TMP_DIR", hostTmpDir().getAbsolutePath());
    }

    private Proot() {
    }

    public static File binary(Context ctx) {
        return new File(ctx.getApplicationInfo().nativeLibraryDir, LIB_NAME);
    }

    /** The app's own launcher: one PRoot process per distro. */
    public static List<String> argv(Context ctx, File rootfs, String guestCommand) {
        return argvFor(binary(ctx), rootfs, Collections.emptyList(), guestCommand);
    }

    private static List<String> argvFor(File proot, File rootfs, List<String> extraBinds, String guestCommand) {
        List<String> cmd = new ArrayList<>();
        cmd.add(proot.getAbsolutePath());
        cmd.add("--kill-on-exit");
        cmd.add("-0");
        cmd.add("-r");
        cmd.add(rootfs.getAbsolutePath());
        for (String bind : new String[]{"/dev", "/proc", "/sys"}) {
            cmd.add("-b");
            cmd.add(bind);
        }
        File home = new File(App.i().runDir, "home");
        if (!home.isDirectory() && !home.mkdirs()) {
            App.log("cannot create guest home " + home);
        }
        cmd.add("-b");
        cmd.add(home.getAbsolutePath() + ":/root");
        File shared = App.i().sharedStorage();
        if (shared != null) {
            cmd.add("-b");
            cmd.add(shared.getAbsolutePath() + ":/sdcard");
        }
        for (Mounts.Mount mount : Mounts.enabled()) {
            cmd.add("-b");
            cmd.add(mount.host + ":" + mount.guest);
        }
        for (String bind : extraBinds) {
            cmd.add("-b");
            cmd.add(bind);
        }
        cmd.add("-w");
        cmd.add("/root");
        cmd.add("/bin/sh");
        cmd.add("-lc");
        cmd.add(guestCommand);
        return cmd;
    }

    public static final class Result {
        public final int exitCode;
        public final String stdout;
        public final String stderr;

        Result(int exitCode, String stdout, String stderr) {
            this.exitCode = exitCode;
            this.stdout = stdout;
            this.stderr = stderr;
        }

        public String describe() {
            return "exit=" + exitCode + (stderr.isEmpty() ? "" : " stderr=" + trim(stderr));
        }

        private static String trim(String text) {
            String single = text.trim().replace('\n', ' ');
            return single.length() > 300 ? single.substring(0, 300) + "…" : single;
        }
    }

    /**
     * Run one command in the bundled guest and capture its output.
     *
     * Blocking: callers are background threads. Used for jobs that belong to the
     * guest's own tooling rather than to the app — extracting an imported rootfs
     * is the guest's `tar` doing the work, which is the same division of labour
     * every mature PRoot distribution manager uses.
     */
    public static Result exec(Context ctx, List<String> extraBinds, String command, long timeoutMs)
            throws IOException, InterruptedException {
        App app = App.i();
        List<String> argv = argvFor(binary(ctx), app.bundledHome(), extraBinds, command);
        App.log("proot exec: " + command);
        ProcessBuilder builder = new ProcessBuilder(argv);
        Map<String, String> env = builder.environment();
        env.put("PATH", DEFAULT_PATH);
        env.put("HOME", "/root");
        env.put("LANG", "C.UTF-8");
        applyHostEnvironment(env);
        Process process = builder.start();

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
        }, "proot-wait");
        waiter.setDaemon(true);
        waiter.start();
        waiter.join(timeoutMs);
        if (!exited[0]) {
            process.destroy();
            throw new IOException("guest command timed out: " + command);
        }
        outReader.join(1000);
        errReader.join(1000);
        Result result = new Result(process.exitValue(), out.toString(), err.toString());
        App.log("proot exec done: " + result.describe());
        return result;
    }

    private static Thread drain(final java.io.InputStream stream, final StringBuilder sink) {
        Thread thread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8), 1 << 13)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    synchronized (sink) {
                        sink.append(line).append('\n');
                        if (sink.length() > (1 << 20)) sink.setLength(0);
                    }
                }
            } catch (IOException ignored) {
            }
        }, "proot-drain");
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    /**
     * Default start command for the bundled distro: the guest's own entry
     * script, which brings up the PTY endpoint and then becomes the harness.
     * Environment (ports, tokens, bridge address) is injected by the app.
     */
    public static String bundledCommand(int port) {
        return "exec /opt/dsh/android/start-dsh.sh";
    }
}
