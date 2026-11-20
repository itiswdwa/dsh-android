/*
 * uitext — find a string on a screenshot by rendering it and correlating pixels.
 *
 * This is the engine behind `ui where "文字"`: the caller passes a screenshot and
 * the characters to look for, and gets back every place they appear in screen
 * pixels. Nothing here consults the accessibility tree — the answer comes from
 * the image itself, so it also finds text inside a canvas, a game, a video frame
 * or a WebView that exposes no nodes.
 *
 * How the search stays fast enough to sit in front of a tap:
 *   1. the screenshot is box-filtered down by four and integral tables are built
 *      once, so the energy of any window is a handful of lookups;
 *   2. every candidate font size is rasterized with FreeType from the same Noto
 *      Sans CJK the Android UI uses, and scored over that small image with a
 *      zero-mean normalized cross-correlation, stepping two pixels. The template
 *      is its whole rectangle (the background is part of the pattern) and only
 *      the painted pixels enter the dot product;
 *   3. the best few positions per size are rescored at full resolution around
 *      their coarse location, trying the neighbouring pixel sizes, which is what
 *      makes a 39px render still land on a 40px label;
 *   4. duplicates are removed and the rest are returned in reading order.
 *
 * Build: sh scripts/build_uitext.sh  (needs libfreetype-dev, libjpeg-dev)
 */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <ft2build.h>
#include FT_FREETYPE_H
#include <jpeglib.h>

#define COARSE 4
#define COARSE_STEP 2
#define CANDIDATES 160
#define PER_SIZE 6
#define MAX_HITS 12
#define REFINE_RADIUS 10

static const char *FONT_CANDIDATES[] = {
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/system/fonts/NotoSansCJK-Regular.ttc",
    NULL,
};

/* ------------------------------------------------------------------ image */

typedef struct {
    int w, h;
    unsigned char *gray;
} Image;

static int load_image(const char *path, Image *out) {
    FILE *file = fopen(path, "rb");
    if (!file) return -1;
    struct jpeg_decompress_struct info;
    struct jpeg_error_mgr error;
    info.err = jpeg_std_error(&error);
    jpeg_create_decompress(&info);
    jpeg_stdio_src(&info, file);
    if (jpeg_read_header(&info, TRUE) != JPEG_HEADER_OK) {
        jpeg_destroy_decompress(&info);
        fclose(file);
        return -1;
    }
    info.out_color_space = JCS_GRAYSCALE;
    jpeg_start_decompress(&info);
    int w = (int)info.output_width;
    int h = (int)info.output_height;
    unsigned char *gray = malloc((size_t)w * h);
    if (!gray) {
        jpeg_destroy_decompress(&info);
        fclose(file);
        return -1;
    }
    while (info.output_scanline < info.output_height) {
        unsigned char *row = gray + (size_t)info.output_scanline * w;
        jpeg_read_scanlines(&info, &row, 1);
    }
    jpeg_finish_decompress(&info);
    jpeg_destroy_decompress(&info);
    fclose(file);
    out->w = w;
    out->h = h;
    out->gray = gray;
    return 0;
}

/** Box-filter to a float image and build its sum and sum-of-squares tables. */
static float *downsample(const Image *image, int factor, int *outW, int *outH,
        double **outSum, double **outSumSq) {
    int w = image->w / factor;
    int h = image->h / factor;
    float *small = malloc(sizeof(float) * w * h);
    double *sums = calloc((size_t)(w + 1) * (h + 1), sizeof(double));
    double *squares = calloc((size_t)(w + 1) * (h + 1), sizeof(double));
    if (!small || !sums || !squares) { free(small); free(sums); free(squares); return NULL; }
    for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
            int total = 0;
            for (int dy = 0; dy < factor; dy++) {
                const unsigned char *row = image->gray + (size_t)(y * factor + dy) * image->w;
                for (int dx = 0; dx < factor; dx++) total += row[x * factor + dx];
            }
            float value = (float)total / (factor * factor);
            small[(size_t)y * w + x] = value;
            size_t at = (size_t)(y + 1) * (w + 1) + (x + 1);
            sums[at] = value + sums[at - 1] + sums[at - (w + 1)] - sums[at - (w + 2)];
            squares[at] = (double)value * value + squares[at - 1]
                + squares[at - (w + 1)] - squares[at - (w + 2)];
        }
    }
    *outW = w;
    *outH = h;
    *outSum = sums;
    *outSumSq = squares;
    return small;
}

/* ------------------------------------------------------------------- font */

typedef struct {
    FT_Library library;
    FT_Face face;
} Font;

static int font_open(Font *font) {
    if (FT_Init_FreeType(&font->library)) return -1;
    const char *env = getenv("UI_TEXT_FONT");
    if (env && *env && FT_New_Face(font->library, env, 0, &font->face) == 0) return 0;
    for (int i = 0; FONT_CANDIDATES[i]; i++) {
        /* The Noto CJK collection carries one face per language; index 2 is the
         * Simplified Chinese face, which is what Android picks for zh-CN. */
        int index = strstr(FONT_CANDIDATES[i], "NotoSansCJK") ? 2 : 0;
        if (FT_New_Face(font->library, FONT_CANDIDATES[i], index, &font->face) == 0) return 0;
        if (index != 0 && FT_New_Face(font->library, FONT_CANDIDATES[i], 0, &font->face) == 0) return 0;
    }
    return -1;
}

/** Decode one UTF-8 codepoint; malformed input becomes U+FFFD. */
static unsigned utf8_next(const char **at) {
    const unsigned char *s = (const unsigned char *)*at;
    unsigned cp;
    int extra;
    if (s[0] < 0x80) { cp = s[0]; extra = 0; }
    else if ((s[0] & 0xE0) == 0xC0) { cp = s[0] & 0x1F; extra = 1; }
    else if ((s[0] & 0xF0) == 0xE0) { cp = s[0] & 0x0F; extra = 2; }
    else if ((s[0] & 0xF8) == 0xF0) { cp = s[0] & 0x07; extra = 3; }
    else { *at += 1; return 0xFFFD; }
    for (int i = 1; i <= extra; i++) {
        if ((s[i] & 0xC0) != 0x80) { *at += i; return 0xFFFD; }
        cp = (cp << 6) | (s[i] & 0x3F);
    }
    *at += extra + 1;
    return cp;
}

typedef struct {
    int w, h;
    float *alpha;
} Glyphs;

static int render_text(Font *font, const char *text, float size, Glyphs *out) {
    if (FT_Set_Pixel_Sizes(font->face, 0, (FT_UInt)lroundf(size))) return -1;
    int pen = 0, top = 0, bottom = 0;
    const char *at = text;
    while (*at) {
        unsigned cp = utf8_next(&at);
        if (FT_Load_Char(font->face, cp, FT_LOAD_RENDER | FT_LOAD_TARGET_NORMAL)) continue;
        FT_GlyphSlot g = font->face->glyph;
        int y0 = -g->bitmap_top;
        int y1 = y0 + (int)g->bitmap.rows;
        if (y0 < top) top = y0;
        if (y1 > bottom) bottom = y1;
        pen += (int)g->advance.x >> 6;
    }
    if (pen <= 0 || bottom <= top) return -1;
    int w = pen + 6;
    int h = bottom - top + 6;
    float *alpha = calloc((size_t)w * h, sizeof(float));
    if (!alpha) return -1;
    int x = 3, base = 3 - top;
    at = text;
    while (*at) {
        unsigned cp = utf8_next(&at);
        if (FT_Load_Char(font->face, cp, FT_LOAD_RENDER | FT_LOAD_TARGET_NORMAL)) continue;
        FT_GlyphSlot g = font->face->glyph;
        int ox = x + g->bitmap_left;
        int oy = base - g->bitmap_top;
        for (unsigned row = 0; row < g->bitmap.rows; row++) {
            int py = oy + (int)row;
            if (py < 0 || py >= h) continue;
            const unsigned char *src = g->bitmap.buffer + (size_t)row * g->bitmap.pitch;
            for (unsigned col = 0; col < g->bitmap.width; col++) {
                int px = ox + (int)col;
                if (px < 0 || px >= w) continue;
                float value = src[col] / 255.0f;
                float *slot = &alpha[(size_t)py * w + px];
                if (value > *slot) *slot = value;
            }
        }
        x += (int)g->advance.x >> 6;
    }
    out->w = w;
    out->h = h;
    out->alpha = alpha;
    return 0;
}

typedef struct {
    int *gx, *gy;
    float *gv;
    int count;
    int w, h;
    double mean, variance;
} Template;

/** Whole-rectangle statistics plus the sparse painted pixels. */
static int build_template(const Glyphs *glyphs, Template *out) {
    size_t n = (size_t)glyphs->w * glyphs->h;
    int *xs = malloc(sizeof(int) * n);
    int *ys = malloc(sizeof(int) * n);
    float *vs = malloc(sizeof(float) * n);
    if (!xs || !ys || !vs) { free(xs); free(ys); free(vs); return -1; }
    int count = 0;
    double sum = 0, sumSq = 0;
    for (int y = 0; y < glyphs->h; y++) {
        for (int x = 0; x < glyphs->w; x++) {
            float value = glyphs->alpha[(size_t)y * glyphs->w + x];
            if (value <= 0.0f) continue;
            xs[count] = x;
            ys[count] = y;
            vs[count] = value;
            count++;
            sum += value;
            sumSq += (double)value * value;
        }
    }
    out->gx = xs; out->gy = ys; out->gv = vs; out->count = count;
    out->w = glyphs->w; out->h = glyphs->h;
    out->mean = sum / n;
    out->variance = sumSq / n - out->mean * out->mean;
    return 0;
}

static void free_template(Template *tpl) {
    free(tpl->gx); free(tpl->gy); free(tpl->gv);
}

/** Scale a glyph bitmap down by an integer factor for the coarse pass. */
static Glyphs reduce_glyphs(const Glyphs *src, int factor) {
    Glyphs out;
    out.w = src->w / factor;
    out.h = src->h / factor;
    if (out.w < 3) out.w = 3;
    if (out.h < 3) out.h = 3;
    out.alpha = calloc((size_t)out.w * out.h, sizeof(float));
    for (int y = 0; y < out.h; y++) {
        for (int x = 0; x < out.w; x++) {
            float sum = 0;
            int n = 0;
            for (int dy = 0; dy < factor; dy++) {
                for (int dx = 0; dx < factor; dx++) {
                    int sx = x * factor + dx;
                    int sy = y * factor + dy;
                    if (sx >= src->w || sy >= src->h) continue;
                    sum += src->alpha[(size_t)sy * src->w + sx];
                    n++;
                }
            }
            out.alpha[(size_t)y * out.w + x] = n ? sum / n : 0;
        }
    }
    return out;
}

static void free_glyphs(Glyphs *glyphs) {
    free(glyphs->alpha);
    glyphs->alpha = NULL;
}

/* -------------------------------------------------------------- matching */

typedef struct {
    double score;
    int x, y, w, h;
    float size;
} Hit;

static int cmp_hit(const void *a, const void *b) {
    const Hit *x = a, *y = b;
    if (y->score > x->score) return 1;
    if (y->score < x->score) return -1;
    return 0;
}

static double rect_sum(const double *table, int stride, int x, int y, int w, int h) {
    return table[(size_t)(y + h) * stride + x + w]
         - table[(size_t)y * stride + x + w]
         - table[(size_t)(y + h) * stride + x]
         + table[(size_t)y * stride + x];
}

/** Score one position on the reduced image, using its integral tables. */
static double score_coarse(const float *image, int stride, const double *sums,
        const double *squares, int sumsStride, int ox, int oy, const Template *tpl) {
    double n = (double)tpl->w * tpl->h;
    double sum = rect_sum(sums, sumsStride, ox, oy, tpl->w, tpl->h);
    double sumSq = rect_sum(squares, sumsStride, ox, oy, tpl->w, tpl->h);
    double mean = sum / n;
    double var = sumSq / n - mean * mean;
    if (var <= 1e-6 || tpl->variance <= 1e-9) return 0;
    double dot = 0;
    const float *base = image + (size_t)oy * stride + ox;
    for (int i = 0; i < tpl->count; i++)
        dot += base[(size_t)tpl->gy[i] * stride + tpl->gx[i]] * tpl->gv[i];
    double cov = dot / n - mean * tpl->mean;
    double bounded = fabs(cov / sqrt(var * tpl->variance));
    return bounded;
}

int main(int argc, char **argv) {
    const char *screenPath = NULL;
    const char *text = NULL;
    double minScore = 0.62;
    int maxHits = MAX_HITS;
    int minSize = 20, maxSize = 84;

    for (int i = 1; i < argc; i++) {
        const char *a = argv[i];
        if (!strcmp(a, "--screen") && i + 1 < argc) screenPath = argv[++i];
        else if (!strcmp(a, "--text") && i + 1 < argc) text = argv[++i];
        else if (!strcmp(a, "--min-score") && i + 1 < argc) minScore = atof(argv[++i]);
        else if (!strcmp(a, "--max") && i + 1 < argc) maxHits = atoi(argv[++i]);
        else if (!strcmp(a, "--min-size") && i + 1 < argc) minSize = atoi(argv[++i]);
        else if (!strcmp(a, "--max-size") && i + 1 < argc) maxSize = atoi(argv[++i]);
        else if (!strncmp(a, "--", 2)) { }
        else if (!screenPath) screenPath = a;
        else if (!text) text = a;
    }
    if (!screenPath || !text || !*text) {
        fprintf(stderr, "usage: uitext --screen shot.jpg --text \"文字\" [--min-score 0.62]\n");
        return 2;
    }
    if (maxHits < 1) maxHits = 1;
    if (maxHits > 50) maxHits = 50;

    Image image;
    if (load_image(screenPath, &image)) {
        fprintf(stderr, "uitext: cannot read image %s\n", screenPath);
        return 2;
    }
    Font font;
    if (font_open(&font)) {
        fprintf(stderr, "uitext: no usable CJK font\n");
        return 2;
    }
    int cw = 0, ch = 0;
    double *sums = NULL, *squares = NULL;
    float *coarse = downsample(&image, COARSE, &cw, &ch, &sums, &squares);
    if (!coarse) {
        fprintf(stderr, "uitext: out of memory\n");
        return 2;
    }

    Hit *cand = malloc(sizeof(Hit) * CANDIDATES);
    int ncand = 0;
    for (float size = (float)minSize; size <= (float)maxSize; size += 2.0f) {
        Glyphs glyphs;
        if (render_text(&font, text, size, &glyphs)) continue;
        Glyphs small = reduce_glyphs(&glyphs, COARSE);
        Template tpl = {0};
        if (build_template(&small, &tpl) == 0) {
            Hit best[PER_SIZE];
            int nbest = 0;
            for (int y = 0; y + tpl.h <= ch; y += COARSE_STEP) {
                for (int x = 0; x + tpl.w <= cw; x += COARSE_STEP) {
                    double score = score_coarse(coarse, cw, sums, squares, cw + 1, x, y, &tpl);
                    if (score < 0.34) continue;
                    if (nbest < PER_SIZE) {
                        best[nbest++] = (Hit){score, x * COARSE, y * COARSE,
                                tpl.w * COARSE, tpl.h * COARSE, size};
                    } else {
                        int worst = 0;
                        for (int k = 1; k < nbest; k++)
                            if (best[k].score < best[worst].score) worst = k;
                        if (best[worst].score < score)
                            best[worst] = (Hit){score, x * COARSE, y * COARSE,
                                    tpl.w * COARSE, tpl.h * COARSE, size};
                    }
                }
            }
            qsort(best, nbest, sizeof(Hit), cmp_hit);
            for (int k = 0; k < nbest && ncand < CANDIDATES; k++) cand[ncand++] = best[k];
        }
        free_template(&tpl);
        free_glyphs(&small);
        free_glyphs(&glyphs);
    }
    free(coarse);
    free(sums);
    free(squares);

    /* Fine pass: full resolution, one integral image per candidate window, and
     * the neighbouring sizes tried so a 39px render still scores a 40px label. */
    size_t maxFine = (size_t)CANDIDATES * 40;
    Hit *fine = malloc(sizeof(Hit) * maxFine);
    int nfine = 0;
    for (int i = 0; i < ncand; i++) {
        Hit base = cand[i];
        for (int delta = -2; delta <= 2; delta++) {
            float size = base.size + delta;
            if (size < 8) continue;
            Glyphs glyphs;
            if (render_text(&font, text, size, &glyphs)) continue;
            if (glyphs.w >= image.w || glyphs.h >= image.h) { free_glyphs(&glyphs); continue; }
            int x0 = base.x - REFINE_RADIUS;
            int y0 = base.y - REFINE_RADIUS;
            if (x0 < 0) x0 = 0;
            if (y0 < 0) y0 = 0;
            int x1 = base.x + REFINE_RADIUS;
            int y1 = base.y + REFINE_RADIUS;
            if (x1 + glyphs.w >= image.w) x1 = image.w - glyphs.w - 1;
            if (y1 + glyphs.h >= image.h) y1 = image.h - glyphs.h - 1;
            if (x1 < x0 || y1 < y0) { free_glyphs(&glyphs); continue; }

            int rw = (x1 + glyphs.w) - x0 + 1;
            int rh = (y1 + glyphs.h) - y0 + 1;
            int ls = rw + 1; /* integral tables carry a zero row and column */
            double *localSum = calloc((size_t)ls * (rh + 1), sizeof(double));
            double *localSq = calloc((size_t)ls * (rh + 1), sizeof(double));
            if (!localSum || !localSq) {
                free(localSum); free(localSq); free_glyphs(&glyphs); continue;
            }
            for (int y = 0; y < rh; y++) {
                for (int x = 0; x < rw; x++) {
                    int px = x0 + x, py = y0 + y;
                    double value = (px < image.w && py < image.h)
                        ? image.gray[(size_t)py * image.w + px] : 0;
                    size_t at = (size_t)(y + 1) * ls + (x + 1);
                    localSum[at] = value + localSum[at - 1] + localSum[at - ls]
                        - localSum[at - ls - 1];
                    localSq[at] = value * value + localSq[at - 1] + localSq[at - ls]
                        - localSq[at - ls - 1];
                }
            }

            size_t glyphCells = (size_t)glyphs.w * glyphs.h;
            int *gx = malloc(sizeof(int) * glyphCells);
            int *gy = malloc(sizeof(int) * glyphCells);
            float *gv = malloc(sizeof(float) * glyphCells);
            int count = 0;
            double sum = 0, sumSq = 0;
            for (int y = 0; y < glyphs.h; y++) {
                for (int x = 0; x < glyphs.w; x++) {
                    float value = glyphs.alpha[(size_t)y * glyphs.w + x];
                    if (value <= 0.0f) continue;
                    gx[count] = x; gy[count] = y; gv[count] = value;
                    count++;
                    sum += value;
                    sumSq += (double)value * value;
                }
            }
            double nPixels = (double)glyphs.w * glyphs.h;
            double meanT = sum / nPixels;
            double varT = sumSq / nPixels - meanT * meanT;
            if (varT > 1e-9) {
                for (int y = y0; y <= y1; y++) {
                    for (int x = x0; x <= x1; x++) {
                        int lx = x - x0, ly = y - y0;
                        double rsum = rect_sum(localSum, ls, lx, ly, glyphs.w, glyphs.h);
                        double rsq = rect_sum(localSq, ls, lx, ly, glyphs.w, glyphs.h);
                        double mean = rsum / nPixels;
                        double var = rsq / nPixels - mean * mean;
                        if (var <= 1e-6) continue;
                        double dot = 0;
                        const unsigned char *basePixel = image.gray + (size_t)y * image.w + x;
                        for (int k = 0; k < count; k++)
                            dot += basePixel[(size_t)gy[k] * image.w + gx[k]] * gv[k];
                        double cov = dot / nPixels - mean * meanT;
                        double score = fabs(cov / sqrt(var * varT));
                        if (score >= minScore && nfine < (int)maxFine)
                            fine[nfine++] = (Hit){score, x, y, glyphs.w, glyphs.h, size};
                    }
                }
            }
            free(gx); free(gy); free(gv);
            free(localSum); free(localSq);
            free_glyphs(&glyphs);
        }
    }

    qsort(fine, nfine, sizeof(Hit), cmp_hit);
    int limit = maxHits * 4;
    Hit *kept = malloc(sizeof(Hit) * (size_t)limit);
    int nkept = 0;
    for (int i = 0; i < nfine && nkept < limit; i++) {
        int duplicate = 0;
        for (int j = 0; j < nkept; j++) {
            int minW = kept[j].w < fine[i].w ? kept[j].w : fine[i].w;
            int minH = kept[j].h < fine[i].h ? kept[j].h : fine[i].h;
            int dx = abs((kept[j].x + kept[j].w / 2) - (fine[i].x + fine[i].w / 2));
            int dy = abs((kept[j].y + kept[j].h / 2) - (fine[i].y + fine[i].h / 2));
            if (dx < minW * 3 / 4 && dy < minH * 3 / 4) { duplicate = 1; break; }
        }
        if (!duplicate) kept[nkept++] = fine[i];
    }
    if (nkept > maxHits) nkept = maxHits;
    for (int i = 1; i < nkept; i++) {
        Hit item = kept[i];
        int j = i - 1;
        while (j >= 0) {
            int tolerance = kept[j].h / 2;
            if (tolerance < 12) tolerance = 12;
            int before = kept[j].y < item.y - tolerance
                || (abs(kept[j].y - item.y) <= tolerance && kept[j].x <= item.x);
            if (before) break;
            kept[j + 1] = kept[j];
            j--;
        }
        kept[j + 1] = item;
    }

    printf("{\"ok\":true,\"count\":%d,\"query\":\"", nkept);
    for (const char *p = text; *p; p++) {
        if (*p == '"' || *p == '\\') putchar('\\');
        putchar(*p);
    }
    printf("\",\"matches\":[");
    for (int i = 0; i < nkept; i++) {
        Hit *hit = &kept[i];
        if (i) putchar(',');
        printf("{\"index\":%d,\"x\":%d,\"y\":%d,\"box\":[%d,%d,%d,%d],"
               "\"w\":%d,\"h\":%d,\"score\":%.3f,\"size\":%.0f,\"source\":\"text-px\"}",
                i + 1, hit->x + hit->w / 2, hit->y + hit->h / 2,
                hit->x, hit->y, hit->x + hit->w, hit->y + hit->h,
                hit->w, hit->h, hit->score, hit->size);
    }
    printf("]}\n");

    free(kept);
    free(fine);
    free(cand);
    free(image.gray);
    FT_Done_Face(font.face);
    FT_Done_FreeType(font.library);
    return 0;
}
