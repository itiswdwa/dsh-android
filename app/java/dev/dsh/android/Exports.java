package dev.dsh.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * Move a file out of the sandbox onto the phone.
 *
 * The sandbox is a closed world: the user reads a report in the Web UI and then
 * has to retype or copy it somewhere. Export copies the file into the phone's
 * shared storage (/sdcard/Download) so it can be opened, shared, or handed to
 * another app — the one direction the guest cannot be trusted to get right on
 * its own terms, because /sdcard only exists when the user granted access.
 *
 * The copy runs *inside* the guest, so any guest path works: the harness home,
 * the workspace, a mounted folder, a bind-mounted /sdcard.
 */
public final class Exports {

    /** Files offered for one-tap export, newest first. */
    private static final int RECENT_LIMIT = 25;

    private Exports() {
    }

    private static String quote(String value) {
        return "'" + value.replace("'", "'\\''") + "'";
    }

    /** Export one path (absolute, or relative to the workspace/home) into Download. */
    public static JSONObject run(String path) {
        JSONObject answer = new JSONObject();
        String clean = path == null ? "" : path.trim();
        if (clean.isEmpty()) {
            return fail(answer, "路径为空");
        }
        String script = String.join("\n",
                "set -e",
                "src=" + quote(clean),
                // A relative path is what the document preview shows (it is shown
                // relative to the workspace), so resolve it against the usual roots
                // before giving up.
                "if [ ! -e \"$src\" ]; then",
                "  src=$(find /root /home /workspace /mnt -maxdepth 6 -path \"*/$src\" 2>/dev/null | head -1)",
                "fi",
                "[ -n \"$src\" ] && [ -e \"$src\" ] || { echo '找不到文件: " + clean.replace("'", "") + "' >&2; exit 2; }",
                "dest=/sdcard/Download",
                "[ -d \"$dest\" ] || { echo '手机存储不可用：请在 DSH 应用里授予存储权限后重启服务' >&2; exit 3; }",
                "cp -a \"$src\" \"$dest/\"",
                "basename \"$src\"");
        try {
            Proot.Result result = Proot.exec(App.i(), java.util.Collections.emptyList(), script, 120000);
            if (result.exitCode != 0) {
                return fail(answer, result.stderr.trim().isEmpty()
                        ? ("导出失败 (exit " + result.exitCode + ")") : result.stderr.trim());
            }
            String name = result.stdout.trim();
            answer.put("ok", true);
            answer.put("name", name);
            answer.put("message", "已导出到手机的 Download/" + name);
        } catch (Throwable error) {
            return fail(answer, String.valueOf(error.getMessage()));
        }
        return answer;
    }

    /**
     * Candidate files for one-tap export: recent documents under the harness home.
     *
     * The user's own workflow produces reports in the workspace, and hunting for
     * the path by hand is the very thing this feature exists to avoid.
     */
    public static JSONObject recent() {
        JSONObject answer = new JSONObject();
        JSONArray files = new JSONArray();
        String script = String.join("\n",
                "find /root -maxdepth 4 -type f "
                        + "\\( -name '*.md' -o -name '*.txt' -o -name '*.json' -o -name '*.csv' "
                        + "-o -name '*.log' -o -name '*.html' -o -name '*.png' \\) "
                        + "-printf '%T@\\t%s\\t%p\\n' 2>/dev/null | sort -rn | head -" + RECENT_LIMIT);
        try {
            Proot.Result result = Proot.exec(App.i(), java.util.Collections.emptyList(), script, 60000);
            for (String line : result.stdout.split("\n")) {
                String[] parts = line.split("\t", 3);
                if (parts.length < 3) continue;
                try {
                    JSONObject file = new JSONObject();
                    file.put("path", parts[2]);
                    file.put("bytes", Long.parseLong(parts[1].trim()));
                    file.put("modified", (long) (Double.parseDouble(parts[0].trim()) * 1000));
                    files.put(file);
                } catch (Throwable ignored) {
                }
            }
            answer.put("ok", true);
            answer.put("files", files);
        } catch (Throwable error) {
            return fail(answer, String.valueOf(error.getMessage()));
        }
        return answer;
    }

    private static JSONObject fail(JSONObject answer, String message) {
        try {
            answer.put("ok", false);
            answer.put("error", message);
        } catch (Throwable ignored) {
        }
        return answer;
    }

    /** Convenience for the native console: list the guest's recent documents. */
    public static List<String> recentPaths() {
        JSONObject snapshot = recent();
        JSONArray files = snapshot.optJSONArray("files");
        java.util.List<String> paths = new java.util.ArrayList<>();
        if (files == null) return paths;
        for (int i = 0; i < files.length(); i++) {
            JSONObject file = files.optJSONObject(i);
            if (file != null) paths.add(file.optString("path", ""));
        }
        return paths;
    }
}
