package dev.dsh.android;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * User-defined bind mounts: a folder on the phone, a path inside the sandbox.
 *
 * The sandbox already gets /sdcard, but that is one fixed window onto the
 * device. Mounts let the user open a specific folder — a project directory, a
 * synced notes folder, a USB drive — at a stable guest path, so both the agent
 * and the terminal can reach it without copying anything.
 *
 * Entries are stored as a JSON array in preferences. Bind mounts are applied
 * when PRoot starts, so adding one requires a server restart; the UI says so.
 */
public final class Mounts {

    public static final class Mount {
        public final String id;
        public final String host;
        public final String guest;
        public final boolean enabled;

        Mount(String id, String host, String guest, boolean enabled) {
            this.id = id;
            this.host = host;
            this.guest = guest;
            this.enabled = enabled;
        }

        public JSONObject toJson() {
            JSONObject object = new JSONObject();
            try {
                File source = new File(host);
                object.put("id", id);
                object.put("host", host);
                object.put("guest", guest);
                object.put("enabled", enabled);
                object.put("exists", source.isDirectory());
                object.put("readable", source.isDirectory() && source.canRead());
                object.put("problem", problem());
            } catch (Throwable ignored) {
            }
            return object;
        }

        /**
         * Why this mount will not show anything, in the user's terms.
         *
         * Silence was the original bug here: a path the app cannot stat was
         * dropped from the PRoot command line, and the guest simply showed an
         * empty directory with nothing anywhere to explain it.
         */
        public String problem() {
            File source = new File(host);
            if (!source.isDirectory()) {
                return "路径不存在或不可访问（可能没授予存储权限）";
            }
            if (!source.canRead()) {
                return "应用没有读取权限";
            }
            if (host.contains("/Android/data/") || host.contains("/Android/obb/")) {
                return "Android 11+ 不允许应用访问 Android/data 与 Android/obb";
            }
            if (host.startsWith("/storage/") && !host.startsWith("/storage/emulated/0")
                    && !host.startsWith("/storage/self/")) {
                return "可移动存储（SD 卡/U 盘）需要额外授权，建议先拷到内部存储";
            }
            return "";
        }
    }

    private static final String KEY = "mounts";

    private Mounts() {
    }

    public static List<Mount> list() {
        List<Mount> out = new ArrayList<>();
        String raw = App.i().prefs.getString(KEY, "[]");
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);
                out.add(new Mount(item.optString("id", "m" + i),
                        item.optString("host", ""),
                        item.optString("guest", ""),
                        item.optBoolean("enabled", true)));
            }
        } catch (Throwable error) {
            App.log("mounts: unreadable list, starting empty: " + error);
        }
        return out;
    }

    private static void save(List<Mount> mounts) {
        JSONArray array = new JSONArray();
        for (Mount mount : mounts) {
            JSONObject item = new JSONObject();
            try {
                item.put("id", mount.id);
                item.put("host", mount.host);
                item.put("guest", mount.guest);
                item.put("enabled", mount.enabled);
            } catch (Throwable ignored) {
            }
            array.put(item);
        }
        SharedPreferences.Editor editor = App.i().prefs.edit();
        editor.putString(KEY, array.toString());
        editor.apply();
    }

    /** Path inside the guest that a host folder gets by default. */
    public static String defaultGuestPath(String host) {
        String name = new File(host).getName();
        if (name.isEmpty()) name = "mount";
        StringBuilder safe = new StringBuilder();
        for (char c : name.toCharArray()) {
            safe.append(Character.isLetterOrDigit(c) || c == '.' || c == '_' || c == '-' ? c : '_');
        }
        return "/mnt/" + safe;
    }

    public static synchronized Mount add(String host, String guest) {
        List<Mount> mounts = list();
        String cleanHost = host == null ? "" : host.trim();
        if (cleanHost.isEmpty()) return null;
        // Same folder twice is almost always a mistake, not a request.
        for (Mount existing : mounts) {
            if (existing.host.equals(cleanHost)) return existing;
        }
        String cleanGuest = guest == null || guest.trim().isEmpty()
                ? defaultGuestPath(cleanHost)
                : guest.trim();
        Mount mount = new Mount("m" + System.currentTimeMillis(), cleanHost, cleanGuest, true);
        mounts.add(mount);
        save(mounts);
        App.log("mount added: " + cleanHost + " -> " + cleanGuest);
        return mount;
    }

    public static synchronized void remove(String id) {
        List<Mount> mounts = list();
        List<Mount> kept = new ArrayList<>();
        for (Mount mount : mounts) {
            if (!mount.id.equals(id)) kept.add(mount);
        }
        save(kept);
    }

    public static synchronized void setEnabled(String id, boolean enabled) {
        List<Mount> mounts = list();
        List<Mount> updated = new ArrayList<>();
        for (Mount mount : mounts) {
            updated.add(mount.id.equals(id)
                    ? new Mount(mount.id, mount.host, mount.guest, enabled)
                    : mount);
        }
        save(updated);
    }

    public static synchronized void setGuestPath(String id, String guest) {
        List<Mount> mounts = list();
        List<Mount> updated = new ArrayList<>();
        for (Mount mount : mounts) {
            updated.add(mount.id.equals(id)
                    ? new Mount(mount.id, mount.host, guest == null || guest.trim().isEmpty()
                    ? mount.guest : guest.trim(), mount.enabled)
                    : mount);
        }
        save(updated);
    }

    /**
     * Every enabled mount, readable or not.
     *
     * Readability is deliberately not a filter: PRoot binds by path, and a bind
     * that yields an empty directory is a diagnosable state (the UI shows the
     * reason and the terminal can be asked), whereas a silently dropped bind
     * looks like the feature is broken.
     */
    public static List<Mount> enabled() {
        List<Mount> out = new ArrayList<>();
        for (Mount mount : list()) {
            if (mount.enabled) out.add(mount);
        }
        return out;
    }

    /**
     * Create each bind target inside the rootfs before PRoot starts.
     *
     * PRoot binds over an existing path, so a guest path that does not exist yet
     * would make the whole invocation fail — and the failure would look like a
     * mount problem rather than a missing directory.
     */
    public static void ensureGuestDirs(File rootfs) {
        for (Mount mount : enabled()) {
            String guest = mount.guest == null ? "" : mount.guest;
            if (!guest.startsWith("/") || guest.contains("..")) {
                App.log("mounts: ignoring unsafe guest path " + guest);
                continue;
            }
            File target = new File(rootfs, guest.substring(1));
            if (!target.isDirectory() && !target.mkdirs() && !target.isDirectory()) {
                App.log("mounts: cannot create " + target);
            }
        }
    }
}
