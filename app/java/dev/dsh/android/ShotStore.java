package dev.dsh.android;

import android.graphics.Bitmap;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Saves screenshots to the phone's Download directory.
 *
 * <p>Both the AI screenshot endpoint ({@code /android/screenshot} via
 * {@link AiApi}) and the accessibility "where" tool ({@code /a11y/where}) need
 * the same thing: a dated file name that two concurrent captures cannot
 * collide on, a path the guest can open at {@code /sdcard/...}, and bounded
 * retention so repeated agent calls do not fill the user's storage. Keeping it
 * in one place means those two surfaces cannot drift on the file name or the
 * pruning rule.
 */
final class ShotStore {

    /** Keep only the newest captures per prefix. */
    private static final int MAX_PER_PREFIX = 20;

    /** Disambiguates two captures that finish in the same millisecond. */
    private static final AtomicInteger SEQUENCE = new AtomicInteger();
    private static final Object LOCK = new Object();

    private ShotStore() {
    }

    /** Encode a bitmap as JPEG and save it. Returns a JSON object. */
    static JSONObject saveBitmap(Bitmap bitmap, int quality, String prefix) {
        if (bitmap == null) return failure("没有图像可保存", null);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try {
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, bytes)) {
                return failure("JPEG 编码失败", null);
            }
        } catch (Throwable error) {
            return failure("JPEG 编码失败：" + error, null);
        }
        return saveJpeg(bytes.toByteArray(), bitmap.getWidth(), bitmap.getHeight(), prefix);
    }

    /**
     * Write an already-encoded JPEG. The returned object always carries
     * {@code ok}; failures are JSON, never exceptions, because the caller may be
     * the model-facing bridge.
     */
    static JSONObject saveJpeg(byte[] jpeg, int width, int height, String prefix) {
        if (jpeg == null || jpeg.length == 0) return failure("JPEG 数据为空", null);
        File shared;
        try {
            shared = App.i().sharedStorage();
        } catch (Throwable error) {
            shared = null;
        }
        if (shared == null) {
            return failure("共享存储不可用，无法保存到 Download",
                    "在 设置 → 安卓沙箱 → 权限 里允许存储，并打开共享存储");
        }
        File directory = new File(shared, "Download");
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
            return failure("无法创建共享存储的 Download 目录",
                    "检查应用存储权限，或手动创建 /sdcard/Download");
        }
        File file;
        synchronized (LOCK) {
            long now = System.currentTimeMillis();
            do {
                file = new File(directory, prefix + "-" + now + "-"
                        + SEQUENCE.incrementAndGet() + ".jpg");
            } while (file.exists());
        }
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(file);
            out.write(jpeg);
            out.flush();
        } catch (Throwable error) {
            return failure("写入 Download 失败：" + error, "检查应用存储权限，或换一个共享存储目录");
        } finally {
            if (out != null) {
                try {
                    out.close();
                } catch (Throwable ignored) {
                }
            }
        }
        prune(directory, prefix);
        JSONObject answer = new JSONObject();
        try {
            answer.put("ok", true);
            answer.put("file", "/sdcard/Download/" + file.getName());
            answer.put("bytes", jpeg.length);
            answer.put("width", width);
            answer.put("height", height);
        } catch (Throwable ignored) {
        }
        return answer;
    }

    /**
     * Drop the oldest {@code <prefix>-*.jpg} files beyond {@link #MAX_PER_PREFIX}.
     * Only this app's own captures are touched, and any failure is ignored: the
     * screenshot the caller asked for is already saved.
     */
    private static void prune(File directory, final String prefix) {
        try {
            File[] entries = directory.listFiles();
            if (entries == null) return;
            List<File> shots = new ArrayList<File>();
            String head = prefix + "-";
            for (File entry : entries) {
                if (entry == null || !entry.isFile()) continue;
                String name = entry.getName();
                if (name.startsWith(head) && name.endsWith(".jpg")) shots.add(entry);
            }
            if (shots.size() <= MAX_PER_PREFIX) return;
            Collections.sort(shots, new Comparator<File>() {
                @Override
                public int compare(File left, File right) {
                    long a = left.lastModified();
                    long b = right.lastModified();
                    if (a != b) return a > b ? -1 : 1; // newest first
                    return right.getName().compareTo(left.getName());
                }
            });
            for (int i = MAX_PER_PREFIX; i < shots.size(); i++) {
                try {
                    shots.get(i).delete();
                } catch (Throwable ignored) {
                }
            }
        } catch (Throwable ignored) {
        }
    }

    private static JSONObject failure(String error, String hint) {
        JSONObject answer = new JSONObject();
        try {
            answer.put("ok", false);
            answer.put("error", error);
            if (hint != null && !hint.isEmpty()) answer.put("hint", hint);
        } catch (Throwable ignored) {
        }
        return answer;
    }
}
