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
                object.put("id", id);
                object.put("host", host);
                object.put("guest", guest);
                object.put("enabled", enabled);
                object.put("exists", new File(host).isDirectory());
            } catch (Throwable ignored) {
            }
            return object;
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

    public static List<Mount> enabled() {
        List<Mount> out = new ArrayList<>();
        for (Mount mount : list()) {
            if (mount.enabled && new File(mount.host).isDirectory()) out.add(mount);
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
