package dev.dsh.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
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

    private FrameLayout root;
    private WebView web;
    private Panel panel;
    private LinearLayout setup;
    private LinearLayout loading;
    private TextView setupText;
    private ProgressBar setupBar;
    private TextView banner;
    private Button menuButton;

    private ValueCallback<Uri[]> fileCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean panelOpen;
    private String loadedUrl;
    /** True once the harness page has actually painted, not merely started loading. */
    private boolean pageReady;
    /** True once the server has been asked to start at least once this launch. */
    private boolean startRequested;
    private ServerBus.State lastState;

    /** The activity a service can hand text to; null once it is gone. */
    private static MainActivity live;
    /** Prompt waiting for a loaded page. */
    private static String pendingPrompt;
    private static final String EXTRA_PROMPT = "dsh.prompt";

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

        ShizukuBridge.addPermissionListener();
        BridgeServer.start(new BridgeServer.Host() {
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
        });

        requestStorageAccess();

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
                && state != ServerBus.State.ERROR;
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
                Payload.install(this, (done, total, detail) -> handler.post(() -> {
                    int permille = total > 0 ? (int) Math.min(1000, done * 1000 / total) : 0;
                    setupBar.setProgress(permille);
                    setupText.setText(String.format(java.util.Locale.US,
                            "%d%%  %s", permille / 10,
                            detail == null ? "解包中…" : detail));
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
        if (state == ServerBus.State.RUNNING && url != null && !url.equals(loadedUrl)) {
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

    /** The window colour for the current system theme. */
    private int bootColor() {
        return getResources().getColor(R.color.boot_background);
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

    private void injectBridge() {
        App app = App.i();
        String script = "window.DshAndroid={version:1"
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
        boolean running = state == ServerBus.State.RUNNING;
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
        if (live == this) live = null;
        super.onDestroy();
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                getResources().getDisplayMetrics());
    }
}
