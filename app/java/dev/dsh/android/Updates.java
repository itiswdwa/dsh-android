package dev.dsh.android;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Update check, two channels.
 *
 *   app  the shell — a new APK has to be installed
 *   hot  plugins, skills, prompt, guest scripts — applied in place
 *
 * The manifest lives in the repository (update.json, generated at build time), so
 * there is no service to run: publishing a release with two assets is the whole
 * deployment story. Fetched here rather than from the page because the app has
 * no origin restrictions to satisfy and a failure mode the UI can report.
 */
final class Updates {

    static final String MANIFEST =
            "https://raw.githubusercontent.com/itiswdwa/dsh-android/main/update.json";

    private Updates() {
    }

    static JSONObject check(String url) {
        JSONObject answer = new JSONObject();
        try {
            String target = url == null || url.isEmpty() ? MANIFEST : url;
            if (!target.startsWith("https://")) {
                answer.put("ok", false);
                answer.put("error", "只接受 https 地址");
                return answer;
            }
            HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "dsh-android/" + BuildInfo.APP_VERSION);
            int code = connection.getResponseCode();
            if (code != 200) {
                answer.put("ok", false);
                answer.put("error", "HTTP " + code + "（检查网络或代理）");
                return answer;
            }
            String body;
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int read;
                while ((read = in.read(chunk)) > 0) {
                    buffer.write(chunk, 0, read);
                    if (buffer.size() > (1 << 20)) break;
                }
                body = buffer.toString("UTF-8");
            }
            JSONObject manifest = new JSONObject(body);
            answer.put("ok", true);
            answer.put("installedAppVersion", App.appVersion());
            answer.put("installedAppVersionCode", App.appVersionCode());
            answer.put("installedHotVersion", Payload.hotVersion());
            answer.put("packagedHotVersion", Payload.packagedHotVersion());
            answer.put("app", manifest.optJSONObject("app"));
            answer.put("hot", manifest.optJSONObject("hot"));
        } catch (Throwable error) {
            App.log("update check failed: " + error);
            try {
                answer.put("ok", false);
                answer.put("error", String.valueOf(error.getMessage()));
            } catch (Throwable ignored) {
            }
        }
        return answer;
    }
}
