#!/usr/bin/env node
/**
 * Boot health gate for the harness the app supervises.
 *
 * Why this exists (2026-10-29): dsh 0.2.1 stopped dying when a plugin fails to
 * load. A missing/broken bundle is reported as
 *
 *     dsh: skipping profile bundle "x": <reason>
 *
 * and the harness keeps serving — with a UI that is missing that plugin (an
 * empty or black page is one of the shapes this takes). The app only counts a
 * failure when the supervised process exits *before* announcing its URL, because
 * a readiness resets the failure counter; so a half-broken harness would run
 * forever and automatic recovery mode would never be entered.
 *
 * start-dsh.sh runs this script while it holds the harness's ready line: exit 0
 * releases the line to the app, exit 1 means "do not announce readiness", and
 * the app will eventually enter recovery mode on its own.
 *
 * Usage: boot-health.mjs <ready-url> <boot-log-file>
 *
 * Exit: 0 healthy, 1 broken (reasons on stdout), 2 usage.
 */
import { readFile } from 'node:fs/promises';

const [, , urlArg, logPath] = process.argv;
if (!urlArg) {
    console.error('boot-health: usage: boot-health.mjs <url> <boot-log>');
    process.exit(2);
}

const budgetMs = Number(process.env.BOOT_HEALTH_TIMEOUT_MS || 30000);
const startedAt = Date.now();
const reasons = [];
const note = (text) => {
    reasons.push(text);
    console.log('boot-health: ' + text);
};

/** Log lines that mean a plugin did not load. */
const FATAL_LOG_PATTERNS = [
    /skipping profile bundle/i,
    /cannot resolve profile bundle/i,
    /Failed plugins \(/i,
    /plugin tree failed to load/i,
    /failed to load plugin/i,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function remaining() {
    return budgetMs - (Date.now() - startedAt);
}

/** fetch with a hard timeout, so a hung plugin build cannot hang the boot. */
async function fetchTimed(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/** The page stores its session in a cookie issued by the token redirect. */
function cookiesFrom(response) {
    const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    return raw.map((line) => line.split(';')[0]).join('; ');
}

/**
 * Load the shell page the way the WebView does: token URL -> 303 + cookie -> './'.
 * Returns { pageUrl, cookie, html }.
 */
async function loadShell(url) {
    let cookie = '';
    const first = await fetchTimed(url, { redirect: 'manual' });
    if (first.status === 303 || first.status === 302 || first.status === 301) {
        cookie = cookiesFrom(first);
        const target = new URL(first.headers.get('location') || './', url).href;
        const page = await fetchTimed(target, { headers: { cookie } });
        if (page.status !== 200) throw new Error('shell page HTTP ' + page.status);
        const html = await page.text();
        if (!html.includes('id="root"')) throw new Error('shell page has no #root');
        return { pageUrl: target, cookie, html };
    }
    if (first.status === 200) {
        const html = await first.text();
        if (!html.includes('id="root"')) throw new Error('shell page has no #root');
        return { pageUrl: url, cookie, html };
    }
    throw new Error('token URL HTTP ' + first.status);
}

/** Every client-plugin bundle the shell loads, resolved to absolute URLs. */
function pluginBundleUrls(pageUrl, html) {
    const urls = new Set();
    for (const match of html.matchAll(/(?:src|href)="([^"]*plugins\/[^"]*)"/g)) {
        const raw = match[1].replaceAll('&amp;', '&');
        urls.add(new URL(raw, pageUrl).href);
    }
    return [...urls];
}

/** Wait until the page answers, retrying: the client bundles build on first hit. */
async function probeHttp() {
    const deadline = Date.now() + Math.min(remaining(), 20000);
    let lastError = 'no attempt';
    while (Date.now() < deadline) {
        try {
            const shell = await loadShell(urlArg);
            const bundles = pluginBundleUrls(shell.pageUrl, shell.html);
            if (bundles.length === 0) {
                throw new Error('shell page lists no client plugin bundles');
            }
            for (const bundle of bundles) {
                const response = await fetchTimed(bundle, { headers: { cookie: shell.cookie } });
                const body = await response.text();
                const label = 'plugin bundle ' + new URL(bundle).search.slice(0, 60);
                if (response.status !== 200) throw new Error(label + ' HTTP ' + response.status);
                if (body.length < 1024) throw new Error(label + ' is only ' + body.length + ' bytes');
                // A failed build is answered as a module that throws on import.
                if (/client module build failed|Cannot find module/i.test(body.slice(0, 4096))) {
                    throw new Error(label + ' reports a build failure');
                }
            }
            console.log('boot-health: ui ok: ' + bundles.length + ' plugin bundle(s), ' +
                shell.html.length + ' B page');
            return;
        } catch (error) {
            lastError = error && error.message ? error.message : String(error);
            const wait = Math.min(1500, Math.max(0, deadline - Date.now()));
            if (wait === 0) break;
            await sleep(wait);
        }
    }
    note('ui probe failed: ' + lastError);
}

/** The harness's own stderr is the only place a skipped plugin is named. */
async function checkBootLog() {
    if (!logPath) return;
    let text = '';
    try {
        text = await readFile(logPath, 'utf8');
    } catch {
        return;
    }
    for (const line of text.split('\n')) {
        if (FATAL_LOG_PATTERNS.some((pattern) => pattern.test(line))) {
            note('boot log: ' + line.trim().slice(0, 300));
        }
    }
}

await checkBootLog();
if (reasons.length === 0) await probeHttp();

if (reasons.length > 0) {
    console.log('boot-health: BROKEN (' + reasons.length + ' reason(s)) — readiness withheld');
    process.exit(1);
}
console.log('boot-health: healthy');
process.exit(0);
