package dev.dsh.android;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Template matching for the accessibility "where" tool.
 *
 * <p>The accessibility tree answers "where is the button labelled 发送" for free,
 * but it cannot see an icon-only button, a canvas, a game, or a WebView that
 * exposes no text. This class looks at the pixels instead: a query bitmap (or a
 * word rendered with the system font) is slid over a screenshot and scored with
 * zero-mean normalized cross-correlation (ZNCC), the same "convolution" a
 * classical template matcher uses.
 *
 * <p>Full-resolution ZNCC over a 3200x2092 screen is far too slow to do blindly,
 * so the search is coarse-to-fine: the screenshot and template are both scaled
 * down by an integer factor, every coarse position is scored, the best few
 * candidates are refined around their full-resolution position, and overlapping
 * hits are removed. The returned coordinates are always full-resolution screen
 * pixels, which is what {@code ui tap} consumes.
 *
 * <p>Threading: everything runs on the calling (bridge) thread. The screen and
 * template arrays are immutable after construction; no Bitmap is touched by the
 * matcher, so the caller can recycle its capture as soon as {@link #screen} has
 * been called.
 */
final class Vision {

    private Vision() {
    }

    /** A match in full-resolution screen pixels. */
    static final class Hit {
        final int x;
        final int y;
        final int w;
        final int h;
        final double score;

        Hit(int x, int y, int w, int h, double score) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.score = score;
        }

        int centerX() {
            return x + w / 2;
        }

        int centerY() {
            return y + h / 2;
        }
    }

    /**
     * A template: grayscale values plus a mask. {@code xs}/{@code ys} are the
     * window-relative coordinates that actually participate in the score, so
     * transparent pixels of a PNG icon do not drag the correlation down.
     */
    static final class Template {
        final int w;
        final int h;
        final float[] gray;
        final float[] alpha;
        final int[] xs;
        final int[] ys;
        final float[] values;
        final int count;
        final double mean;
        final double variance;

        Template(int w, int h, float[] gray, float[] alpha) {
            this.w = Math.max(1, w);
            this.h = Math.max(1, h);
            this.gray = gray;
            this.alpha = alpha;
            int n = 0;
            for (int i = 0; i < alpha.length; i++) {
                if (alpha[i] > 0.05f) n++;
            }
            if (n == 0) n = Math.min(gray.length, alpha.length);
            this.count = n;
            this.xs = new int[n];
            this.ys = new int[n];
            this.values = new float[n];
            double sum = 0;
            double sumSq = 0;
            int at = 0;
            for (int i = 0; i < alpha.length; i++) {
                if (alpha[i] > 0.05f || n == gray.length) {
                    xs[at] = i % this.w;
                    ys[at] = i / this.w;
                    values[at] = gray[i];
                    sum += gray[i];
                    sumSq += (double) gray[i] * gray[i];
                    at++;
                    if (at >= n) break;
                }
            }
            if (at < n) {
                // Degenerate alpha (all zero): fall back to the whole rectangle.
                for (int i = 0; i < n; i++) {
                    xs[i] = i % this.w;
                    ys[i] = i / this.w;
                    values[i] = gray[i];
                    sum += gray[i];
                    sumSq += (double) gray[i] * gray[i];
                }
            }
            this.mean = sum / n;
            this.variance = Math.max(0, sumSq / n - mean * mean);
        }

        /** The same template scaled by a factor, with bilinear sampling. */
        Template scaled(float scale) {
            if (Math.abs(scale - 1f) < 0.001f) return this;
            int nw = Math.max(1, Math.round(w * scale));
            int nh = Math.max(1, Math.round(h * scale));
            float[] nextGray = new float[nw * nh];
            float[] nextAlpha = new float[nw * nh];
            for (int y = 0; y < nh; y++) {
                float sy = (y + 0.5f) / scale - 0.5f;
                for (int x = 0; x < nw; x++) {
                    float sx = (x + 0.5f) / scale - 0.5f;
                    float g = sample(gray, w, h, sx, sy);
                    float a = sample(alpha, w, h, sx, sy);
                    nextGray[y * nw + x] = g;
                    nextAlpha[y * nw + x] = a;
                }
            }
            return new Template(nw, nh, nextGray, nextAlpha);
        }

        /** The same template with its grayscale inverted (light-on-dark text). */
        Template inverted() {
            float[] next = new float[gray.length];
            for (int i = 0; i < gray.length; i++) next[i] = 255f - gray[i];
            return new Template(w, h, next, alpha);
        }
    }

    /**
     * A screenshot converted once to grayscale. The coarse versions are cached
     * by factor: finding several text sizes on the same capture must not
     * re-convert the full screen for every size.
     */
    static final class Screen {
        final int w;
        final int h;
        final float[] gray;
        private final Map<Integer, Coarse> coarse = new HashMap<Integer, Coarse>();

        /** Test seam: a screen that is already grayscale (no Android Bitmap). */
        Screen(int w, int h, float[] gray) {
            this.w = w;
            this.h = h;
            this.gray = gray;
        }

        Screen(Bitmap bitmap) {
            w = bitmap.getWidth();
            h = bitmap.getHeight();
            int[] pixels = new int[w * h];
            bitmap.getPixels(pixels, 0, w, 0, 0, w, h);
            gray = new float[pixels.length];
            for (int i = 0; i < pixels.length; i++) {
                int color = pixels[i];
                gray[i] = 0.299f * ((color >> 16) & 0xFF)
                        + 0.587f * ((color >> 8) & 0xFF)
                        + 0.114f * (color & 0xFF);
            }
        }

        Coarse coarse(int factor) {
            if (factor <= 1) return new Coarse(gray, w, h, 1);
            Coarse hit = coarse.get(factor);
            if (hit != null) return hit;
            int cw = Math.max(1, (w + factor - 1) / factor);
            int ch = Math.max(1, (h + factor - 1) / factor);
            float[] next = new float[cw * ch];
            for (int y = 0; y < ch; y++) {
                float sy = (y + 0.5f) * factor - 0.5f;
                for (int x = 0; x < cw; x++) {
                    float sx = (x + 0.5f) * factor - 0.5f;
                    next[y * cw + x] = sample(gray, w, h, sx, sy);
                }
            }
            Coarse built = new Coarse(next, cw, ch, factor);
            coarse.put(factor, built);
            return built;
        }
    }

    static final class Coarse {
        final float[] gray;
        final int w;
        final int h;
        final int factor;

        Coarse(float[] gray, int w, int h, int factor) {
            this.gray = gray;
            this.w = w;
            this.h = h;
            this.factor = factor;
        }
    }

    // -------------------------------------------------------------- templates

    /** Decode a template from a path the guest can see: /sdcard/... or absolute. */
    static Bitmap load(String path) {
        File file = resolve(path);
        if (file == null || !file.isFile()) {
            throw new IllegalArgumentException("找不到模板图片：" + path
                    + "（沙箱里用 /sdcard/... 路径，图片要真实存在）");
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (bitmap == null) {
            throw new IllegalArgumentException("模板图片解不开：" + path
                    + "（支持 PNG/JPEG/WebP）");
        }
        return bitmap;
    }

    /**
     * Build a template from a bitmap. Opaque images (a cropped screenshot) use
     * every pixel; an icon with transparency uses only the visible pixels, so the
     * transparent margin does not pretend to be black.
     */
    static Template template(Bitmap bitmap) {
        int w = bitmap.getWidth();
        int h = bitmap.getHeight();
        int[] pixels = new int[w * h];
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h);
        boolean anyTransparent = false;
        for (int color : pixels) {
            if (((color >>> 24) & 0xFF) < 250) {
                anyTransparent = true;
                break;
            }
        }
        float[] gray = new float[pixels.length];
        float[] alpha = new float[pixels.length];
        for (int i = 0; i < pixels.length; i++) {
            int color = pixels[i];
            gray[i] = 0.299f * ((color >> 16) & 0xFF)
                    + 0.587f * ((color >> 8) & 0xFF)
                    + 0.114f * (color & 0xFF);
            alpha[i] = anyTransparent ? ((color >>> 24) & 0xFF) / 255f : 1f;
        }
        // Crop transparent margins: a 200x200 PNG with a 30x30 icon in the middle
        // would otherwise search a template 44 times larger than the thing it wants.
        int left = w;
        int top = h;
        int right = -1;
        int bottom = -1;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (alpha[y * w + x] > 0.05f) {
                    if (x < left) left = x;
                    if (x > right) right = x;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                }
            }
        }
        if (right < left || bottom < top) {
            left = 0;
            top = 0;
            right = w - 1;
            bottom = h - 1;
        }
        int cw = right - left + 1;
        int ch = bottom - top + 1;
        float[] cg = new float[cw * ch];
        float[] ca = new float[cw * ch];
        for (int y = 0; y < ch; y++) {
            for (int x = 0; x < cw; x++) {
                cg[y * cw + x] = gray[(top + y) * w + (left + x)];
                ca[y * cw + x] = alpha[(top + y) * w + (left + x)];
            }
        }
        return new Template(cw, ch, cg, ca);
    }

    /**
     * Render a word with the system font. The glyph alpha becomes the template
     * value and the whole rectangle participates, so ZNCC sees "dark glyphs on a
     * flat background" and its mean subtraction handles either polarity. This is
     * a fallback for text that the accessibility tree does not expose; it is
     * inherently font-sensitive and should not replace the tree.
     */
    static List<Template> renderText(String text, float sizePx) {
        List<Template> out = new ArrayList<Template>();
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        paint.setTextSize(sizePx);
        paint.setColor(0xFFFFFFFF);
        Paint.FontMetrics metrics = paint.getFontMetrics();
        float width = paint.measureText(text);
        int w = Math.max(2, (int) Math.ceil(width) + 4);
        int h = Math.max(2, (int) Math.ceil(metrics.descent - metrics.ascent) + 4);
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        try {
            Canvas canvas = new Canvas(bitmap);
            canvas.drawText(text, 2, 2 - metrics.ascent, paint);
            int[] pixels = new int[w * h];
            bitmap.getPixels(pixels, 0, w, 0, 0, w, h);
            int left = w;
            int top = h;
            int right = -1;
            int bottom = -1;
            float[] gray = new float[w * h];
            for (int i = 0; i < pixels.length; i++) {
                gray[i] = (pixels[i] >>> 24) & 0xFF; // glyph coverage, 0..255
                if (gray[i] > 2) {
                    int x = i % w;
                    int y = i / w;
                    if (x < left) left = x;
                    if (x > right) right = x;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                }
            }
            if (right < left || bottom < top) return out;
            int cw = right - left + 1;
            int ch = bottom - top + 1;
            float[] crop = new float[cw * ch];
            float[] all = new float[cw * ch];
            for (int y = 0; y < ch; y++) {
                for (int x = 0; x < cw; x++) {
                    crop[y * cw + x] = gray[(top + y) * w + (left + x)];
                    all[y * cw + x] = 1f;
                }
            }
            Template normal = new Template(cw, ch, crop, all);
            out.add(normal);
            out.add(normal.inverted());
        } finally {
            bitmap.recycle();
        }
        return out;
    }

    // ---------------------------------------------------------------- matching

    /**
     * Find a template in a screen. {@code scales} are template scales to try
     * (1.0 = the template was cropped at this screen's density). Results are
     * full-resolution boxes, ordered by score, with overlapping boxes removed.
     */
    static List<Hit> find(Screen screen, Template template, double threshold, int max, float[] scales) {
        List<Hit> all = new ArrayList<Hit>();
        for (float scale : scales) {
            if (scale <= 0.05f) continue;
            Template scaled = template.scaled(scale);
            if (scaled.w > screen.w || scaled.h > screen.h) continue;
            all.addAll(findOne(screen, scaled, threshold));
        }
        return suppress(all, max);
    }

    /** One template, one scale. */
    private static List<Hit> findOne(Screen screen, Template template, double threshold) {
        int factor = 1;
        while (Math.max(screen.w / (factor + 1), screen.h / (factor + 1)) > 720) factor++;
        // Keep at least a 2x reduction on a big screen: a 12px icon at factor 1
        // means a full 3200x2092 scan for a 12x12 template, which is both slow
        // and unnecessary. The coarse score is refined below in any case.
        while (factor > 2 && Math.min(template.w, template.h) / factor < 10) factor--;
        Coarse coarse = screen.coarse(factor);
        Template scaled = factor == 1 ? template : template.scaled(1f / factor);
        if (scaled.w < 3 || scaled.h < 3) return new ArrayList<Hit>();
        if (scaled.w > coarse.w || scaled.h > coarse.h) return new ArrayList<Hit>();

        // Scan every coarse position: a stride of 2 can step over an icon whose
        // left edge is odd, and the coarse score then misses it entirely. The
        // coarse image is already at most ~720px wide, so this stays cheap.
        int step = 1;
        double loose = Math.max(0.35, threshold - 0.10);
        List<Candidate> candidates = new ArrayList<Candidate>();
        for (int y = 0; y + scaled.h <= coarse.h; y += step) {
            for (int x = 0; x + scaled.w <= coarse.w; x += step) {
                double score = score(coarse.gray, coarse.w, x, y, scaled);
                if (score >= loose) {
                    candidates.add(new Candidate(x, y, score));
                }
            }
        }
        if (candidates.isEmpty()) return new ArrayList<Hit>();
        Collections.sort(candidates, new Comparator<Candidate>() {
            @Override
            public int compare(Candidate a, Candidate b) {
                return Double.compare(b.score, a.score);
            }
        });
        int refine = Math.min(24, candidates.size());
        int radius = factor * step + 2;
        List<Hit> hits = new ArrayList<Hit>();
        for (int i = 0; i < refine; i++) {
            Candidate candidate = candidates.get(i);
            int cx = candidate.x * factor;
            int cy = candidate.y * factor;
            int x0 = Math.max(0, cx - radius);
            int y0 = Math.max(0, cy - radius);
            int x1 = Math.min(screen.w - template.w, cx + radius);
            int y1 = Math.min(screen.h - template.h, cy + radius);
            Hit best = null;
            for (int y = y0; y <= y1; y++) {
                for (int x = x0; x <= x1; x++) {
                    double score = score(screen.gray, screen.w, x, y, template);
                    if (best == null || score > best.score) {
                        best = new Hit(x, y, template.w, template.h, score);
                    }
                }
            }
            if (best != null && best.score >= threshold) hits.add(best);
        }
        Collections.sort(hits, new Comparator<Hit>() {
            @Override
            public int compare(Hit a, Hit b) {
                return Double.compare(b.score, a.score);
            }
        });
        return hits;
    }

    /**
     * Zero-mean normalized cross-correlation of one window. Masked template
     * pixels are the only ones accumulated, so PNG transparency works.
     */
    private static double score(float[] image, int imageWidth, int ox, int oy, Template template) {
        int base = oy * imageWidth + ox;
        double sum = 0;
        double sumSq = 0;
        double dot = 0;
        int n = template.values.length;
        for (int i = 0; i < n; i++) {
            float value = image[base + template.ys[i] * imageWidth + template.xs[i]];
            sum += value;
            sumSq += (double) value * value;
            dot += value * template.values[i];
        }
        if (n < 6) return -1;
        double mean = sum / n;
        double variance = sumSq / n - mean * mean;
        if (variance <= 1e-4 || template.variance <= 1e-6) return -1;
        double numerator = dot / n - mean * template.mean;
        return numerator / Math.sqrt(variance * template.variance);
    }

    /** Remove overlapping boxes, keeping the highest score. */
    static List<Hit> suppress(List<Hit> hits, int max) {
        Collections.sort(hits, new Comparator<Hit>() {
            @Override
            public int compare(Hit a, Hit b) {
                return Double.compare(b.score, a.score);
            }
        });
        List<Hit> kept = new ArrayList<Hit>();
        for (Hit hit : hits) {
            boolean overlaps = false;
            for (Hit other : kept) {
                int min = Math.min(hit.w, hit.h);
                int dx = Math.abs(hit.centerX() - other.centerX());
                int dy = Math.abs(hit.centerY() - other.centerY());
                if (dx < Math.max(4, min * 3 / 4) && dy < Math.max(4, min * 3 / 4)) {
                    overlaps = true;
                    break;
                }
            }
            if (!overlaps) {
                kept.add(hit);
                if (kept.size() >= max) break;
            }
        }
        return kept;
    }

    // ------------------------------------------------------------------ paths

    static File resolve(String path) {
        if (path == null) return null;
        String value = path.trim();
        if (value.startsWith("file://")) value = value.substring("file://".length());
        File shared;
        try {
            shared = App.i().sharedStorage();
        } catch (Throwable error) {
            shared = null;
        }
        if (value.equals("/sdcard") || value.equals("/storage/emulated/0")) {
            return shared;
        }
        if (value.startsWith("/sdcard/")) {
            return new File(shared, value.substring("/sdcard/".length()));
        }
        if (value.startsWith("/storage/emulated/0/")) {
            return new File(value);
        }
        File direct = new File(value);
        if (direct.isAbsolute()) return direct;
        return shared == null ? direct : new File(shared, value);
    }

    /** Bilinear sample with clamp-to-edge; used for both template and screen scaling. */
    private static float sample(float[] source, int w, int h, float x, float y) {
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x > w - 1) x = w - 1;
        if (y > h - 1) y = h - 1;
        int x0 = (int) x;
        int y0 = (int) y;
        int x1 = Math.min(w - 1, x0 + 1);
        int y1 = Math.min(h - 1, y0 + 1);
        float fx = x - x0;
        float fy = y - y0;
        float a = source[y0 * w + x0];
        float b = source[y0 * w + x1];
        float c = source[y1 * w + x0];
        float d = source[y1 * w + x1];
        float top = a + (b - a) * fx;
        float bottom = c + (d - c) * fx;
        return top + (bottom - top) * fy;
    }

    private static final class Candidate {
        final int x;
        final int y;
        final double score;

        Candidate(int x, int y, double score) {
            this.x = x;
            this.y = y;
            this.score = score;
        }
    }
}
