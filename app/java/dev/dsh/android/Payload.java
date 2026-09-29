package dev.dsh.android;

import android.content.Context;
import android.system.ErrnoException;
import android.system.Os;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * First-run installation of the bundled sandbox.
 *
 * assets/payload.zip holds a complete Ubuntu rootfs (glibc, aarch64) with Node,
 * the harness, and this app's guest-side services. Installing it means
 * unpacking ~250 MB into filesDir.
 *
 * The archive is a zip read by java.util.zip, deliberately: an earlier tar
 * reader here desynchronised on the padding after some file entries and
 * silently dropped the entries that followed. Zip carries the two things a
 * rootfs actually needs — unix modes and symlinks — through the external
 * attributes field, so the JDK's parser is sufficient and there is no format
 * code to get wrong.
 */
public final class Payload {

    public static final String ASSET = "payload.zip";

    /**
     * Sibling of the archive carrying unix modes and symlink targets:
     * "mode<TAB>path[<TAB>link-target]", one entry per non-directory. Android's
     * ZipEntry exposes no external attributes, so the zip cannot carry them.
     */
    public static final String MANIFEST = "payload.manifest";

    private static final int S_IFMT = 0xF000;
    private static final int S_IFLNK = 0xA000;

    public interface Progress {
        void onProgress(long done, long total, String detail);
    }

    private Payload() {
    }

    public static boolean isReady() {
        return App.i().isBundledReady();
    }

    /** Overlay archive of the small, always-current files (see scripts/make_hot_zip.py). */
    public static final String HOT_ASSET = "hot.zip";

    /**
     * Where a *received* hot package is expected to land.
     *
     * This is how a newer plugin or skill reaches a phone without re-sending the
     * 143 MB APK: download the ~20 KB dsh-hot.zip, drop it in Download, open the
     * app. Anything a hot package may write is limited to the prefixes below.
     */
    public static final String[] HOT_DROP_DIRS = {"Download", "Documents"};

    private static final String[] HOT_ALLOWED_PREFIXES = {
            "opt/dsh/android/", "opt/dsh/dsh-plugin-android/", "etc/", "@home/"
    };

    private static final String HOT_VERSION_KEY = "hotVersion";

    /**
     * Re-apply the hot overlay into the bundled rootfs.
     *
     * Runs on every launch: the payload archive is only re-extracted when its
     * content hash changes, and without this a plugin or guest-script fix would
     * mean unpacking the whole rootfs again. Entries are guest-absolute paths.
     */
    public static void applyHot(Context ctx) {
        int fromAsset = unpackHot(ctx, null, null);
        if (fromAsset >= 0) {
            App.log("hot overlay applied: " + fromAsset + " files");
        }
        applyReceivedHot(ctx);
    }

    /**
     * Pick up a hot package the user received out of band.
     *
     * Only one whose version differs from the last one applied is unpacked, so
     * leaving the file in Download is harmless and re-running is a no-op.
     */
    private static void applyReceivedHot(Context ctx) {
        App app = App.i();
        File shared = android.os.Environment.getExternalStorageDirectory();
        if (shared == null) return;
        for (String folder : HOT_DROP_DIRS) {
            File candidate = new File(new File(shared, folder), "dsh-hot.zip");
            if (!candidate.isFile()) continue;
            try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(candidate)) {
                String version = hotVersionOf(zip);
                if (version == null) {
                    App.log("hot package " + candidate + " has no hot.json; ignored");
                    continue;
                }
                if (version.equals(app.prefs.getString(HOT_VERSION_KEY, ""))) {
                    App.log("hot package already applied: " + version);
                    continue;
                }
                int written = unpackHot(ctx, zip, version);
                if (written >= 0) {
                    app.prefs.edit().putString(HOT_VERSION_KEY, version).apply();
                    App.log("received hot package applied: " + version + " (" + written + " files)");
                }
            } catch (IOException error) {
                App.log("hot package " + candidate + " failed: " + error);
            }
            return;
        }
    }

    private static String hotVersionOf(java.util.zip.ZipFile zip) {
        java.util.zip.ZipEntry entry = zip.getEntry("hot.json");
        if (entry == null) return null;
        try (InputStream in = zip.getInputStream(entry)) {
            org.json.JSONObject json = new org.json.JSONObject(readAll(in));
            return json.optString("version", null);
        } catch (Throwable error) {
            return null;
        }
    }

    /**
     * Download a hot package and apply it — the one-tap path.
     *
     * Only ever called from a bridge worker thread, and only for the ~50 KB hot
     * archive: the APK itself is never downloaded in-process, because a 143 MB
     * transfer belongs to the browser and the system installer.
     */
    public static org.json.JSONObject fetchAndApply(Context ctx, String url) {
        org.json.JSONObject answer = new org.json.JSONObject();
        try {
            if (url == null || !url.startsWith("https://")) {
                answer.put("ok", false);
                answer.put("error", "只接受 https 地址");
                return answer;
            }
            File staged = new File(App.i().tmpDir, "hot-download.zip");
            java.net.HttpURLConnection connection =
                    (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "dsh-android/" + BuildInfo.APP_VERSION);
            long total = 0;
            try (InputStream in = connection.getInputStream();
                 OutputStream out = new FileOutputStream(staged)) {
                total = copy(in, out, null);
            }
            if (connection.getResponseCode() != 200 || total < 1024) {
                answer.put("ok", false);
                answer.put("error", "下载失败 (HTTP " + connection.getResponseCode() + ", " + total + " 字节)");
                return answer;
            }
            try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(staged)) {
                String version = hotVersionOf(zip);
                if (version == null) {
                    answer.put("ok", false);
                    answer.put("error", "不是有效的热更新包（缺 hot.json）");
                    return answer;
                }
                if (version.equals(App.i().prefs.getString(HOT_VERSION_KEY, ""))) {
                    answer.put("ok", true);
                    answer.put("version", version);
                    answer.put("message", "已经是最新（" + version + "）");
                    return answer;
                }
                int written = unpackHot(ctx, zip, version);
                if (written < 0) {
                    answer.put("ok", false);
                    answer.put("error", "解包失败");
                    return answer;
                }
                App.i().prefs.edit().putString(HOT_VERSION_KEY, version).apply();
                answer.put("ok", true);
                answer.put("version", version);
                answer.put("files", written);
                answer.put("bytes", total);
                answer.put("message", "热更新已应用（" + version + "，" + written + " 个文件），下次打开生效");
                App.log("hot update applied from " + url + ": " + version + " (" + written + " files)");
            }
            //noinspection ResultOfMethodCallIgnored
            staged.delete();
        } catch (Throwable error) {
            App.log("hot fetch failed: " + error);
            try {
                answer.put("ok", false);
                answer.put("error", String.valueOf(error.getMessage()));
            } catch (Throwable ignored) {
            }
        }
        return answer;
    }

    /** Version of the hot package received out of band, empty when none was applied. */
    public static String hotVersion() {
        return App.i().prefs.getString(HOT_VERSION_KEY, "");
    }

    /**
     * Version of the hot package baked into this APK.
     *
     * Comparing the two is how the settings page can say whether a received
     * package is ahead of the app or the app is already ahead of it.
     */
    public static String packagedHotVersion() {
        try {
            return hotVersionOf(AssetZip.open(App.i(), HOT_ASSET));
        } catch (Throwable error) {
            return "";
        }
    }

    /**
     * Write one hot package into the bundled rootfs.
     *
     * @param zip source archive, or null to read the packaged asset
     * @param version version stamp, for logging only
     * @return number of files written, or -1 when the source could not be read
     */
    private static int unpackHot(Context ctx, java.util.zip.ZipFile zip, String version) {
        App app = App.i();
        File root = app.bundledHome();
        if (!root.isDirectory()) return -1;
        int written = 0;
        try {
            if (zip != null) {
                java.util.Enumeration<? extends java.util.zip.ZipEntry> entries = zip.entries();
                while (entries.hasMoreElements()) {
                    java.util.zip.ZipEntry entry = entries.nextElement();
                    if (entry.isDirectory()) continue;
                    try (InputStream in = zip.getInputStream(entry)) {
                        if (writeHotEntry(ctx, root, entry.getName(), in)) written++;
                    }
                }
                return written;
            }
        } catch (IOException error) {
            App.log("hot package unpack failed: " + error);
            return -1;
        }
        try (java.util.zip.ZipInputStream stream =
                     new java.util.zip.ZipInputStream(ctx.getAssets().open(HOT_ASSET))) {
            java.util.zip.ZipEntry entry;
            while ((entry = stream.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                if (writeHotEntry(ctx, root, entry.getName(), stream)) written++;
            }
        } catch (IOException error) {
            App.log("hot overlay failed (continuing with the archived copies): " + error);
            return -1;
        }
        return written;
    }

    /** One entry, if it lands inside the rootfs and inside an allowed prefix. */
    private static boolean writeHotEntry(Context ctx, File root, String name, InputStream in)
            throws IOException {
        if (name.equals("hot.json") || name.endsWith("/")) return false;
        boolean allowed = false;
        for (String prefix : HOT_ALLOWED_PREFIXES) {
            if (name.startsWith(prefix)) {
                allowed = true;
                break;
            }
        }
        if (!allowed) {
            App.log("hot package entry refused (outside the allowed prefixes): " + name);
            return false;
        }
        // "@home/" lands in the guest's /root, which is a bind mount from app
        // storage — the rootfs copy would be shadowed and invisible.
        File base = root;
        String relative = name;
        if (name.startsWith("@home/")) {
            base = new File(App.i().runDir, "home");
            relative = name.substring("@home/".length());
        }
        File target = new File(base, relative);
        if (!isInside(base, target)) {
            App.log("hot package entry refused (escapes the root): " + name);
            return false;
        }
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) return false;
        clearLink(target);
        try (OutputStream out = new FileOutputStream(target)) {
            copy(in, out, null);
        }
        chmod(target, name.endsWith(".sh") ? 0755 : 0644);
        return true;
    }

    /** Legacy single-shot overlay path kept for the asset case. */
    private static int unusedUnpackLegacy(Context ctx, File root, InputStream source) {
        int written = 0;
        try (java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(source)) {
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (name.endsWith("/") || !isInside(root, new File(root, name))) {
                    continue;
                }
                File target = new File(root, name);
                File parent = target.getParentFile();
                if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                    continue;
                }
                clearLink(target);
                try (OutputStream out = new FileOutputStream(target)) {
                    copy(zip, out, null);
                }
                chmod(target, name.endsWith(".sh") ? 0755 : 0644);
                written++;
            }
        } catch (IOException error) {
            App.log("legacy hot unpack failed: " + error);
            return -1;
        }
        return written;
    }

    /** Extract the bundled payload when missing or stale. Safe to call twice. */
    public static void install(Context ctx, Progress progress) throws IOException {
        App app = App.i();
        File home = app.bundledHome();
        if (app.isBundledReady()) {
            return;
        }
        deleteTree(home);
        if (!home.mkdirs() && !home.isDirectory()) {
            throw new IOException("cannot create " + home);
        }

        // java.util.zip needs a real file, and a staged copy also lets us verify
        // the byte count instead of trusting an asset stream.
        File staged = new File(app.tmpDir, ASSET);
        long copied;
        try (InputStream raw = ctx.getAssets().open(ASSET);
             OutputStream out = new FileOutputStream(staged)) {
            copied = copy(raw, out, null);
        }
        App.log("payload staged: " + copied + " bytes");
        if (copied < 4096) {
            throw new IOException("payload asset looks empty (" + copied + " bytes)");
        }

        try (ZipFile zip = new ZipFile(staged)) {
            long total = 0;
            for (Enumeration<? extends ZipEntry> scan = zip.entries(); scan.hasMoreElements(); ) {
                total += Math.max(1, scan.nextElement().getCompressedSize());
            }
            long done = 0;
            int files = 0;
            int links = 0;
            for (Enumeration<? extends ZipEntry> entries = zip.entries(); entries.hasMoreElements(); ) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                File target = new File(home, name);
                if (!name.equals(".") && !name.equals("./")) {
                    if (!isInside(home, target)) {
                        App.log("payload: refusing to extract outside root: " + name);
                        continue;
                    }
                    try {
                        if (name.endsWith("/")) {
                            clearLink(target);
                            target.mkdirs();
                        } else {
                            clearLink(target);
                            target.getParentFile().mkdirs();
                            try (InputStream in = zip.getInputStream(entry);
                                 OutputStream out = new FileOutputStream(target)) {
                                copy(in, out, null);
                            }
                            files++;
                        }
                    } catch (IOException error) {
                        App.log("payload: entry " + name + " failed: " + error);
                        throw error;
                    }
                }
                done += Math.max(1, entry.getCompressedSize());
                if (progress != null && (files & 0x1f) == 0) {
                    progress.onProgress(done, total, name);
                }
            }
            App.log("payload extracted: " + files + " files");
        } finally {
            //noinspection ResultOfMethodCallIgnored
            staged.delete();
        }

        applyManifest(ctx, home);

        writeResolvConf(home);
        File marker = new File(home, ".payload-" + App.PAYLOAD_VERSION);
        try (OutputStream out = new FileOutputStream(marker)) {
            out.write(App.PAYLOAD_VERSION.getBytes(StandardCharsets.UTF_8));
        }
    }

    /**
     * Second pass over the extracted tree: set modes and turn the entries the
     * manifest marks as symlinks into real ones. The zip wrote them as small
     * files holding their target path, which is exactly the data needed here.
     */
    private static void applyManifest(Context ctx, File home) throws IOException {
        int links = 0;
        int modes = 0;
        try (InputStream raw = ctx.getAssets().open(MANIFEST);
             java.io.BufferedReader reader = new java.io.BufferedReader(
                     new java.io.InputStreamReader(raw, StandardCharsets.UTF_8), 1 << 16)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) continue;
                String[] parts = line.split("\t", 3);
                if (parts.length < 2) continue;
                int mode;
                try {
                    mode = Integer.parseInt(parts[0], 8);
                } catch (NumberFormatException ignored) {
                    continue;
                }
                File target = new File(home, parts[1]);
                if (!isInside(home, target)) continue;
                if ((mode & S_IFMT) == S_IFLNK) {
                    String link = parts.length > 2 ? parts[2] : null;
                    target.getParentFile().mkdirs();
                    if (target.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        target.delete();
                    }
                    try {
                        Os.symlink(link == null ? "/" : link, target.getAbsolutePath());
                        links++;
                    } catch (ErrnoException error) {
                        App.log("payload: symlink " + parts[1] + " -> " + link + ": " + error);
                    }
                } else {
                    chmod(target, mode);
                    modes++;
                }
            }
        }
        App.log("payload manifest applied: " + links + " symlinks, " + modes + " modes");
    }

    private static long copy(InputStream in, OutputStream out, Progress progress) throws IOException {
        byte[] buffer = new byte[1 << 16];
        long total = 0;
        int read;
        int tick = 0;
        while ((read = in.read(buffer)) > 0) {
            out.write(buffer, 0, read);
            total += read;
            if (progress != null && (++tick & 0x1f) == 0) {
                progress.onProgress(total, 0, null);
            }
        }
        return total;
    }

    private static String readAll(InputStream in) throws IOException {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = stream.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
            return out.toString("UTF-8");
        }
    }

    private static void chmod(File file, int mode) {
        if (mode == 0) return;
        try {
            Os.chmod(file.getAbsolutePath(), mode & 07777);
        } catch (ErrnoException ignored) {
        }
    }

    private static boolean isInside(File root, File child) {
        try {
            String base = root.getCanonicalPath();
            String candidate = child.getCanonicalPath();
            return candidate.equals(base) || candidate.startsWith(base + File.separator);
        } catch (IOException error) {
            return false;
        }
    }

    /**
     * The guest has no DHCP client, so DNS has to be seeded. Public resolvers
     * keep api.deepseek.com reachable even when the carrier resolver is not.
     */
    public static void writeResolvConf(File rootfs) {
        File etc = new File(rootfs, "etc");
        if (!etc.isDirectory() && !etc.mkdirs()) return;
        try (OutputStream out = new FileOutputStream(new File(etc, "resolv.conf"))) {
            out.write(("nameserver 1.1.1.1\n"
                    + "nameserver 8.8.8.8\n"
                    + "nameserver 114.114.114.114\n"
                    + "options timeout:2 attempts:3\n").getBytes(StandardCharsets.UTF_8));
        } catch (IOException error) {
            App.log("resolv.conf: " + error);
        }
        File hosts = new File(etc, "hosts");
        if (!hosts.isFile()) {
            try (OutputStream out = new FileOutputStream(hosts)) {
                out.write(("127.0.0.1\tlocalhost localhost.localdomain\n"
                        + "::1\t\tlocalhost ip6-localhost ip6-loopback\n").getBytes(StandardCharsets.UTF_8));
            } catch (IOException ignored) {
            }
        }
    }

    /**
     * Remove a tree without ever following a symlink.
     *
     * File.isDirectory() resolves links, so an absolute rootfs symlink used to
     * send this walk out of the sandbox and into whatever it pointed at — on
     * Android that is the read-only system partition, and a link pointing at
     * /sdcard would have deleted the user's files. Links are removed as links;
     * only real directories are descended.
     */
    public static void deleteTree(File file) {
        if (file == null) return;
        if (isLink(file)) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            return;
        }
        if (!file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteTree(child);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static boolean isLink(File file) {
        try {
            return java.nio.file.Files.isSymbolicLink(file.toPath());
        } catch (Throwable error) {
            return false;
        }
    }

    /**
     * Drop a pre-existing symlink where a real file or directory must go.
     *
     * Reinstalling a different payload over an old one hits this constantly: a
     * path that used to be a symlink can become a real file, and opening the
     * link for write follows it out of the app's storage entirely (EROFS on
     * Android when it lands on the system partition).
     */
    private static void clearLink(File target) {
        if (isLink(target)) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
        }
    }

    /** Kept for callers that want to read a small staged file. */
    public static byte[] read(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }
}
