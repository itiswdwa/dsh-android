package dev.dsh.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;

import org.json.JSONObject;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * The whole UI: a full-bleed WebView showing the harness, the first-run
 * installer, and a summonable native control panel.
 *
 * No action bar and no in-app title bar, on purpose. The harness already has
 * its own chrome, and a second one above it is exactly the thing that makes
 * ported apps feel wrong on a phone.
 */
public final class MainActivity extends Activity implements ServerBus.Listener, Panel.Host {

    private static final int REQ_IMPORT = 0x1001;
    private static final int REQ_FILE = 0x1002;
    private static final int REQ_STORAGE = 0x1003;
    private static final int REQ_MOUNT = 0x1004;
    private static final int REQ_HOT = 0x1005;
    private static final int REQ_BALL = 0x1006;

    /** The palette the page last reported; null until it says anything. */
    private Boolean pageDark;

    /** Remembered across restarts, so the first frame is already right. */
    private static final String PREF_PAGE_DARK = "page_theme_dark";

    /** Window chrome: "auto" (blur when the ROM allows it), "acrylic", or "solid". */
    private static final String PREF_CHROME_MODE = "window_chrome_mode";

    /** Blur radius for the acrylic tier; the platform clamps anything bigger anyway. */
    private static final int BLUR_RADIUS = 64;

    /**
     * Scrim opacity over the wallpaper: 55% is the acrylic default, 70% is used when
     * the wallpaper's own brightness fights the icon colour. Readability wins.
     */
    /**
     * Scrim opacity over the wallpaper. Light on purpose: the point of the acrylic
     * tier is that the wallpaper is still recognisable. 35% with blur, 35% without
     * (the blur is what sells it), and 45% only where a bright wallpaper would fight
     * light icons under the dark theme.
     */
    private static final int SCRIM_ALPHA = 0x59;
    private static final int SCRIM_ALPHA_NO_BLUR = 0x59;
    private static final int SCRIM_ALPHA_BRIGHT_WALLPAPER = 0x73;

    /** Last tier we logged, so the evidence line is written only when it changes. */
    private String loggedTier = null;

    /**
     * The page's own background colour, reported by the client as `#rrggbb`.
     *
     * The bars have to match what the page actually paints, not our guess at it: the
     * harness dark is a touch lighter than the app's own dark constant, and filling the
     * bars with the constant is what made them read as two black edges.
     */
    private String pageBackground = null;

    /** The alpha the page paints its own scrim with (1 = opaque). */
    private float pageAlpha = 1f;
    private static final String PREF_PAGE_BG = "page_theme_background";
    private static final String PREF_PAGE_ALPHA = "page_theme_background_alpha";

    private FrameLayout root;
    private WebView web;
    private Panel panel;
    private LinearLayout setup;
    private LinearLayout loading;
    private TextView setupText;
    private ProgressBar setupBar;
    /** true while the bar is in indeterminate mode (unknown total), so we only switch when it changes */
    private boolean setupBarUnknown;
    private TextView banner;
    private Button menuButton;

    private ValueCallback<Uri[]> fileCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** One biometric confirmation at a time; bridge threads block waiting for it. */
    private final java.util.concurrent.atomic.AtomicBoolean biometricBusy =
            new java.util.concurrent.atomic.AtomicBoolean();
    /** The prompt currently on screen, if any (cancelled when the activity dies). */
    private Biometric.Prompt biometricPrompt;
    /** Set when the prompt has to wait for the app to come back to the foreground. */
    private PendingBiometric pendingBiometric;
    /** True between onResume and onPause; the platform refuses prompts from the background. */
    private boolean foreground;

    private boolean panelOpen;
    private String loadedUrl;
    /** True once the harness page has actually painted, not merely started loading. */
    private boolean pageReady;
    /** True once the server has been asked to start at least once this launch. */
    private boolean startRequested;
    private ServerBus.State lastState;

    /** The activity a service can hand text to; null once it is gone. */
    private static MainActivity live;
    /**
     * The plugin's desired keep-screen-on value. It lives here, not in
     * AndroidApi, so a recreated window re-applies it in onResume instead of
     * reporting true while the flag is gone.
     */
    private static volatile boolean keepScreenOnWanted;
    /** The Host this instance registered with the bridge; released in onDestroy. */
    private BridgeServer.Host bridgeHost;
    /** Prompt waiting for a loaded page. */
    private static String pendingPrompt;
    private static final String EXTRA_PROMPT = "dsh.prompt";
    /** The user asked for the recovery console, so the WebView may show it. */
    private boolean consoleRequested;
    /** The panel has already been opened by itself for this recovery session. */
    private boolean recoveryPanelShown;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        live = this;
        pendingPrompt = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_PROMPT);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root = new FrameLayout(this);
        root.setBackgroundColor(bootColor());
        setContentView(root);

        createWebView();
        createBannerAndMenu();
        createPanel();
        createLoadingOverlay();
        createSetupOverlay();
        applyWindowTheme(preferredDark());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // The user can turn window blur off in the ROM's settings; the platform
            // tells us, so the tier follows without a restart (and without a flash).
            try {
                WindowManager manager = getSystemService(WindowManager.class);
                if (manager != null) {
                    manager.addCrossWindowBlurEnabledListener(enabled ->
                            handler.post(() -> applyWindowTheme(preferredDark())));
                }
            } catch (Throwable ignored) {
            }
        }
        // One-time evidence for "can this device blur at all": the SDK, the ROM's own
        // property and its setting, and the platform's runtime answer.
        App.log("window theme: sdk=" + Build.VERSION.SDK_INT
                + " supportsBackgroundBlur=" + systemProperty("ro.surface_flinger.supports_background_blur")
                + " backgroundBlurEnable=" + globalSetting("background_blur_enable")
                + " isCrossWindowBlurEnabled=" + blurAvailable());
        ShizukuBridge.addPermissionListener();
        bridgeHost = new BridgeServer.Host() {
            @Override
            public void onChromeModeChanged() {
                handler.post(() -> applyWindowTheme(preferredDark()));
            }

            @Override
            public void onThemeReported(boolean dark, String background, float alpha) {
                // The page is the source of truth for both the palette and the exact
                // colour; keep them for the next launch too, so the first frame is
                // never the wrong one (nor the wrong shade of dark).
                try {
                    android.content.SharedPreferences.Editor editor = App.i().prefs.edit();
                    editor.putBoolean(PREF_PAGE_DARK, dark);
                    if (background != null) editor.putString(PREF_PAGE_BG, background);
                    editor.putFloat(PREF_PAGE_ALPHA, alpha);
                    editor.apply();
                } catch (Throwable ignored) {
                }
                if (background != null) pageBackground = background;
                pageAlpha = alpha <= 0f || alpha > 1f ? 1f : alpha;
                handler.post(() -> applyWindowTheme(dark));
            }

            @Override
            public void onImportRequested() {
                handler.post(MainActivity.this::onImport);
            }

            @Override
            public void onAssistPermission(int which) {
                handler.post(() -> MainActivity.this.onAssistPermission(which));
            }

            @Override
            public void onHotPickRequested() {
                handler.post(MainActivity.this::onHotPickRequested);
            }

            @Override
            public void onBallImageRequested() {
                handler.post(MainActivity.this::onBallImageRequested);
            }

            @Override
            public void onOpenInBrowser() {
                handler.post(MainActivity.this::onOpenInBrowser);
            }

            @Override
            public void onPickMountFolderRequested() {
                handler.post(MainActivity.this::pickMountFolder);
            }

            @Override
            public void onOpenUrlRequested(String url) {
                handler.post(() -> {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (ActivityNotFoundException error) {
                        Toast.makeText(MainActivity.this, "没有可用的浏览器", Toast.LENGTH_SHORT).show();
                    }
                });
            }

            @Override
            public void onShizukuPermissionRequested() {
                handler.post(() -> {
                    if (ShizukuBridge.available()) {
                        ShizukuBridge.requestPermission();
                    } else {
                        Toast.makeText(MainActivity.this, "Shizuku 未运行", Toast.LENGTH_SHORT).show();
                    }
                });
            }

            @Override
            public void onHapticTap() {
                /* The terminal's key row asks for the keyboard's own tap: it is the
                 * lightest feedback the platform has, and it is skipped by the
                 * system when the user turned touch feedback off. */
                handler.post(() -> {
                    View decor = getWindow() == null ? null : getWindow().getDecorView();
                    if (decor != null) decor.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                });
            }

            @Override
            public void onAndroidPermission(String target) {
                // Only grants that need an Activity run here; AndroidApi opens the
                // plain settings pages itself.
                handler.post(() -> {
                    switch (target) {
                        case "accessibility":
                            onAssistPermission(Assist.PERMISSION_ACCESSIBILITY);
                            break;
                        case "overlay":
                            onAssistPermission(Assist.PERMISSION_OVERLAY);
                            break;
                        case "microphone":
                            onAssistPermission(Assist.PERMISSION_MICROPHONE);
                            break;
                        case "shizuku":
                            if (ShizukuBridge.available()) {
                                ShizukuBridge.requestPermission();
                            } else {
                                Toast.makeText(MainActivity.this, "Shizuku 未运行", Toast.LENGTH_SHORT).show();
                            }
                            break;
                        default:
                            App.log("android permission: unhandled target " + target);
                    }
                });
            }

            @Override
            public void onScreenKeepOn(boolean on) {
                // Bridge worker thread: store the wanted value synchronously (so a
                // GET right after the POST sees it) and apply the window flag on
                // the main thread, where the window actually lives.
                MainActivity.this.setKeepScreenOn(on);
            }

            @Override
            public void onBiometric(String title, String subtitle, String description,
                    BridgeServer.BiometricCallback callback) {
                // Called on a bridge worker thread. The prompt is an Activity thing,
                // and the activity may have been replaced since the request arrived.
                runOnUiThread(() -> beginBiometric(title, subtitle, description, callback));
            }
        };
        BridgeServer.start(bridgeHost);

        requestStorageAccess();
        // The ball is an opt-in the user made; an app update must not silently
        // take it away.
        BallService.restore(this);

        ServerBus.addListener(this);
        if (Payload.isReady()) {
            hideSetup();
            Payload.applyHot(this);
            DshService.ensure(this);
            render();
        } else {
            installPayload();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        // The window may have been rebuilt while the app was away; the wanted
        // flag is the durable value, the window attribute is not.
        applyKeepScreenOn();
        final PendingBiometric pending = pendingBiometric;
        if (pending != null) {
            pendingBiometric = null;
            // Let onResume finish before the dialog goes up over the window.
            handler.post(() -> {
                if (!foreground) {
                    pending.gate.onResult(false, "DSH 不在前台，无法显示生物识别确认");
                    return;
                }
                showBiometricNow(pending.title, pending.subtitle, pending.description, pending.gate);
            });
        }
    }

    @Override
    protected void onPause() {
        foreground = false;
        super.onPause();
    }

    // ---------------------------------------------------------- keep-screen-on

    /** The value GET /android/display and /android/info read. */
    static boolean wantsKeepScreenOn() {
        return keepScreenOnWanted;
    }

    /**
     * Called on the bridge worker thread by `POST /android/display {"keepOn":…}`.
     * The wanted value is stored synchronously; the window flag itself can only be
     * touched on the main thread.
     */
    private void setKeepScreenOn(boolean on) {
        keepScreenOnWanted = on;
        handler.post(this::applyKeepScreenOn);
    }

    /** Re-apply the wanted flag to whatever window this instance currently owns. */
    private void applyKeepScreenOn() {
        if (isFinishing() || isDestroyed()) return;
        Window window = getWindow();
        if (window == null) return;
        if (keepScreenOnWanted) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    // ------------------------------------------------------------- UI construction

    private void createWebView() {
        web = new WebView(this);
        // A WebView paints white until its first content arrives; the harness is
        // dark, so that flash is the first thing the user sees on every launch.
        // Window colour, not a fixed dark: a white page flash on a light phone is
        // just as wrong as a dark one on a dark phone.
        web.setBackgroundColor(bootColor());
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setUserAgentString(settings.getUserAgentString() + " DshAndroid/1.0");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host == null || host.equals("127.0.0.1") || host.equals("localhost")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    Toast.makeText(MainActivity.this, "无法打开 " + uri, Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                // First frame the WebView can show. Until here the window colour
                // is what the user sees; without this the cover was already gone
                // and a white page painted over the dark shell.
                pageReady = true;
                injectBridge();
                applyWindowTheme(preferredDark());
                syncLoading(ServerBus.state());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    App.log("webview error: " + error.getDescription());
                    render();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                applyWindowTheme(preferredDark());
                syncLoading(ServerBus.state());
                // Re-inject on every navigation: the harness page is a SPA, so a
                // reload would otherwise lose the bridge handle the plugin reads.
                injectBridge();
                // The phone-layout patch closes the session drawer on selection;
                // nothing to inject here, the payload already ships it.
                // A prompt that arrived while the page was still loading (the
                // floating ball can be used before the app is even open) goes in
                // now, when there is a composer to receive it.
                if (pendingPrompt != null) {
                    String queued = pendingPrompt;
                    pendingPrompt = null;
                    deliver(queued);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    if (params != null && params.getAcceptTypes() != null
                            && params.getAcceptTypes().length > 0) {
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, params.getAcceptTypes());
                    }
                    startActivityForResult(intent, REQ_FILE);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void createBannerAndMenu() {
        banner = new TextView(this);
        banner.setTextSize(13);
        banner.setTextColor(getResources().getColor(R.color.console_text));
        banner.setPadding(dp(14), dp(10), dp(14), dp(10));
        banner.setBackgroundColor(getResources().getColor(R.color.console_card));
        banner.setVisibility(View.GONE);
        FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        bannerParams.bottomMargin = dp(28);
        root.addView(banner, bannerParams);

        menuButton = new Button(this);
        menuButton.setText("≡");
        menuButton.setTextSize(18);
        menuButton.setAllCaps(false);
        menuButton.setAlpha(0.72f);
        menuButton.setBackgroundColor(0x33000000);
        menuButton.setTextColor(getResources().getColor(R.color.console_text));
        menuButton.setOnClickListener(v -> setPanelOpen(!panelOpen));
        FrameLayout.LayoutParams menuParams = new FrameLayout.LayoutParams(dp(44), dp(44));
        menuParams.gravity = Gravity.TOP | Gravity.END;
        menuParams.topMargin = dp(8);
        menuParams.rightMargin = dp(8);
        root.addView(menuButton, menuParams);
    }

    private void createPanel() {
        panel = new Panel(this, this);
        panel.view.setTranslationX(10000f);
        panel.view.setVisibility(View.GONE);
        root.addView(panel.view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        panel.refresh();
    }

    /**
     * Startup cover: shown while the sandbox is coming up, so the user sees what
     * is happening instead of an empty dark page (or, worse, a white one) with a
     * one-line caption. It disappears the moment the harness is serving.
     */
    private void createLoadingOverlay() {
        loading = new LinearLayout(this);
        loading.setOrientation(LinearLayout.VERTICAL);
        loading.setGravity(Gravity.CENTER);
        loading.setBackgroundColor(bootColor());

        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        loading.addView(spinner);

        TextView text = new TextView(this);
        text.setText("正在启动沙箱…");
        text.setTextSize(15);
        text.setTextColor(getResources().getColor(R.color.console_text));
        text.setGravity(Gravity.CENTER);
        text.setPadding(0, dp(18), 0, 0);
        loading.addView(text);

        TextView detail = new TextView(this);
        detail.setText("首次启动需要解包内置系统，之后是几秒钟的事");
        detail.setTextSize(11);
        detail.setTextColor(getResources().getColor(R.color.console_muted));
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(dp(24), dp(10), dp(24), 0);
        loading.addView(detail);

        root.addView(loading, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    /** The cover is only for states where there is nothing else to look at. */
    private void syncLoading(ServerBus.State state) {
        if (loading == null) return;
        boolean waiting = !pageReady
                && !panelOpen
                && setup == null
                && state != ServerBus.State.ERROR
                && !Recovery.active();
        int wanted = waiting ? View.VISIBLE : View.GONE;
        if (loading.getVisibility() != wanted) {
            loading.setVisibility(wanted);
        }
    }

    private void createSetupOverlay() {
        setup = new LinearLayout(this);
        setup.setOrientation(LinearLayout.VERTICAL);
        setup.setGravity(Gravity.CENTER);
        setup.setBackgroundColor(bootColor());
        setup.setPadding(dp(28), dp(28), dp(28), dp(28));

        TextView title = new TextView(this);
        title.setText("正在安装内置沙箱");
        title.setTextSize(18);
        title.setTextColor(getResources().getColor(R.color.console_text));
        title.setGravity(Gravity.CENTER);
        setup.addView(title);

        setupBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        setupBar.setMax(1000);
        setupBarUnknown = false;   // a fresh setup view starts determinate
        LinearLayout.LayoutParams barParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        barParams.topMargin = dp(20);
        setup.addView(setupBar, barParams);

        setupText = new TextView(this);
        setupText.setTextSize(12);
        setupText.setTextColor(getResources().getColor(R.color.console_muted));
        setupText.setGravity(Gravity.CENTER);
        setupText.setPadding(0, dp(14), 0, 0);
        setup.addView(setupText);

        TextView note = new TextView(this);
        note.setText("首次启动会把内置发行版 + Node + DeepSeek Harness 解包到应用私有目录，只做一次。");
        note.setTextSize(11);
        note.setTextColor(getResources().getColor(R.color.console_muted));
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, dp(18), 0, 0);
        setup.addView(note);

        // A failed install must not be a dead end: the user needs both a way to
        // retry and a way to see the log and the rest of the console.
        LinearLayout setupActions = new LinearLayout(this);
        setupActions.setOrientation(LinearLayout.HORIZONTAL);
        setupActions.setGravity(Gravity.CENTER);
        setupActions.setPadding(0, dp(22), 0, 0);
        Button retry = setupButton("重试安装");
        retry.setOnClickListener(v -> {
            setupText.setText("重新开始…");
            setupBar.setVisibility(View.VISIBLE);
            setupBar.setProgress(0);
            installPayload();
        });
        Button console = setupButton("打开控制台");
        console.setOnClickListener(v -> {
            if (setup != null) setup.setVisibility(View.GONE);
            if (loading != null) loading.setVisibility(View.GONE);
            setPanelOpen(true);
        });
        setupActions.addView(retry);
        setupActions.addView(console);
        setup.addView(setupActions);

        root.addView(setup, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private Button setupButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setBackgroundColor(getResources().getColor(R.color.console_card));
        button.setTextColor(getResources().getColor(R.color.console_text));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.leftMargin = dp(6);
        params.rightMargin = dp(6);
        button.setLayoutParams(params);
        return button;
    }

    private void hideSetup() {
        if (setup != null) {
            setup.setVisibility(View.GONE);
            root.removeView(setup);
            setup = null;
        }
    }

    // ---------------------------------------------------------------- first run

    private void installPayload() {
        new Thread(() -> {
            try {
                // The install screen must never look frozen: the payload copy and
                // the manifest pass report an unknown total (done < 0) and get the
                // indeterminate animation, while the extraction reports entries and
                // moves the bar. Labels come from UnpackPlan (phase + counts).
                Payload.install(this, (done, total, detail) -> handler.post(() -> {
                    boolean unknown = done < 0;
                    if (setupBarUnknown != unknown) {
                        setupBarUnknown = unknown;
                        setupBar.setIndeterminate(unknown);
                    }
                    if (!unknown) {
                        setupBar.setProgress((int) Math.max(0, Math.min(1000, done)));
                    }
                    setupText.setText(detail == null ? "解包中…" : detail);
                }));
                handler.post(() -> {
                    Toast.makeText(this, "沙箱安装完成", Toast.LENGTH_SHORT).show();
                    hideSetup();
                    // Same step the ready path takes: the payload is the base
                    // tree, the hot overlay is what makes it current. Without
                    // this the very first launch runs with whatever the payload
                    // happened to bake in.
                    Payload.applyHot(this);
                    DshService.ensure(MainActivity.this);
                    render();
                });
            } catch (final Exception e) {
                App.log("payload install failed: " + e);
                handler.post(() -> {
                    setupBar.setVisibility(View.GONE);
                    setupText.setText("安装失败：" + e.getMessage()
                            + "\n\n可以点「重试安装」；若反复失败，请把这段错误发给开发者。");
                });
            }
        }, "payload-install").start();
    }

    // ------------------------------------------------------------------- state

    @Override
    public void onServerState() {
        render();
    }

    private void render() {
        ServerBus.State state = ServerBus.state();
        String url = ServerBus.url();
        if (state == ServerBus.State.STARTING || state == ServerBus.State.RUNNING) {
            startRequested = true;
        }
        syncConsoleVisibility(state);
        maybeExposeConsole(state);
        if (Recovery.active()) {
            // Recovery announces no URL: the sandbox is serving a shell, not the
            // harness. The panel is the UI for this state, so the banner points at
            // it. The console page loads only when asked for — replacing the
            // screen with a terminal unasked would hide the token the other routes
            // in (Wi-Fi, USB) need.
            banner.setText(Recovery.sshReady()
                    ? "恢复模式：harness 未启动，SSH 已在端口 " + Recovery.port()
                            + " 监听。点 ≡ 看令牌与连接命令"
                    : "正在启动恢复模式（sshd）…");
            banner.setVisibility(View.VISIBLE);
            String console = Recovery.consoleUrl();
            if (consoleRequested && ServerBus.running() && !console.equals(loadedUrl)) {
                loadedUrl = console;
                pageReady = false;
                web.loadUrl(console);
            }
        } else if (state == ServerBus.State.RUNNING && url != null && !url.equals(loadedUrl)) {
            loadedUrl = url;
            pageReady = false;
            injectBridge();
            web.loadUrl(url);
            banner.setVisibility(View.GONE);
        } else if (state == ServerBus.State.ERROR) {
            banner.setText("服务启动失败：" + (ServerBus.error() == null ? "" : ServerBus.error())
                    + "  点右上角 ≡ 查看日志");
            banner.setVisibility(View.VISIBLE);
        } else if (state == ServerBus.State.STARTING && loadedUrl == null) {
            banner.setText("正在启动本地服务…");
            banner.setVisibility(View.VISIBLE);
        } else if (state == ServerBus.State.IDLE && loadedUrl == null) {
            banner.setText("服务未运行  点右上角 ≡ 启动");
            banner.setVisibility(View.VISIBLE);
        } else if (state == ServerBus.State.IDLE) {
            // The page is still mounted but its backend is gone; the console
            // button is back (see syncConsoleVisibility), so point at it.
            banner.setText("服务已停止  点右上角 ≡ 重启");
            banner.setVisibility(View.VISIBLE);
        }
        // Last: the cover's visibility depends on the url decision above, and it
        // is what the user is staring at. Running it first (as it was) meant the
        // state that loads the page showed the cover and nothing ever hid it.
        syncLoading(ServerBus.state());
        if (panel != null && panelOpen) {
            panel.refresh();
        }
    }

    /**
     * The window colour for the palette the page is painting.
     *
     * Not the system's dark mode: the harness has its own light/dark setting, and the
     * phone's can disagree with it. The page's report is what counts; before the first
     * one we use the last value it sent (this preference outlives the process) and
     * only then the phone's own mode.
     */
    private int bootColor() {
        return getResources().getColor(preferredDark() ? R.color.window_dark : R.color.window_light);
    }

    /** The palette the window should wear right now. */
    private boolean preferredDark() {
        if (pageDark != null) return pageDark;
        try {
            android.content.SharedPreferences prefs = App.i().prefs;
            if (prefs.contains(PREF_PAGE_DARK)) return prefs.getBoolean(PREF_PAGE_DARK, false);
        } catch (Throwable ignored) {
            // App not up yet: fall through to the system's answer.
        }
        return (getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    /**
     * Paint the window for the palette the page is painting.
     *
     * The bars belong to Android, not to the page, so on a dark page over a light
     * phone they stayed white — and because this activity declares `uiMode` in
     * `configChanges` it is never recreated when the phone's mode flips, so even the
     * night resources stayed put: the window kept `#FFF7F8FA` behind both bars.
     * Everything visible in those strips is set here: the decor background (that is
     * what shows behind the bars with targetSdk 28), the two bar colours, the icon
     * brightness, and the WebView's own underlay.
     */
    private void applyWindowTheme(boolean dark) {
        pageDark = dark;
        try {
            applyWindowChrome(dark);
        } catch (Throwable error) {
            // Whatever went wrong (a ROM refusing a call, no wallpaper service), the
            // one thing that must never happen is a white or black strip: fall back to
            // the flat theme colour, which is what shipped before acrylic existed.
            App.log("window theme: fell back to solid (" + error + ")");
            loggedTier = null;
            applySolidChrome(dark);
        }
    }

    /**
     * Paint the window in the strongest tier this device can actually do.
     *
     * The window is full-screen and only its *content* is inset by the bars, so the
     * bar strips show whatever this method puts behind them. Three tiers, best first:
     * real blur over the wallpaper ("acrylic"), translucency (wallpaper visible, no
     * blur), and the flat theme colour. The last is what a device without blur gets,
     * so no tier here can leave a white or black edge.
     */
    private void applyWindowChrome(boolean dark) {
        String mode = chromeMode();
        // "auto" means the flat theme colour, always. Translucency is nice when the
        // wallpaper shows through it and a visible band when it does not, and that
        // depends on the wallpaper, not on the ROM - so the safe default wins and the
        // wallpaper look is an explicit choice. (Measured on this device: with the
        // blur actually applied, a 55% dark scrim over a dark wallpaper still read as
        // a black bar, which is exactly the complaint this avoids.)
        boolean translucent = "acrylic".equals(mode);
        boolean blur = translucent && blurAvailable();
        // In the acrylic tier the bars copy the page's own scrim (colour *and* alpha), so
        // the three areas read as one surface; without a report they use the fallback
        // scrim, which is still a scrim and never a flat black band.
        int alpha = translucent ? pageScrimAlpha(dark, blur) : 0xFF;
        // Icons follow what the strip actually looks like once the scrim and the
        // wallpaper are composited, not the harness theme alone: a 35% dark scrim over
        // a bright wallpaper is still a bright strip, and dark icons read better there.
        // Which way the icons go is decided by the colour the bars actually end up with -
        // the page's own background in the flat tier, the scrim over the wallpaper in the
        // acrylic one - so a lighter-than-expected page never gets dark icons.
        double composite = translucent ? compositeLuminance(dark, alpha) : luminance(windowColor(dark));
        boolean lightIcons = composite < 0.5;
        Window window = getWindow();
        if (translucent) {
            // Translucent background + transparent bars is what lets the wallpaper
            // (blurred, when the ROM blurs) show through the two strips.
            window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(
                    withAlpha(pageScrimColor(dark), alpha)));
            window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
            window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        } else {
            applySolidChrome(dark);
        }
        // Two levers, because a ROM can honour one and drop the other:
        //   * setBackgroundBlurRadius - the API-31 "background blur" (what acrylic wants)
        //   * LayoutParams.setBlurBehindRadius + FLAG_BLUR_BEHIND - the older surface
        // The read-back is logged: if our own params hold the radius but the compositor
        // layer still reports 0 (dumpsys: `backgroundBlurRadius=0` on the layer named
        // `dev.dsh.android/...MainActivity#<id>`), the ROM is dropping it, not us.
        int paramsRadius = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.setBackgroundBlurRadius(blur ? BLUR_RADIUS : 0);
            try {
                if (blur) window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND);
                else window.clearFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND);
                WindowManager.LayoutParams attributes = window.getAttributes();
                attributes.setBlurBehindRadius(blur ? BLUR_RADIUS : 0);
                window.setAttributes(attributes);
                paramsRadius = window.getAttributes().getBlurBehindRadius();
            } catch (Throwable ignored) {
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+ enforces its own contrast scrim over a light bar (and over
            // the gesture bar); with the colours pinned here it only muddies them.
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        setLightSystemBars(!lightIcons);
        // The content stays opaque: only the strips behind the bars are translucent, so
        // the page never shows the wallpaper through itself.
        int opaque = windowColor(dark);
        if (root != null) root.setBackgroundColor(opaque);
        if (web != null) web.setBackgroundColor(opaque);
        if (loading != null) loading.setBackgroundColor(opaque);
        if (setup != null) setup.setBackgroundColor(opaque);
        logTier(blur ? "acrylic" : translucent ? "translucent" : "solid", alpha,
                " r=" + (blur ? BLUR_RADIUS : 0)
                        + " blurEnabled=" + blurAvailable()
                        + " paramsBlur=" + paramsRadius
                        + " windowAlpha=0x" + String.format("%02X", alpha)
                        + " icons=" + (lightIcons ? "light" : "dark")
                        + " wallpaperLum=" + String.format("%.2f", wallpaperLuminance())
                        + " barColor=" + hex(translucent ? withAlpha(pageScrimColor(dark), alpha) : windowColor(dark))
                        + "@" + Math.round(alpha * 100f / 255f) + "%"
                        + " pageScrim=" + (pageBackground == null ? "unknown" : pageBackground)
                        + "@" + Math.round(pageAlpha * 100f) + "%"
                        + " src=" + (colorFromPage() ? "page" : "theme")
                        + " sameColor=" + (hex(translucent
                                ? withAlpha(pageScrimColor(dark), alpha) : windowColor(dark))
                                .equalsIgnoreCase(pageBackground == null ? "" : pageBackground))
                        + " storedMode=" + storedChromeMode()
                        + " content=" + (translucent ? "translucent(bars=wallpaper)" : "opaque")
                        + " barArea=" + (translucent ? "wallpaper" : "themeColor")
                        + " mode=" + chromeMode()
                        + " effect=" + (blur ? "acrylic" : translucent ? "translucent" : "solid"));
    }

    /** The flat tier: an opaque theme-coloured window and bars. */
    private void applySolidChrome(boolean dark) {
        int color = windowColor(dark);
        Window window = getWindow();
        window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(color));
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) window.setBackgroundBlurRadius(0);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        setLightSystemBars(!dark);
        if (root != null) root.setBackgroundColor(color);
        if (web != null) web.setBackgroundColor(color);
        if (loading != null) loading.setBackgroundColor(color);
        if (setup != null) setup.setBackgroundColor(color);
        logTier("solid", 0xFF, " r=0 blurEnabled=" + blurAvailable() + " paramsBlur=0"
                + " windowAlpha=0xFF barColor=" + hex(windowColor(dark))
                + " src=" + (colorFromPage() ? "page" : "theme")
                + " sameColor=" + hex(windowColor(dark)).equalsIgnoreCase(
                        pageBackground == null ? "" : pageBackground)
                + " storedMode=" + storedChromeMode()
                + " barArea=themeColor mode=" + chromeMode() + " effect=solid");
    }

    /**
     * One line per tier change: this is the raw evidence for which path a device took
     * ("acrylic r=64 alpha=0x8C" / "translucent" / "solid").
     */
    private void logTier(String tier, int alpha, String detail) {
        String line = "window theme: " + tier + " alpha=0x" + String.format("%02X", alpha) + detail;
        if (line.equals(loggedTier)) return;
        loggedTier = line;
        App.log(line);
    }

    /**
     * The colour the bars and the window background should be: the page's own, when the
     * client has told us, and the theme constant otherwise.
     */
    private int windowColor(boolean dark) {
        // The page's own colour first: filling the bars with our constant while the page
        // paints a slightly lighter dark (#151517 vs #0E0F12 on this device) is exactly
        // the shade difference that reads as two black edges. The constants are the
        // fallback for a page that never reported (older plugin, or the bridge down).
        String bg = pageBackground;
        if (bg == null) {
            try {
                bg = App.i().prefs.getString(PREF_PAGE_BG, null);
            } catch (Throwable ignored) {
            }
        }
        if (bg != null) {
            try {
                return android.graphics.Color.parseColor(bg) | 0xFF000000;
            } catch (Throwable ignored) {
            }
        }
        return getResources().getColor(dark ? R.color.window_dark : R.color.window_light);
    }

    /**
     * The colour the page paints its scrim with, for the bars in the acrylic tier.
     *
     * Here the page is deliberately see-through, so "the page's colour" means its scrim
     * layer, not its final appearance; the fallback is the theme constant.
     */
    private int pageScrimColor(boolean dark) {
        return windowColor(dark);
    }

    /** True when this colour came from the page rather than from our own constants. */
    private boolean colorFromPage() {
        if (pageBackground != null) return true;
        try {
            return App.i().prefs.getString(PREF_PAGE_BG, null) != null;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static double luminance(int color) {
        return (0.2126 * android.graphics.Color.red(color)
                + 0.7152 * android.graphics.Color.green(color)
                + 0.0722 * android.graphics.Color.blue(color)) / 255.0;
    }

    private static String hex(int color) {
        return String.format("#%06X", color & 0xFFFFFF);
    }

    private static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (alpha << 24);
    }

    /** What is actually in storage, before validation - so a lost choice shows up. */
    private String storedChromeMode() {
        try {
            return String.valueOf(App.i().prefs.getString(PREF_CHROME_MODE, "(unset)"));
        } catch (Throwable ignored) {
            return "(unreadable)";
        }
    }

    /** "auto" unless the user picked one of the other two. */
    private String chromeMode() {
        try {
            String value = App.i().prefs.getString(PREF_CHROME_MODE, "auto");
            if ("acrylic".equals(value) || "solid".equals(value)) return value;
        } catch (Throwable ignored) {
        }
        return "auto";
    }

    /** A system property, if this ROM still lets an app read it. */
    private static String systemProperty(String name) {
        try {
            Class<?> properties = Class.forName("android.os.SystemProperties");
            Object value = properties.getMethod("get", String.class).invoke(null, name);
            return String.valueOf(value);
        } catch (Throwable ignored) {
            return "(unreadable)";
        }
    }

    /** A global setting (read-only here): the ROM's own blur switch. */
    private static String globalSetting(String name) {
        android.content.ContentResolver resolver = App.i().getContentResolver();
        // The ROM may keep this in any of the three namespaces; -1 means "not here".
        for (String namespace : new String[]{"Global", "Secure", "System"}) {
            try {
                Object value = "Global".equals(namespace)
                        ? android.provider.Settings.Global.getInt(resolver, name, -1)
                        : "Secure".equals(namespace)
                            ? android.provider.Settings.Secure.getInt(resolver, name, -1)
                            : android.provider.Settings.System.getInt(resolver, name, -1);
                if (value instanceof Integer && (Integer) value != -1) {
                    return namespace.toLowerCase() + "=" + value;
                }
            } catch (Throwable ignored) {
            }
        }
        return "(not found)";
    }

    /** Does this ROM actually blur behind windows right now? (API 31+, and switchable.) */
    private boolean blurAvailable() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false;
        try {
            WindowManager manager = getSystemService(WindowManager.class);
            return manager != null && manager.isCrossWindowBlurEnabled();
        } catch (Throwable ignored) {
            return false;
        }
    }

    /**
     * Scrim opacity over the wallpaper.
     *
     * The icons follow the harness theme, so the strip has to stay readable on any
     * wallpaper: when the wallpaper's own brightness fights them (bright wallpaper
     * under a dark theme, dark wallpaper under a light one) the scrim gets stronger.
     * Anything unreadable - no colours, no service, a ROM returning nothing - keeps
     * the default, because a plain strip beats an unreadable one.
     */
    /**
     * The wallpaper's own brightness, or -1 when the ROM will not say.
     *
     * Used twice: to decide whether a bright wallpaper needs a slightly stronger scrim
     * under the dark theme, and to work out which way the icons should go.
     */
    private double wallpaperLuminance() {
        try {
            android.app.WallpaperManager manager = android.app.WallpaperManager.getInstance(this);
            android.app.WallpaperColors colors =
                    manager.getWallpaperColors(android.app.WallpaperManager.FLAG_SYSTEM);
            if (colors == null || colors.getPrimaryColor() == null) return -1;
            int wallpaper = colors.getPrimaryColor().toArgb();
            return (0.2126 * android.graphics.Color.red(wallpaper)
                    + 0.7152 * android.graphics.Color.green(wallpaper)
                    + 0.0722 * android.graphics.Color.blue(wallpaper)) / 255.0;
        } catch (Throwable ignored) {
            return -1;
        }
    }

    /** What the bar strip ends up looking like: scrim over wallpaper. */
    private double compositeLuminance(boolean dark, int alpha) {
        double scrim = (dark ? 0.0 : 1.0);
        double wallpaper = wallpaperLuminance();
        if (wallpaper < 0) return scrim;
        double weight = alpha / 255.0;
        return weight * scrim + (1 - weight) * wallpaper;
    }

    /**
     * The alpha for the bars: the page's own scrim when it has told us, else the fallback.
     *
     * Matching this is what makes the top and bottom strips continuous with the middle -
     * a fixed 35% over the wallpaper is not the same surface the page is painting.
     */
    private int pageScrimAlpha(boolean dark, boolean blur) {
        String bg = pageBackground;
        if (bg == null) {
            try {
                bg = App.i().prefs.getString(PREF_PAGE_BG, null);
            } catch (Throwable ignored) {
            }
        }
        if (bg != null) {
            float alpha = pageAlpha;
            if (alpha <= 0f || alpha > 1f) {
                try {
                    alpha = App.i().prefs.getFloat(PREF_PAGE_ALPHA, 1f);
                } catch (Throwable ignored) {
                    alpha = 1f;
                }
            }
            return Math.max(0x14, Math.min(0xFF, Math.round(alpha * 255f)));
        }
        return scrimAlpha(dark, blur);
    }

    private int scrimAlpha(boolean dark, boolean blur) {
        int base = blur ? SCRIM_ALPHA : SCRIM_ALPHA_NO_BLUR;
        if (dark && wallpaperLuminance() > 0.5) base = Math.max(base, SCRIM_ALPHA_BRIGHT_WALLPAPER);
        return base;
    }

    /** Light icons on a light bar, dark icons on a dark one. */
    private void setLightSystemBars(boolean light) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                int mask = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(light ? mask : 0, mask);
            }
            return;
        }
        View decor = getWindow().getDecorView();
        int flags = decor.getSystemUiVisibility();
        int bars = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        // Light navigation bar icons need API 26; below that the bar stays dark, which
        // is what the platform does anyway.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bars |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(light ? (flags | bars) : (flags & ~bars));
    }

    /**
     * The phone's own dark mode flipped. This activity is not recreated (see
     * `configChanges`), so nothing would repaint the window on its own; re-resolve
     * from the new configuration, and let the page's report win if it has one.
     */
    @Override
    public void onConfigurationChanged(android.content.res.Configuration configuration) {
        super.onConfigurationChanged(configuration);
        applyWindowTheme(preferredDark());
    }

    /**
     * Hand the Web UI its side of the contract: where the control bridge lives,
     * its token, and the in-guest PTY endpoint. Injected as a plain object
     * rather than through addJavascriptInterface so the plugin can read
     * `window.DshAndroid.pty.url` directly, and so it is re-injected on every
     * navigation (the page is same-origin loopback, nothing else can read it).
     */
    /**
     * Hand text from the floating ball (or any other surface) to the harness.
     *
     * Delivered by calling into the page rather than by driving the DOM from
     * Java: the plugin owns `window.__dshAndroidPrompt`, it can start a session
     * with the harness's own client API, and the whole path stays hot-updatable.
     * Called on the UI thread only.
     */
    private void deliver(final String text) {
        if (text == null || text.trim().isEmpty()) return;
        runOnUiThread(() -> {
            if (web == null || !pageReady) {
                pendingPrompt = text;
                return;
            }
            injectBridge();
            web.evaluateJavascript(
                    "(function(){try{return window.__dshAndroidPrompt ? window.__dshAndroidPrompt("
                            + JSONObject.quote(text) + ") : 'no-hook'}catch(e){return String(e)}})()",
                    value -> {
                        App.log("prompt delivery: " + value);
                        // `value` is a JSON string ("pasted"); strip the quotes
                        // and tell the ball what actually happened.
                        BallService.onDeliveryResult(value == null ? "" : value.replace("\"", ""));
                    });
        });
    }

    /** Used by {@link Assist#deliver}, which has no activity of its own. */
    static void deliverPrompt(String text) {
        if (text == null || text.trim().isEmpty()) return;
        MainActivity activity = live;
        if (activity != null) {
            activity.deliver(text);
            return;
        }
        // Cold: bring the app up and hand it over once the page has loaded.
        Context ctx = App.i();
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra(EXTRA_PROMPT, text);
        ctx.startActivity(intent);
    }

    /** Pick the floating ball's picture: a bitmap or an Android vector XML. */
    @Override
    public void onBallImageRequested() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "image/*", "application/xml", "text/xml", "application/octet-stream"});
        try {
            startActivityForResult(intent, REQ_BALL);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可用的文件选择器", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Copy the chosen picture into app storage and point the ball at it.
     *
     * Copied rather than referenced: a content URI's permission is tied to the
     * activity that received it, and the ball is drawn by a service that outlives
     * it. The extension is kept because it decides how the file is decoded.
     */
    private void applyPickedBallImage(Uri uri) {
        String name = uri.getLastPathSegment();
        String extension = ".png";
        if (name != null) {
            int dot = name.lastIndexOf('.');
            if (dot > 0) extension = name.substring(dot).toLowerCase();
        }
        File target = new File(App.i().getFilesDir(), "ball-icon" + extension);
        try (InputStream in = getContentResolver().openInputStream(uri);
             java.io.OutputStream out = new java.io.FileOutputStream(target)) {
            if (in == null) throw new java.io.IOException("读不到这个文件");
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
        } catch (Exception error) {
            Toast.makeText(this, "读取失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
            return;
        }
        App.i().prefs.edit().putString(BallService.PREF_IMAGE, target.getAbsolutePath()).apply();
        BallService.reload(this);
        Toast.makeText(this, "悬浮球图标已更新", Toast.LENGTH_SHORT).show();
    }

    /** Let the user choose a dsh-hot.zip from their own storage. */
    @Override
    public void onHotPickRequested() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/zip", "application/x-zip-compressed", "application/octet-stream"});
        try {
            startActivityForResult(intent, REQ_HOT);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可用的文件选择器", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Apply the picked package.
     *
     * Copy first, then unpack: the picker hands back a content URI whose
     * permission lasts only for this call, and unpacking walks the archive more
     * than once.
     */
    private void applyPickedHot(Uri uri) {
        File staged = new File(App.i().tmpDir, "hot-picked.zip");
        try (InputStream in = getContentResolver().openInputStream(uri);
             java.io.OutputStream out = new java.io.FileOutputStream(staged)) {
            if (in == null) throw new java.io.IOException("读不到这个文件");
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
        } catch (Exception error) {
            Toast.makeText(this, "读取失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
            return;
        }
        org.json.JSONObject result = Payload.applyFile(this, staged);
        //noinspection ResultOfMethodCallIgnored
        staged.delete();
        Toast.makeText(this, result.optString("message", result.optString("error", "")),
                Toast.LENGTH_LONG).show();
        // The settings page polls the snapshot every couple of seconds, so the
        // applied version shows up by itself; nothing to push from here.
    }

    @Override
    public void onAssistPermission(int which) {
        if (which == Assist.PERMISSION_MICROPHONE) {
            requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 41);
            return;
        }
        Intent intent = new Intent(which == Assist.PERMISSION_OVERLAY
                ? android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION
                : android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
        if (which == Assist.PERMISSION_OVERLAY) {
            intent.setData(android.net.Uri.parse("package:" + getPackageName()));
        }
        try {
            startActivity(intent);
        } catch (Exception error) {
            App.log("assist permission page: " + error);
        }
    }

    // -------------------------------------------------------------- biometric

    /**
     * Arrange one system biometric confirmation and answer the bridge thread.
     *
     * <p>Rules from docs/AI-API.md and the 1.2.2 revision:
     *
     * <ul>
     *   <li>one prompt at a time — a second request fails readably instead of
     *       queueing behind the first;</li>
     *   <li>when the app is in the background, try to bring the task forward
     *       (works when overlay permission lets us) and only then prompt;</li>
     *   <li>SDK < 28 / no enrolled biometric gets a readable error, never a
     *       plain allow-deny fallback.</li>
     * </ul>
     */
    private void beginBiometric(String title, String subtitle, String description,
            BridgeServer.BiometricCallback callback) {
        MainActivity activity = live;
        if (activity == null) {
            if (callback != null) callback.onResult(false, "DSH 界面没有运行，无法弹出生物识别确认");
            return;
        }
        if (activity != this) {
            // The host belonged to a destroyed instance; the live one owns the window.
            activity.beginBiometric(title, subtitle, description, callback);
            return;
        }
        if (callback == null) return;
        if (!biometricBusy.compareAndSet(false, true)) {
            callback.onResult(false, "另一次生物识别确认正在进行，请稍后再试");
            return;
        }

        final java.util.concurrent.atomic.AtomicBoolean released =
                new java.util.concurrent.atomic.AtomicBoolean();
        final BridgeServer.BiometricCallback gate = new BridgeServer.BiometricCallback() {
            @Override
            public void onResult(boolean authenticated, String error) {
                if (!released.compareAndSet(false, true)) return;
                biometricBusy.set(false);
                try {
                    callback.onResult(authenticated, error);
                } catch (Throwable ignored) {
                }
            }
        };

        if (!foreground) {
            final PendingBiometric pending =
                    new PendingBiometric(title, subtitle, description, gate);
            pendingBiometric = pending;
            try {
                Intent intent = new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(intent);
            } catch (Throwable error) {
                pendingBiometric = null;
                gate.onResult(false, "DSH 不在前台，无法显示生物识别确认："
                        + (error.getMessage() == null ? error.toString() : error.getMessage()));
                return;
            }
            // The system may silently refuse a background activity start (Android
            // 10+). onResume will show the prompt if it worked; otherwise say so
            // instead of leaving the caller blocked for the full 60 s.
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (pendingBiometric != pending) return;
                    pendingBiometric = null;
                    gate.onResult(false, "DSH 不在前台，无法显示生物识别确认；请先回到 DSH 页面再试");
                }
            }, 2000);
            return;
        }
        showBiometricNow(title, subtitle, description, gate);
    }

    private void showBiometricNow(String title, String subtitle, String description,
            BridgeServer.BiometricCallback gate) {
        JSONObject status;
        try {
            status = Biometric.status();
        } catch (Throwable error) {
            gate.onResult(false, "无法读取生物识别状态：" + error);
            return;
        }
        if (!status.optBoolean("available", false)) {
            gate.onResult(false, status.optString("message", "这台设备没有可用的生物识别"));
            return;
        }
        try {
            biometricPrompt = Biometric.startPrompt(this, title, subtitle, description,
                    new Biometric.PromptListener() {
                        @Override
                        public void onResult(boolean authenticated, String error) {
                            biometricPrompt = null;
                            gate.onResult(authenticated, error);
                        }
                    });
        } catch (Throwable error) {
            gate.onResult(false, "无法显示生物识别确认：" + error);
        }
    }

    private void injectBridge() {
        App app = App.i();
        // version 2 is the plugin-facing Android API (`/android/*`, docs/ANDROID-API.md);
        // 1 only promised base/token/pty.
        String script = "window.DshAndroid={version:2"
                + ",base:'http://127.0.0.1:" + app.bridgePort() + "'"
                + ",token:'" + BridgeServer.token() + "'"
                + ",pty:{url:'http://127.0.0.1:" + app.ptyPort() + "'"
                + ",token:'" + app.ensurePtyToken() + "'}};";
        web.evaluateJavascript(script, null);
    }

    /**
     * Ask for legacy shared-storage access once, so the /sdcard bind can be
     * offered. targetSdk 28 + requestLegacyExternalStorage means the grant buys
     * real path access rather than the media-only access a modern target gets,
     * which is what lets the sandbox see the user's own files.
     */
    private void requestStorageAccess() {
        if (App.i().hasStorageAccess() || !App.i().prefs.getBoolean("shareStorage", true)) return;
        if (checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            requestPermissions(new String[]{
                    android.Manifest.permission.READ_EXTERNAL_STORAGE,
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        } catch (Throwable error) {
            App.log("storage permission request failed: " + error);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ_STORAGE) return;
        boolean granted = results.length > 0
                && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
        App.log("storage permission " + (granted ? "granted" : "denied"));
        if (granted) {
            // The bind only exists at process start, so a restart is what makes
            // /sdcard appear in the guest.
            Toast.makeText(this, granted ? "已授权手机存储，重启服务后 /sdcard 生效" : "", Toast.LENGTH_LONG).show();
            onRestartServerIfRunning();
        }
    }

    private void onRestartServerIfRunning() {
        if (ServerBus.running()) {
            restartServer();
        }
    }

    /**
     * The native console exists for the states the harness cannot render itself:
     * no server yet, or a server that failed to start. Once the harness is up it
     * owns everything (its settings page drives the sandbox through the bridge),
     * and the floating button must get out of the way — it sits exactly where the
     * sidebar's own collapse control lands, so leaving it there makes the drawer
     * impossible to close with one tap.
     */
    private void syncConsoleVisibility(ServerBus.State state) {
        // Recovery reports RUNNING too — the sandbox really is serving — but the
        // console button is the only way to the token, so it has to stay.
        boolean running = state == ServerBus.State.RUNNING && !Recovery.active();
        if (menuButton == null) return;
        int wanted = running ? View.GONE : View.VISIBLE;
        if (menuButton.getVisibility() != wanted) {
            menuButton.setVisibility(wanted);
        }
        if (running && panelOpen) {
            setPanelOpen(false);
        }
        if (setup != null && setup.getVisibility() == View.VISIBLE && running) {
            setup.setVisibility(View.GONE);
        }
    }

    /**
     * A running harness owns the screen; a stopped or failed one has nothing to
     * show, so the native console becomes the screen. Opening it automatically is
     * the difference between "the app is broken" and "the app is telling you what
     * went wrong and offering the fix" — the button alone is too easy to miss,
     * especially since it is hidden while the harness is up.
     */
    private void maybeExposeConsole(ServerBus.State state) {
        if (Recovery.active()) {
            // Once per recovery session: the panel holds the token and the
            // connection commands, and the user who just lost the harness has no
            // way to know they are there.
            if (!recoveryPanelShown && !panelOpen && Payload.isReady()) {
                recoveryPanelShown = true;
                setPanelOpen(true);
            }
            return;
        }
        recoveryPanelShown = false;
        boolean stopped = state == ServerBus.State.ERROR || state == ServerBus.State.IDLE;
        boolean changed = lastState != state;
        lastState = state;
        if (!stopped || !changed || panelOpen || !startRequested) return;
        if (!Payload.isReady()) return;                 // first-run installer owns the screen
        setPanelOpen(true);
    }

    private void setPanelOpen(boolean open) {
        panelOpen = open;
        if (open) {
            panel.refresh();
            if (loading != null) loading.setVisibility(View.GONE);
            panel.view.setVisibility(View.VISIBLE);
            // The first-run overlay is added after the panel, so without this the
            // panel opens underneath it and the menu button looks dead.
            panel.view.bringToFront();
            panel.view.setTranslationX(root.getWidth());
            panel.view.animate().translationX(0f).setDuration(180).start();
        } else {
            panel.view.animate().translationX(root.getWidth()).setDuration(160)
                    .withEndAction(() -> panel.view.setVisibility(View.GONE)).start();
        }
        menuButton.animate().alpha(open ? 1f : 0.72f).setDuration(160).start();
    }

    // -------------------------------------------------------------- panel host

    @Override
    public void startServer() {
        DshService.ensure(this);
        ServerBus.start(this, Distros.active(this), App.i().prefs.getString("apiKey", ""));
        panel.refresh();
    }

    @Override
    public void stopServer() {
        DshService.stopServer(this);
        panel.refresh();
    }

    @Override
    public void restartServer() {
        loadedUrl = null;
        ServerBus.stop();
        handler.postDelayed(() -> {
            DshService.ensure(this);
            ServerBus.start(this, Distros.active(this), App.i().prefs.getString("apiKey", ""));
            panel.refresh();
        }, 800);
    }

    @Override
    public void enterRecovery() {
        if (!Payload.isReady()) {
            Toast.makeText(this, "运行时还没装好——恢复模式也要用它", Toast.LENGTH_SHORT).show();
            return;
        }
        Recovery.enter("用户从面板进入");
        consoleRequested = false;
        loadedUrl = null;
        restartServer();
        panel.refresh();
    }

    @Override
    public void exitRecovery() {
        Recovery.exit("用户从面板退出");
        consoleRequested = false;
        loadedUrl = null;
        restartServer();
        panel.refresh();
    }

    @Override
    public void rotateRecoveryToken() {
        Recovery.rotateToken();
        // The password lives in the guest's own shadow entry, so a new token only
        // becomes real once the guest is restarted with it in the environment.
        if (Recovery.active()) restartServer();
        panel.refresh();
    }

    @Override
    public void openRecoveryConsole() {
        if (!Recovery.active()) return;
        consoleRequested = true;
        setPanelOpen(false);
        render();
    }

    @Override
    public void onOpenInBrowser() {
        String url = ServerBus.url();
        if (url == null) {
            Toast.makeText(this, "服务尚未就绪", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "没有可用的浏览器", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onSelectDistro(String id) {
        App.i().setActiveDistroId(id);
        panel.setEditing(id);
        Toast.makeText(this, "已选中 " + id, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onDeleteDistro(String id) {
        Distros.remove(id);
        if (id.equals(App.i().activeDistroId())) {
            App.i().setActiveDistroId(App.BUNDLED_ID);
        }
        panel.refresh();
    }

    @Override
    public void onSaveSettings() {
        panel.refresh();
        Toast.makeText(this, "已保存", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onClose() {
        setPanelOpen(false);
    }

    @Override
    public void onImport() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try {
            startActivityForResult(intent, REQ_IMPORT);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "没有可用的文件选择器", Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------ activity glue

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = data == null ? null : data.getData();
        if (requestCode == REQ_MOUNT) {
            if (resultCode == RESULT_OK && uri != null) handleMountPick(uri);
            return;
        }
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(resultCode == RESULT_OK && uri != null
                        ? new Uri[]{uri} : null);
                fileCallback = null;
            }
            return;
        }
        if (requestCode == REQ_IMPORT) {
            if (resultCode != RESULT_OK || uri == null) return;
            importArchive(uri);
        }
        if (requestCode == REQ_HOT) {
            if (resultCode != RESULT_OK || uri == null) return;
            applyPickedHot(uri);
        }
        if (requestCode == REQ_BALL) {
            if (resultCode != RESULT_OK || uri == null) return;
            applyPickedBallImage(uri);
        }
    }

    /**
     * Folder picker for mount targets. SAF hands back a tree document id rather
     * than a path, and PRoot binds host paths, so the id has to be translated:
     * "primary:Download" is the shared volume, anything else is a removable or
     * emulated volume under /storage.
     */
    private void pickMountFolder() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intent, REQ_MOUNT);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可用的文件选择器", Toast.LENGTH_SHORT).show();
        }
    }

    private String treeToPath(Uri uri) {
        try {
            String documentId = android.provider.DocumentsContract.getTreeDocumentId(uri);
            if (documentId == null) return null;
            int colon = documentId.indexOf(':');
            if (colon < 0) return null;
            String volume = documentId.substring(0, colon);
            String relative = documentId.substring(colon + 1);
            if ("primary".equalsIgnoreCase(volume)) {
                File base = android.os.Environment.getExternalStorageDirectory();
                return relative.isEmpty() ? base.getAbsolutePath()
                        : new File(base, relative).getAbsolutePath();
            }
            return "/storage/" + volume + (relative.isEmpty() ? "" : "/" + relative);
        } catch (Throwable error) {
            App.log("treeToPath failed: " + error);
            return null;
        }
    }

    private void handleMountPick(Uri uri) {
        String path = treeToPath(uri);
        if (path == null) {
            Toast.makeText(this, "无法把这个位置解析成本地路径（云盘等provider不支持）", Toast.LENGTH_LONG).show();
            return;
        }
        File folder = new File(path);
        if (!folder.isDirectory()) {
            Toast.makeText(this, "目录不存在或不可读：" + path, Toast.LENGTH_LONG).show();
            return;
        }
        if (!folder.canRead()) {
            Toast.makeText(this, "没有读取权限，请先在系统设置里授予存储权限：" + path, Toast.LENGTH_LONG).show();
            return;
        }
        Mounts.Mount mount = Mounts.add(path, Mounts.defaultGuestPath(path));
        if (mount == null) {
            Toast.makeText(this, "挂载失败", Toast.LENGTH_SHORT).show();
            return;
        }
        Toast.makeText(this, "已挂载到 " + mount.guest + "（重启服务后生效）", Toast.LENGTH_LONG).show();
        if (panelOpen) panel.refresh();
    }

    private void importArchive(final Uri uri) {
        panel.setProgress("正在复制归档…");
        new Thread(() -> {
            File staged = new File(App.i().tmpDir, "import-" + System.currentTimeMillis() + ".tar");
            try (InputStream in = getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(staged)) {
                if (in == null) throw new java.io.IOException("无法读取所选文件");
                byte[] buffer = new byte[1 << 16];
                long total = 0;
                int got;
                while ((got = in.read(buffer)) > 0) {
                    out.write(buffer, 0, got);
                    total += got;
                    final long done = total;
                    handler.post(() -> panel.setProgress("已复制 " + (done / (1024 * 1024)) + " MB"));
                }
            } catch (final Exception e) {
                handler.post(() -> panel.setProgress("导入失败：" + e.getMessage()));
                return;
            }

            String name = queryName(uri);
            handler.post(() -> panel.setProgress("正在用沙箱内的 tar 解包 " + name + " …（大镜像需要一两分钟）"));
            try {
                String id = Distros.importRootfs(this, staged, name);
                handler.post(() -> {
                    panel.setProgress("已导入 " + id);
                    panel.setEditing(id);
                    Toast.makeText(this, "导入完成：" + id, Toast.LENGTH_LONG).show();
                });
            } catch (final Exception e) {
                App.log("import failed: " + e);
                handler.post(() -> panel.setProgress("导入失败：" + e.getMessage()));
            } finally {
                //noinspection ResultOfMethodCallIgnored
                staged.delete();
            }
        }, "rootfs-import").start();
    }

    private String queryName(Uri uri) {
        try (android.database.Cursor cursor = getContentResolver()
                .query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null) return name;
                }
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last == null ? "rootfs" : last;
    }

    @Override
    public void onBackPressed() {
        if (panelOpen) {
            setPanelOpen(false);
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return window.__dshmBack?window.__dshmBack():false}catch(e){return false}})()",
                value -> {
                    if (!"true".equals(value)) {
                        moveTaskToBack(true);
                    }
                });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getStringExtra(EXTRA_PROMPT) != null) {
            deliver(intent.getStringExtra(EXTRA_PROMPT));
        }
    }

    @Override
    protected void onDestroy() {
        ServerBus.removeListener(this);
        // Never leave a bridge thread blocked on a prompt this activity can no
        // longer show. The gate in beginBiometric also releases the busy flag.
        if (biometricPrompt != null) {
            Biometric.Prompt prompt = biometricPrompt;
            biometricPrompt = null;
            try {
                prompt.cancel();
            } catch (Throwable ignored) {
            }
        }
        if (pendingBiometric != null) {
            PendingBiometric pending = pendingBiometric;
            pendingBiometric = null;
            try {
                pending.gate.onResult(false, "DSH 界面已关闭，未完成确认");
            } catch (Throwable ignored) {
            }
        }
        biometricBusy.set(false);
        // A finishing activity must not leave the bridge pointing at a dead Host
        // (the next request would invoke a destroyed window). releaseHost only
        // clears it when this instance is still the registered one, so a newly
        // created activity that already re-registered is not clobbered.
        BridgeServer.releaseHost(bridgeHost);
        bridgeHost = null;
        if (isFinishing()) {
            // "keepOn" is scoped to the DSH window; leaving the app ends it.
            keepScreenOnWanted = false;
        }
        if (live == this) live = null;
        super.onDestroy();
    }

    /** A prompt waiting for the app to come back to the foreground. */
    private static final class PendingBiometric {
        final String title;
        final String subtitle;
        final String description;
        final BridgeServer.BiometricCallback gate;

        PendingBiometric(String title, String subtitle, String description,
                BridgeServer.BiometricCallback gate) {
            this.title = title;
            this.subtitle = subtitle;
            this.description = description;
            this.gate = gate;
        }
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                getResources().getDisplayMetrics());
    }
}
