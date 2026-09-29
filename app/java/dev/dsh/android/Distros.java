package dev.dsh.android;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Registry of installed PRoot distributions.
 *
 * The bundled Ubuntu (id {@link App#BUNDLED_ID}) is created by the payload;
 * everything else arrives through the import flow. Per-distro start commands
 * live in SharedPreferences, because the rootfs itself belongs to the distro.
 */
public final class Distros {

    public static final class Distro {
        public final String id;
        public final String name;
        public final File root;
        public final boolean bundled;
        public String command;

        Distro(String id, String name, File root, boolean bundled, String command) {
            this.id = id;
            this.name = name;
            this.root = root;
            this.bundled = bundled;
            this.command = command;
        }

        public boolean isUsable() {
            return new File(root, "bin/sh").exists() || new File(root, "usr/bin/env").exists();
        }
    }

    private Distros() {
    }

    public static List<Distro> list(Context ctx) {
        App app = App.i();
        SharedPreferences prefs = app.prefs;
        List<Distro> out = new ArrayList<>();
        File bundled = app.bundledHome();
        out.add(new Distro(App.BUNDLED_ID,
                prefs.getString("name." + App.BUNDLED_ID, "Ubuntu + Node + dsh（内置）"),
                bundled,
                true,
                prefs.getString("cmd." + App.BUNDLED_ID, Proot.bundledCommand(app.port()))));

        File[] children = app.distrosDir.listFiles();
        if (children != null) {
            Set<String> seen = new LinkedHashSet<>();
            List<File> sorted = new ArrayList<>();
            for (File child : children) {
                if (child.isDirectory() && !child.getName().equals(App.BUNDLED_ID) && seen.add(child.getName())) {
                    sorted.add(child);
                }
            }
            sorted.sort((a, b) -> a.getName().compareToIgnoreCase(b.getName()));
            for (File child : sorted) {
                String id = child.getName();
                out.add(new Distro(id,
                        prefs.getString("name." + id, id),
                        child,
                        false,
                        prefs.getString("cmd." + id, defaultCommandFor(child))));
            }
        }
        return out;
    }

    public static Distro active(Context ctx) {
        String id = App.i().activeDistroId();
        for (Distro distro : list(ctx)) {
            if (distro.id.equals(id)) return distro;
        }
        return list(ctx).get(0);
    }

    /** Pick something plausible for an unknown rootfs. */
    private static String defaultCommandFor(File root) {
        if (new File(root, "opt/dsh/node_modules/@deepseek-ai/dsh").isDirectory()) {
            return Proot.bundledCommand(App.i().port());
        }
        if (new File(root, "bin/bash").exists()) return "exec /bin/bash -l";
        return "exec /bin/sh -l";
    }

    public static void setCommand(String id, String command) {
        App.i().prefs.edit().putString("cmd." + id, command).apply();
    }

    public static void setName(String id, String name) {
        App.i().prefs.edit().putString("name." + id, name).apply();
    }

    public static String sanitizeId(String raw) {
        String id = raw == null ? "" : raw.trim().toLowerCase();
        id = id.replaceAll("[^a-z0-9._-]+", "-").replaceAll("^-+|-+$", "");
        if (id.isEmpty()) id = "rootfs";
        if (id.equals(App.BUNDLED_ID)) id = id + "-1";
        return id;
    }

    /**
     * Import {@code archive} as a new distro; returns its id.
     *
     * The extraction runs inside the bundled guest with the guest's own tar,
     * bound over the staging dir: tar is that environment's business, its
     * reader is the one every PRoot distribution image is built for, and
     * proot's --link2symlink turns the archive's hardlinks into something a
     * guest filesystem can actually represent.
     */
    public static String importRootfs(Context ctx, File archive, String rawName) throws Exception {
        String id = sanitizeId(rawName);
        int suffix = 2;
        while (new File(App.i().distrosDir, id).exists()) {
            id = sanitizeId(rawName) + "-" + suffix++;
        }
        File target = new File(App.i().distrosDir, id);
        if (!target.mkdirs() && !target.isDirectory()) {
            throw new IOException("cannot create " + target);
        }

        String command = "tar " + tarFlags(archive.getName()) + " /_dsh-import/archive -C /_dsh-import/target";
        Proot.Result result = Proot.exec(ctx,
                Arrays.asList(archive.getAbsolutePath() + ":/_dsh-import/archive",
                        target.getAbsolutePath() + ":/_dsh-import/target"),
                command, 30 * 60 * 1000L);
        if (result.exitCode != 0) {
            Payload.deleteTree(target);
            throw new IOException("解包失败: " + result.describe());
        }
        Payload.writeResolvConf(target);
        String name = rawName == null || rawName.trim().isEmpty() ? id : rawName.trim();
        setName(id, name);
        setCommand(id, defaultCommandFor(target));
        App.log("imported distro " + id + " from " + archive);
        return id;
    }

    /** Compression the guest's tar can decode, chosen from the file name. */
    private static String tarFlags(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "xzf";
        if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) return "xJf";
        if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2")) return "xjf";
        if (lower.endsWith(".tar.zst")) return "xaf";   // let tar sniff it; zstd needs its own tool
        return "xaf";                                    // plain tar, or let tar sniff it
    }

    public static void remove(String id) {
        if (id.equals(App.BUNDLED_ID)) return;
        Payload.deleteTree(new File(App.i().distrosDir, id));
        App.i().prefs.edit().remove("cmd." + id).remove("name." + id).apply();
    }
}
