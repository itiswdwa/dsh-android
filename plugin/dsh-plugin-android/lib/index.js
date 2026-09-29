/**
 * dsh-plugin-android — host half.
 *
 * Two seams this uses, both public:
 *
 *   systemPrompt.section()  adds an ordered block to the model-visible system
 *                           prompt. The stock Web bundle already contributes
 *                           `app:web-surface` describing the browser GUI; this
 *                           plugin slots in right after it and describes what
 *                           the session actually is here — a phone, inside a
 *                           PRoot sandbox, with a mobile-sized screen and an
 *                           Android control channel.
 *   shellEnv.register()     publishes the loopback control-bridge address so
 *                           shell tools and the model can address it by name.
 *
 * The browser half (exports["./client"]) adds the matching settings page.
 */

const ANDROID_SURFACE_SECTION = "app:android-surface";

/**
 * Written for the model, not the user. Keeps to facts that change behaviour:
 * where files are, what the screen is, what is slow, what can be reached.
 */
const ANDROID_SURFACE_PROMPT = `You are running on the user's Android phone, inside a PRoot sandbox — not on a desktop, not in the cloud.

Environment facts:
- The sandbox is an Ubuntu rootfs (glibc, aarch64) owned by the DSH Android app. It is a minimal base: \`node\` (official build, /usr/local/bin/node), \`npm\`, \`bash\`, \`apt\`/\`dpkg\`, \`tar\`, \`gzip\` and \`perl\` are present; \`python3\`, \`git\`, \`curl\`, \`make\` and compilers are NOT. Install what you need with \`apt update && apt install -y <pkg>\` — the first update downloads the index and takes a minute. There is no systemd, no display server, and no root beyond the faked uid 0 inside the sandbox.
- \`/root\` is the harness home and persists across restarts. \`/opt/dsh\` holds the harness installation and \`/opt/dsh/android\` the app's own guest-side services; treat both as read-only unless the user asks otherwise.
- \`/sdcard\` is the phone's shared storage (Downloads, Documents, DCIM) bind-mounted read-write, but only once the user has granted storage access to the app. Extra folders the user mounted appear at their own paths (listed under 挂载/Mounts in the app's settings page). If a path is missing or unreadable, say so rather than retrying.
- The phone's privileged Android surface can be reached with the \`shiz\` CLI (e.g. \`shiz settings get global airplane_mode_on\`, \`shiz pm list packages\`, \`shiz am start -n pkg/.Activity\`). It runs the command as the Android shell user through Shizuku, so it can do what \`adb shell\` can. It only works while the user has granted Shizuku in the DSH app; without it the command fails, and that failure is not fixable from inside the sandbox.
- Network works, but the phone may be on mobile data or behind a VPN in "fake-IP" mode where every public hostname resolves into 198.18.0.0/15. \`web_fetch\` refuses non-public addresses by design, so it reports WEB_BLOCKED_URL for hosts that are perfectly reachable. When that happens, fetch with \`node -e 'fetch(url).then(r => r.text()).then(console.log)'\` from \`bash\` instead of retrying web_fetch.
- Android's filesystem refuses hard links, so file creation goes through a copy-based publish path locally. If a newly written file ever shows up as a dangling symlink, that is a sandbox bug worth reporting rather than working around.
- Files opened through the Web UI (attachments, workspace picks) live inside the sandbox; /sdcard is the path that reaches the user's own storage.`;

/** Loopback bridge of the DSH Android app; the app exports these on launch. */
const BRIDGE_URL_VAR = "DSH_ANDROID_BRIDGE_URL";
const BRIDGE_TOKEN_VAR = "DSH_ANDROID_BRIDGE_TOKEN";

function bridgeUrl() {
  return process.env[BRIDGE_URL_VAR] ?? "";
}

function bridgeToken() {
  return process.env[BRIDGE_TOKEN_VAR] ?? "";
}

export function apply(ctx) {
  ctx.inject(["systemPrompt"], (scope) => {
    let order = 10150;
    try {
      order = scope.systemPrompt.getSectionOrder("WEB_SURFACE") + 50;
    } catch {
      // Order table moved upstream: a fixed slot after the web surface keeps
      // the two deployment blocks adjacent.
    }
    scope.systemPrompt.section({
      name: ANDROID_SURFACE_SECTION,
      order,
      text: () => ANDROID_SURFACE_PROMPT
    });
  });

  ctx.inject(["shellEnv"], (scope) => {
    scope.shellEnv.register({
      name: "android-bridge",
      variables: {
        [BRIDGE_URL_VAR]: {
          description: "Loopback HTTP control bridge of the DSH Android app (server start/stop, distro management, Shizuku)."
        },
        [BRIDGE_TOKEN_VAR]: {
          description: "Bearer token for the DSH Android control bridge; send it as the X-Dsh-Token header."
        }
      },
      resolve: () => ({
        [BRIDGE_URL_VAR]: bridgeUrl(),
        [BRIDGE_TOKEN_VAR]: bridgeToken()
      })
    });
  });
}
