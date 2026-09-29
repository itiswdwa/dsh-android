package dev.dsh.android;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Environment;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Process-wide paths and configuration.
 *
 * Everything the sandbox needs lives under the app's private files dir, because
 * that is the only place we may both write freely and (see AndroidManifest)
 * execute from. Layout:
 *
 *   files/distros/ubuntu/        bundled payload: Ubuntu + Node + dsh
 *   files/distros/<id>/          imported PRoot distributions
 *   files/tmp/                   staging for imports
 *   files/run/server.pid         guest pid of the running dsh server
 *   files/logs/server.log        combined server stdout/stderr
 */
public final class App extends Application {

    /**
     * Identity of the payload this build ships.
     *
     * Generated from the archive's own content hash (see scripts/build_apk.sh),
     * so a changed payload always re-extracts. A hand-bumped constant was wrong
     * twice: the app kept running the previous tree and every fix looked like it
     * had not landed.
     */
    public static final String PAYLOAD_VERSION = BuildInfo.PAYLOAD_VERSION;

    public static final String BUNDLED_ID = "ubuntu";

    private static App instance;

    public File distrosDir;
    public File distroDir;      // of the active distro
    public File tmpDir;
    public File runDir;
    public File logsDir;
    public File serverLog;
    public File pidFile;

    public SharedPreferences prefs;

    public static App i() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        File root = getFilesDir();
        distrosDir = new File(root, "distros");
        tmpDir = new File(root, "tmp");
        runDir = new File(root, "run");
        logsDir = new File(root, "logs");
        serverLog = new File(logsDir, "server.log");
        pidFile = new File(runDir, "server.pid");
        for (File d : new File[]{distrosDir, tmpDir, runDir, logsDir}) {
            if (!d.exists() && !d.mkdirs()) {
                android.util.Log.e("dsh", "cannot create " + d);
            }
        }
        prefs = getSharedPreferences("dsh", Context.MODE_PRIVATE);
        migrateLegacyDistro();
        distroDir = new File(distrosDir, activeDistroId());
    }

    /**
     * The bundled distro was Alpine before it was Ubuntu. Its tree is ~400 MB and
     * its profile id is gone, so drop it rather than leave it orphaned beside the
     * new payload; a user who was running it falls back to the bundled distro.
     */
    private void migrateLegacyDistro() {
        File legacy = new File(distrosDir, "alpine");
        if (BUNDLED_ID.equals("alpine") || !legacy.isDirectory()) return;
        Payload.deleteTree(legacy);
        SharedPreferences.Editor editor = prefs.edit()
                .remove("cmd.alpine")
                .remove("name.alpine");
        if ("alpine".equals(prefs.getString("distro", BUNDLED_ID))) {
            editor.remove("distro");
        }
        editor.apply();
        android.util.Log.i("dsh", "removed legacy alpine distro");
    }

    /** Distro the app boots; the bundled Ubuntu unless the user picked another. */
    public String activeDistroId() {
        return prefs.getString("distro", BUNDLED_ID);
    }

    public void setActiveDistroId(String id) {
        prefs.edit().putString("distro", id).apply();
        distroDir = new File(distrosDir, id);
    }

    public int port() {
        return prefs.getInt("port", 3080);
    }

    /**
     * Port the running server actually bound. Starts equal to the preference and
     * moves only when that port is taken, so the UI, the WebView URL and the
     * bridge never disagree about where the harness is listening.
     */
    private int activePort;

    public int activePort() {
        return activePort > 0 ? activePort : port();
    }

    /**
     * First loopback port at or after the configured one that nothing holds.
     *
     * A phone can have another harness (or a desktop session forwarded to it)
     * already on 3080; failing to start because of that is a bad trade when the
     * harness supports any port.
     */
    public int resolveFreePort() {
        for (int offset = 0; offset < 20; offset++) {
            int candidate = port() + offset;
            try (java.net.ServerSocket probe = new java.net.ServerSocket(
                    candidate, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
                if (offset > 0) App.log("port " + port() + " busy, using " + candidate);
                activePort = candidate;
                return candidate;
            } catch (java.io.IOException busy) {
                activePort = 0;
            }
        }
        App.log("no free loopback port in " + port() + ".." + (port() + 19));
        activePort = port();
        return activePort;
    }

    /** Loopback port of the app's control bridge (Web UI settings page). */
    public int bridgePort() {
        return prefs.getInt("bridgePort", 8399);
    }

    /** Loopback port of the in-guest PTY service the terminal panel uses. */
    public int ptyPort() {
        return prefs.getInt("ptyPort", 3099);
    }

    /**
     * Per-process secrets. Regenerated on every app start and never persisted:
     * both services are loopback-only, and a token that dies with the process
     * cannot be replayed by anything that reads the device later.
     */
    private static String bridgeToken;

    private static String ptyToken;

    public String ensureBridgeToken() {
        if (bridgeToken == null) bridgeToken = randomToken();
        return bridgeToken;
    }

    public String ensurePtyToken() {
        if (ptyToken == null) ptyToken = randomToken();
        return ptyToken;
    }

    public String ptyToken() {
        return ensurePtyToken();
    }

    private static String randomToken() {
        byte[] bytes = new byte[24];
        new java.security.SecureRandom().nextBytes(bytes);
        return android.util.Base64.encodeToString(bytes,
                android.util.Base64.URL_SAFE | android.util.Base64.NO_PADDING | android.util.Base64.NO_WRAP);
    }

    public String startCommand() {
        return prefs.getString("cmd", "");
    }

    /** Path the payload was installed to, or null when setup has not run. */
    public File bundledHome() {
        return new File(distrosDir, BUNDLED_ID);
    }

    public boolean isBundledReady() {
        return new File(bundledHome(), ".payload-" + PAYLOAD_VERSION).isFile();
    }

    /** True once the user has granted the legacy read/write permission. */
    public boolean hasStorageAccess() {
        return checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Root of the shared storage bind, or null when unavailable/disabled.
     *
     * The permission gate matters: without it the bind would mount a path the
     * app cannot read, and the guest would see /sdcard as an empty directory
     * rather than as "not shared" — a failure the user cannot diagnose.
     */
    public File sharedStorage() {
        if (!prefs.getBoolean("shareStorage", true)) return null;
        if (!hasStorageAccess()) return null;
        File ext = Environment.getExternalStorageDirectory();
        if (ext == null || !ext.isDirectory()) return null;
        return ext;
    }

    public static void log(String message) {
        android.util.Log.i("dsh", message);
        App app = instance;
        if (app == null) return;
        try {
            String stamp = new SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(new Date());
            try (OutputStream out = new FileOutputStream(app.serverLog, true)) {
                out.write((stamp + "  " + message + "\n").getBytes("UTF-8"));
            }
        } catch (IOException ignored) {
            // logging must never take the app down
        }
    }

    public void clearServerLog() {
        try (OutputStream out = new FileOutputStream(serverLog, false)) {
            out.write(new byte[0]);
        } catch (IOException ignored) {
        }
    }
}
