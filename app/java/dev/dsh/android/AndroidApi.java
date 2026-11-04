package dev.dsh.android;

import android.accessibilityservice.AccessibilityService;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.StatFs;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.lang.reflect.Field;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Android capabilities for plugins — the `/android/*` half of the control bridge.
 *
 * <p>{@link BridgeServer} owns the transport (loopback, per-boot token, JSON);
 * this class owns the Android side of each call. The contract is
 * {@code docs/ANDROID-API.md}; keep the two in step.
 *
 * <p>Two rules, learned from the rest of this app:
 *
 * <ul>
 *   <li><b>Never let an Android API kill the request.</b> Every failure that has
 *       a user-facing explanation leaves through {@link Failure}, which carries
 *       {@code error}/{@code hint}/{@code needs}. Only a genuinely unexpected
 *       exception reaches {@link #handle}'s catch-all.</li>
 *   <li><b>Ask for the exact permission a call needs and say what is missing.</b>
 *       Special permissions (write-settings, DND access) cannot be prompted at
 *       runtime; the response names the page to open instead of pretending.</li>
 * </ul>
 *
 * <p>Everything runs on bridge worker threads; only {@code Toast} and activity
 * starts are posted to the main looper.
 */
public final class AndroidApi {

    /** Bumped whenever the shape of the surface changes; plugins feature-detect on it. */
    public static final int API = 2;

    /** Notification channel for plugin-posted notifications (not the service one). */
    private static final String CHANNEL = "dsh-plugins";

    /** Low-importance sibling channel, used by {@code "silent":true}. */
    private static final String CHANNEL_QUIET = "dsh-plugins-quiet";

    /**
     * Plugin notification ids are offset by this on the app side so a plugin
     * cannot clobber the foreground-service notification (0x4453) or the ball's
     * (4210). Plugins see their own 1..999 id.
     */
    private static final int NOTIFICATION_BASE = 10000;

    private static final Set<Integer> PLUGIN_NOTIFICATIONS =
            Collections.synchronizedSet(new HashSet<Integer>());

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private AndroidApi() {
    }

    // ------------------------------------------------------------------ errors

    /** An error the caller can act on: message, hint, and the grant that is missing. */
    static final class Failure extends Exception {
        final String hint;
        final String need;

        Failure(String message) {
            this(message, null, null);
        }

        Failure(String message, String hint) {
            this(message, hint, null);
        }

        Failure(String message, String hint, String need) {
            super(message);
            this.hint = hint;
            this.need = need;
        }

        JSONObject json() {
            JSONObject answer = new JSONObject();
            try {
                answer.put("ok", false);
                answer.put("error", getMessage());
                if (hint != null) answer.put("hint", hint);
                if (need != null) answer.put("needs", need);
            } catch (Throwable ignored) {
            }
            return answer;
        }
    }

    // ----------------------------------------------------------------- routing

    /**
     * Execute one `/android/*` request.
     *
     * @param path  path only, query already stripped by the caller
     * @param query raw query string (`system=1&q=...`), or ""
     * @param body  parsed JSON body; never null
     * @param host  app callbacks (permission pages, keep-screen-on); may be null
     */
    public static JSONObject handle(String path, String query, JSONObject body, BridgeServer.Host host) {
        try {
            Context context = App.i();
            Map<String, String> params = parseQuery(query);

            if ("/android".equals(path)) return discovery();
            if ("/android/info".equals(path)) return info(context);
            if ("/android/permissions".equals(path)) {
                return body.has("request")
                        ? permissionsRequest(context, host, body)
                        : permissionsState(context);
            }
            if ("/android/clipboard".equals(path)) return clipboard(context, body);
            if ("/android/toast".equals(path)) return toast(context, body);
            if ("/android/vibrate".equals(path)) return vibrate(context, body);
            if ("/android/notify".equals(path)) {
                return body.has("title") || body.has("text") ? notifyPost(context, body) : notifyList(context);
            }
            if ("/android/notify/cancel".equals(path)) return notifyCancel(context, body);
            if ("/android/volume".equals(path)) {
                return body.length() > 0 ? volumeUpdate(context, body) : volumeState(context);
            }
            if ("/android/display".equals(path)) {
                return body.length() > 0 ? displayUpdate(context, host, body) : displayState(context);
            }
            if ("/android/dnd".equals(path)) {
                return body.has("filter") ? dndUpdate(context, body) : dndState(context);
            }
            if ("/android/apps".equals(path)) {
                return body.has("action") ? appsAct(context, body) : appsList(context, params);
            }
            if ("/android/share".equals(path)) return share(context, body);
            if ("/android/foreground".equals(path)) return foreground();
            if ("/android/screenshot".equals(path)) return screenshot(body);
            if ("/android/global".equals(path)) return global(body);
            if ("/android/open".equals(path)) return open(context, body);

            throw new Failure("未知的 Android 接口：" + path, "先 GET /android 拿到端点清单", null);
        } catch (Failure failure) {
            return failure.json();
        } catch (SecurityException error) {
            App.log("android api " + path + ": security: " + error);
            return fail("系统拒绝了这次调用：" + error.getMessage(),
                    "检查应用是否在前台，或在「安卓沙箱 → 权限」里补齐授权", null);
        } catch (Throwable error) {
            App.log("android api " + path + " failed: " + error);
            // Prefer the message the platform wrote; only fall back to the class
            // name when the exception carries nothing readable.
            String message = error.getMessage();
            if (message == null || message.trim().isEmpty()) message = error.toString();
            return fail("接口执行失败：" + message, null, null);
        }
    }

    // ------------------------------------------------------------- discovery/info

    private static JSONObject discovery() throws Exception {
        JSONObject answer = ok("Android API " + API);
        answer.put("api", API);
        answer.put("app", App.appVersion());
        answer.put("terminal", App.terminalVersion());
        JSONArray endpoints = new JSONArray();
        endpoints.put(endpoint("/android", "GET", "接口清单"));
        endpoints.put(endpoint("/android/info", "GET", "设备、应用、网络、电池、存储与能力矩阵"));
        endpoints.put(endpoint("/android/permissions", "GET/POST", "权限状态 / 打开授权页"));
        endpoints.put(endpoint("/android/clipboard", "GET/POST", "读/写文本剪贴板"));
        endpoints.put(endpoint("/android/toast", "POST", "轻提示"));
        endpoints.put(endpoint("/android/vibrate", "POST", "震动模式"));
        endpoints.put(endpoint("/android/notify", "GET/POST", "本应用通知：列出 / 发出"));
        endpoints.put(endpoint("/android/notify/cancel", "POST", "取消插件通知"));
        endpoints.put(endpoint("/android/volume", "GET/POST", "音量、铃声模式、媒体键"));
        endpoints.put(endpoint("/android/display", "GET/POST", "亮度、自动亮度、旋转、常亮"));
        endpoints.put(endpoint("/android/dnd", "GET/POST", "免打扰过滤级别"));
        endpoints.put(endpoint("/android/apps", "GET/POST", "已安装应用列表 / 启动·详情·卸载"));
        endpoints.put(endpoint("/android/share", "POST", "系统分享面板"));
        endpoints.put(endpoint("/android/foreground", "GET", "前台应用（无障碍）"));
        endpoints.put(endpoint("/android/screenshot", "POST", "截屏（Android 11+）"));
        endpoints.put(endpoint("/android/global", "POST", "全局动作"));
        endpoints.put(endpoint("/android/open", "POST", "打开 URL / 应用 / 系统设置页"));
        endpoints.put(endpoint("/android/biometric", "GET/POST", "生物识别状态 / 用户确认（API 28+）"));
        answer.put("endpoints", endpoints);
        return answer;
    }

    private static JSONObject endpoint(String path, String method, String summary) throws Exception {
        JSONObject item = new JSONObject();
        item.put("path", path);
        item.put("method", method);
        item.put("summary", summary);
        return item;
    }

    private static JSONObject info(Context context) {
        JSONObject root = new JSONObject();
        try {
            root.put("ok", true);
            root.put("api", API);
            root.put("app", appInfo(context));
            root.put("device", deviceInfo());
            root.put("screen", screenInfo(context));
            root.put("battery", batteryInfo(context));
            root.put("memory", memoryInfo(context));
            root.put("storage", storageInfo(context));
            root.put("network", networkInfo(context));
            JSONObject capabilities = capabilities(context);
            // Additive in 1.2.2 revision: the AI consent prompt can actually run
            // (Android 9+ and a biometric enrolled; see Biometric.status()).
            try {
                capabilities.put("biometric", Biometric.isReady());
            } catch (Throwable ignored) {
            }
            root.put("capabilities", capabilities);
        } catch (Throwable error) {
            App.log("android info: " + error);
            try {
                root.put("ok", true);
                root.put("api", API);
            } catch (Throwable ignored) {
            }
        }
        return root;
    }

    private static JSONObject appInfo(Context context) {
        JSONObject app = new JSONObject();
        try {
            app.put("package", context.getPackageName());
            app.put("version", App.appVersion());
            app.put("versionCode", App.appVersionCode());
            app.put("terminal", App.terminalVersion());
            app.put("hot", Payload.hotVersion());
        } catch (Throwable error) {
            App.log("android info app: " + error);
        }
        return app;
    }

    private static JSONObject deviceInfo() {
        JSONObject device = new JSONObject();
        try {
            device.put("brand", Build.BRAND);
            device.put("manufacturer", Build.MANUFACTURER);
            device.put("model", Build.MODEL);
            device.put("device", Build.DEVICE);
            device.put("product", Build.PRODUCT);
            device.put("android", Build.VERSION.RELEASE);
            device.put("sdk", Build.VERSION.SDK_INT);
            String[] abis = Build.SUPPORTED_ABIS;
            device.put("abi", abis != null && abis.length > 0 ? abis[0] : "");
            device.put("locale", Locale.getDefault().toLanguageTag());
            device.put("timezone", TimeZone.getDefault().getID());
            device.put("uptimeSeconds", SystemClock.elapsedRealtime() / 1000);
            String kernel = System.getProperty("os.version");
            if (kernel != null) device.put("kernel", kernel);
        } catch (Throwable error) {
            App.log("android info device: " + error);
        }
        return device;
    }

    /** Width/height/rotation/brightness — the two callers that need the subset share this. */
    private static JSONObject screenInfo(Context context) {
        JSONObject screen = new JSONObject();
        try {
            DisplayMetrics metrics = new DisplayMetrics();
            Display display = display(context);
            if (display != null) {
                display.getRealMetrics(metrics);
                screen.put("refreshRate", (double) display.getRefreshRate());
                int rotation = display.getRotation();
                screen.put("rotation", rotation);
                screen.put("rotationDegrees", rotation * 90);
            } else {
                metrics = context.getResources().getDisplayMetrics();
                screen.put("refreshRate", 0.0);
                screen.put("rotation", 0);
                screen.put("rotationDegrees", 0);
            }
            screen.put("width", metrics.widthPixels);
            screen.put("height", metrics.heightPixels);
            screen.put("densityDpi", metrics.densityDpi);
            screen.put("density", (double) metrics.density);
            screen.put("brightnessPercent", brightnessPercent(context));
            screen.put("autoBrightness", autoBrightness(context));
            // The desired value lives on MainActivity (it survives a window
            // rebuild and is re-applied in onResume); a stale static here used to
            // report true while the recreated window had lost the flag.
            screen.put("keepScreenOn", MainActivity.wantsKeepScreenOn());
        } catch (Throwable error) {
            App.log("android info screen: " + error);
        }
        return screen;
    }

    private static Display display(Context context) {
        try {
            WindowManager manager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            return manager == null ? null : manager.getDefaultDisplay();
        } catch (Throwable error) {
            return null;
        }
    }

    private static int brightnessMax(Context context) {
        int exact = brightnessMaxFromFramework();
        if (exact > 0) return exact;
        return brightnessMaxGuessed(context);
    }

    /**
     * The framework's configured maximum, read through public resource APIs first.
     *
     * <p>The resource lives in the framework's resource table, so the public
     * `getIdentifier` path resolves it on AOSP and on OEM ROMs without touching
     * the internal R class. Reflection is kept as a second try for the few builds
     * whose resource table refuses the name lookup.
     */
    private static int brightnessMaxFromFramework() {
        try {
            android.content.res.Resources system = android.content.res.Resources.getSystem();
            int id = system.getIdentifier("config_screenBrightnessSettingMaximum",
                    "integer", "android");
            if (id != 0) {
                int value = system.getInteger(id);
                if (value > 0) return value;
            }
        } catch (Throwable ignored) {
        }
        try {
            Class<?> integers = Class.forName("com.android.internal.R$integer");
            Field field = integers.getField("config_screenBrightnessSettingMaximum");
            int id = field.getInt(null);
            int value = android.content.res.Resources.getSystem().getInteger(id);
            if (value > 0) return value;
        } catch (Throwable ignored) {
        }
        return 0;
    }

    /** True when the maximum came from the framework instead of the fallback guess. */
    private static boolean brightnessMaxReliable() {
        return brightnessMaxFromFramework() > 0;
    }

    /**
     * Last resort for ROMs where the resource cannot be read. The scale is a
     * 2^n-1 range and the stored value can never exceed the real maximum, so the
     * guess is only trusted enough to avoid dividing by zero — GET
     * /android/display reports `brightness.estimated:true` alongside it. (The old
     * code guessed 255 whenever the raw value was <= 255, which made wide-range
     * devices read as 100% and writes land at a few percent.)
     */
    private static int brightnessMaxGuessed(Context context) {
        try {
            int raw = Settings.System.getInt(context.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, 128);
            if (raw > 2047) return 4095;
            if (raw > 1023) return 2047;
            if (raw > 255) return 1023;
        } catch (Throwable ignored) {
        }
        return 255;
    }

    private static int brightnessRaw(Context context) {
        try {
            return Settings.System.getInt(context.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, 128);
        } catch (Throwable error) {
            return 128;
        }
    }

    private static int brightnessPercent(Context context) {
        int max = brightnessMax(context);
        int raw = brightnessRaw(context);
        if (max <= 0) return 0;
        int percent = Math.round(raw * 100f / max);
        return Math.max(0, Math.min(100, percent));
    }

    private static boolean autoBrightness(Context context) {
        try {
            return Settings.System.getInt(context.getContentResolver(),
                    Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                    == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC;
        } catch (Throwable error) {
            return false;
        }
    }

    private static JSONObject batteryInfo(Context context) {
        JSONObject battery = new JSONObject();
        try {
            Intent intent = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (intent != null) {
                int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                battery.put("percent", level < 0 || scale <= 0 ? -1 : Math.round(level * 100f / scale));
                battery.put("status", batteryStatus(intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)));
                battery.put("plugged", batteryPlugged(intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)));
                int temperature = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
                battery.put("temperatureC", temperature == Integer.MIN_VALUE ? -1 : temperature / 10.0);
                battery.put("voltageMv", intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1));
                battery.put("health", batteryHealth(intent.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)));
                battery.put("charging", intExtra(intent, BatteryManager.EXTRA_STATUS,
                        BatteryManager.BATTERY_STATUS_UNKNOWN) == BatteryManager.BATTERY_STATUS_CHARGING
                        || intExtra(intent, BatteryManager.EXTRA_STATUS,
                        BatteryManager.BATTERY_STATUS_UNKNOWN) == BatteryManager.BATTERY_STATUS_FULL);
            }
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (power != null) battery.put("powerSave", power.isPowerSaveMode());
        } catch (Throwable error) {
            App.log("android info battery: " + error);
        }
        return battery;
    }

    private static int intExtra(Intent intent, String name, int fallback) {
        return intent.getIntExtra(name, fallback);
    }

    private static String batteryStatus(int status) {
        switch (status) {
            case BatteryManager.BATTERY_STATUS_CHARGING: return "charging";
            case BatteryManager.BATTERY_STATUS_DISCHARGING: return "discharging";
            case BatteryManager.BATTERY_STATUS_FULL: return "full";
            case BatteryManager.BATTERY_STATUS_NOT_CHARGING: return "not_charging";
            default: return "unknown";
        }
    }

    private static String batteryPlugged(int plugged) {
        switch (plugged) {
            case BatteryManager.BATTERY_PLUGGED_AC: return "ac";
            case BatteryManager.BATTERY_PLUGGED_USB: return "usb";
            case BatteryManager.BATTERY_PLUGGED_WIRELESS: return "wireless";
            default: return "none";
        }
    }

    private static String batteryHealth(int health) {
        switch (health) {
            case BatteryManager.BATTERY_HEALTH_GOOD: return "good";
            case BatteryManager.BATTERY_HEALTH_OVERHEAT: return "overheat";
            case BatteryManager.BATTERY_HEALTH_DEAD: return "dead";
            case BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE: return "over_voltage";
            case BatteryManager.BATTERY_HEALTH_COLD: return "cold";
            case BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE: return "failure";
            default: return "unknown";
        }
    }

    private static JSONObject memoryInfo(Context context) {
        JSONObject memory = new JSONObject();
        try {
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) return memory;
            ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
            manager.getMemoryInfo(info);
            memory.put("totalBytes", info.totalMem);
            memory.put("availBytes", info.availMem);
            memory.put("lowMemory", info.lowMemory);
            memory.put("thresholdBytes", info.threshold);
        } catch (Throwable error) {
            App.log("android info memory: " + error);
        }
        return memory;
    }

    private static JSONObject storageInfo(Context context) {
        JSONObject storage = new JSONObject();
        try {
            JSONObject internal = new JSONObject();
            StatFs internalStats = new StatFs(context.getFilesDir().getAbsolutePath());
            internal.put("totalBytes", internalStats.getTotalBytes());
            internal.put("freeBytes", internalStats.getAvailableBytes());
            storage.put("internal", internal);

            File shared = App.i().sharedStorage();
            JSONObject external = new JSONObject();
            if (shared != null) {
                external.put("path", shared.getAbsolutePath());
                try {
                    StatFs sharedStats = new StatFs(shared.getAbsolutePath());
                    external.put("totalBytes", sharedStats.getTotalBytes());
                    external.put("freeBytes", sharedStats.getAvailableBytes());
                } catch (Throwable ignored) {
                }
            } else {
                external.put("path", "");
            }
            storage.put("shared", external);
        } catch (Throwable error) {
            App.log("android info storage: " + error);
        }
        return storage;
    }

    private static JSONObject networkInfo(Context context) {
        JSONObject network = new JSONObject();
        try {
            network.put("connected", false);
            network.put("type", "none");
            network.put("metered", false);
            network.put("validated", false);
            network.put("vpn", false);
            network.put("ipv4", "");
            ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return network;
            Network active = manager.getActiveNetwork();
            NetworkCapabilities capabilities = active == null ? null : manager.getNetworkCapabilities(active);
            network.put("connected", capabilities != null);
            network.put("metered", manager.isActiveNetworkMetered());
            if (capabilities != null) {
                network.put("type", networkType(capabilities));
                network.put("validated", capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
                network.put("vpn", capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
            }
            network.put("ipv4", localIpv4());
        } catch (Throwable error) {
            App.log("android info network: " + error);
        }
        return network;
    }

    private static String networkType(NetworkCapabilities capabilities) {
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "ethernet";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return "vpn";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) return "bluetooth";
        return "other";
    }

    private static String localIpv4() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface candidate = interfaces.nextElement();
                if (!candidate.isUp() || candidate.isLoopback()) continue;
                Enumeration<InetAddress> addresses = candidate.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        String text = address.getHostAddress();
                        if (text != null && !text.startsWith("169.254.")) return text;
                    }
                }
            }
        } catch (Throwable ignored) {
        }
        return "";
    }

    private static JSONObject capabilities(Context context) {
        JSONObject capabilities = new JSONObject();
        try {
            NotificationManager notifications = (NotificationManager)
                    context.getSystemService(Context.NOTIFICATION_SERVICE);
            capabilities.put("accessibility", Assist.available());
            capabilities.put("overlay", Settings.canDrawOverlays(context));
            capabilities.put("writeSettings", Settings.System.canWrite(context));
            capabilities.put("dnd", notifications != null && notifications.isNotificationPolicyAccessGranted());
            capabilities.put("notifications", notifications == null || notifications.areNotificationsEnabled());
            capabilities.put("vibrate", hasVibrator(context));
            capabilities.put("clipboard", true);
            capabilities.put("share", true);
            capabilities.put("apps", true);
            capabilities.put("screenshot", Assist.available() && Build.VERSION.SDK_INT >= 30);
            capabilities.put("mediaKeys", true);
            capabilities.put("storage", App.i().hasStorageAccess());
            capabilities.put("microphone", context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED);

            JSONObject shizuku = new JSONObject();
            try {
                shizuku.put("installed", ShizukuBridge.available());
                shizuku.put("granted", ShizukuBridge.granted());
            } catch (Throwable ignored) {
                shizuku.put("installed", false);
                shizuku.put("granted", false);
            }
            capabilities.put("shizuku", shizuku);

            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            capabilities.put("batteryOptimizationIgnored", power != null
                    && power.isIgnoringBatteryOptimizations(context.getPackageName()));
        } catch (Throwable error) {
            App.log("android capabilities: " + error);
        }
        return capabilities;
    }

    private static boolean hasVibrator(Context context) {
        try {
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            return vibrator != null && vibrator.hasVibrator();
        } catch (Throwable error) {
            return false;
        }
    }

    // ------------------------------------------------------------------ permissions

    private static JSONObject permissionsState(Context context) throws Exception {
        JSONObject granted = capabilities(context);
        JSONObject hints = new JSONObject();
        if (!granted.optBoolean("accessibility")) {
            hints.put("accessibility", "设置 → 无障碍 → 已下载的服务 → DSH 手机助手");
        }
        if (!granted.optBoolean("overlay")) {
            hints.put("overlay", "设置 → 应用 → DSH → 显示在其他应用上层");
        }
        if (!granted.optBoolean("writeSettings")) {
            hints.put("writeSettings", "设置 → 应用 → DSH → 修改系统设置");
        }
        if (!granted.optBoolean("dnd")) {
            hints.put("dnd", "设置 → 通知 → 勿扰 → 授予 DSH 权限");
        }
        if (!granted.optBoolean("notifications")) {
            hints.put("notifications", "设置 → 应用 → DSH → 通知");
        }
        if (!granted.optBoolean("microphone")) {
            hints.put("microphone", "设置 → 应用 → DSH → 权限 → 麦克风");
        }
        if (!granted.optBoolean("batteryOptimizationIgnored")) {
            hints.put("battery", "设置 → 电池 → 应用耗电管理 → DSH → 不限制");
        }
        JSONObject answer = ok("权限状态");
        answer.put("granted", granted);
        answer.put("hints", hints);
        answer.put("api", API);
        return answer;
    }

    private static JSONObject permissionsRequest(Context context, BridgeServer.Host host, JSONObject body)
            throws Exception {
        String target = string(body, "request").trim().toLowerCase(Locale.ROOT);
        switch (target) {
            case "accessibility":
                if (host == null) throw new Failure("应用界面不可用", null, "accessibility");
                host.onAndroidPermission("accessibility");
                return permissionAsked(target, "请在「手机助手」里开启 DSH 无障碍服务");
            case "overlay":
                if (host == null) throw new Failure("应用界面不可用", null, "overlay");
                host.onAndroidPermission("overlay");
                return permissionAsked(target, "请允许 DSH 显示在其他应用上层");
            case "microphone":
                if (host == null) throw new Failure("应用界面不可用", null, "microphone");
                host.onAndroidPermission("microphone");
                return permissionAsked(target, "请允许 DSH 录音");
            case "shizuku":
                if (host == null) throw new Failure("应用界面不可用", null, "shizuku");
                host.onAndroidPermission("shizuku");
                return permissionAsked(target, "请在手机上确认 Shizuku 授权");
            case "write_settings":
                openSettings(context, new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
                        .setData(Uri.parse("package:" + context.getPackageName())));
                return permissionAsked(target, "请打开「允许修改系统设置」");
            case "dnd":
                openSettings(context, new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
                return permissionAsked(target, "请授予 DSH 勿扰访问权限");
            case "notification":
                if (Build.VERSION.SDK_INT >= 26) {
                    openSettings(context, new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName()));
                } else {
                    openSettings(context, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                            .setData(Uri.parse("package:" + context.getPackageName())));
                }
                return permissionAsked(target, "请在通知设置里打开 DSH");
            case "battery":
                openSettings(context, new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        .setData(Uri.parse("package:" + context.getPackageName())));
                return permissionAsked(target, "请允许 DSH 忽略电池优化");
            default:
                throw new Failure("不认识的权限请求：" + target,
                        "可选：accessibility / overlay / microphone / write_settings / dnd / notification / battery / shizuku",
                        null);
        }
    }

    private static JSONObject permissionAsked(String target, String message) throws Exception {
        JSONObject answer = ok(message);
        answer.put("requested", target);
        return answer;
    }

    // ------------------------------------------------------------------ clipboard

    private static JSONObject clipboard(Context context, JSONObject body) throws Exception {
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) throw new Failure("这台设备没有剪贴板服务");
        if (body.has("text")) {
            String text = string(body, "text");
            clipboard.setPrimaryClip(ClipData.newPlainText("DSH", text));
            return ok("已写入剪贴板");
        }
        String text = "";
        try {
            ClipData clip = clipboard.getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence content = clip.getItemAt(0).coerceToText(context);
                text = content == null ? "" : content.toString();
            }
        } catch (SecurityException error) {
            throw new Failure("系统拒绝了读取剪贴板",
                    "Android 10+ 只允许前台应用读剪贴板；写入不受影响", null);
        }
        JSONObject answer = ok("剪贴板");
        answer.put("text", text);
        return answer;
    }

    // ---------------------------------------------------------- toast/vibrate

    private static JSONObject toast(Context context, JSONObject body) throws Exception {
        final String text = required(body, "text");
        final boolean longToast = body.optBoolean("long", false);
        final Context app = context;
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                try {
                    Toast.makeText(app, text, longToast ? Toast.LENGTH_LONG : Toast.LENGTH_SHORT).show();
                } catch (Throwable error) {
                    App.log("android toast: " + error);
                }
            }
        });
        return ok("已提示");
    }

    private static JSONObject vibrate(Context context, JSONObject body) throws Exception {
        Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) {
            throw new Failure("这台设备没有可用的振动马达", null, null);
        }
        long[] pattern;
        JSONArray array = body.optJSONArray("pattern");
        if (array != null && array.length() > 0) {
            pattern = new long[array.length()];
            for (int i = 0; i < array.length(); i++) {
                pattern[i] = Math.max(0, array.optLong(i, 0));
            }
        } else {
            pattern = new long[]{Math.max(1, body.optLong("ms", 30))};
        }
        int amplitude = body.optInt("amplitude", VibrationEffect.DEFAULT_AMPLITUDE);
        if (amplitude < 1 || amplitude > 255) amplitude = VibrationEffect.DEFAULT_AMPLITUDE;
        VibrationEffect effect = pattern.length == 1
                ? VibrationEffect.createOneShot(pattern[0], amplitude)
                : VibrationEffect.createWaveform(pattern, -1);
        vibrator.vibrate(effect);
        long duration = 0;
        for (long part : pattern) duration += part;
        JSONObject answer = ok("已震动");
        answer.put("durationMs", duration);
        return answer;
    }

    // ------------------------------------------------------------------ notifications

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "插件通知",
                    NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("由 DSH 插件发出的通知");
            channel.setShowBadge(true);
            manager.createNotificationChannel(channel);
        }
        if (manager.getNotificationChannel(CHANNEL_QUIET) == null) {
            NotificationChannel quiet = new NotificationChannel(CHANNEL_QUIET, "插件通知（静默）",
                    NotificationManager.IMPORTANCE_LOW);
            quiet.setDescription("不发声的插件通知");
            quiet.setShowBadge(false);
            manager.createNotificationChannel(quiet);
        }
    }

    private static JSONObject notifyPost(Context context, JSONObject body) throws Exception {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) throw new Failure("这台设备没有通知服务");
        if (!manager.areNotificationsEnabled()) {
            throw new Failure("通知被系统关闭了", "设置 → 应用 → DSH → 通知，打开允许通知", "notification");
        }
        ensureChannel(context);

        String title = string(body, "title");
        String text = string(body, "text");
        if (title.isEmpty() && text.isEmpty()) throw new Failure("通知至少要有 title 或 text");
        boolean ongoing = body.optBoolean("ongoing", false);
        boolean silent = body.optBoolean("silent", false);
        int pluginId = body.has("id") ? body.optInt("id", 1) : 1;
        if (pluginId < 1 || pluginId > 999) {
            throw new Failure("通知 id 必须在 1–999 之间（收到 " + pluginId + "）",
                    "插件通知 id 只在这个区间；越界会碰到服务通知，所以不静默截断", null);
        }
        int notificationId = NOTIFICATION_BASE + pluginId;

        Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(context, 0, open, flags);

        Notification.Builder builder = new Notification.Builder(context, silent ? CHANNEL_QUIET : CHANNEL)
                .setSmallIcon(R.drawable.ic_whale_monochrome)
                .setContentTitle(title.isEmpty() ? "DSH" : title)
                .setContentText(text)
                .setContentIntent(pending)
                .setAutoCancel(!ongoing)
                .setOngoing(ongoing)
                .setOnlyAlertOnce(false)
                .setWhen(System.currentTimeMillis());
        if (body.has("progress")) {
            int progress = clamp(body.optInt("progress", 0), 0, 100);
            builder.setProgress(100, progress, false);
            builder.setOnlyAlertOnce(true);
        }
        manager.notify(notificationId, builder.build());
        PLUGIN_NOTIFICATIONS.add(notificationId);

        JSONObject answer = ok("已发出通知");
        answer.put("id", pluginId);
        return answer;
    }

    private static JSONObject notifyList(Context context) throws Exception {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) throw new Failure("这台设备没有通知服务");
        JSONArray items = new JSONArray();
        StatusBarNotification[] active = manager.getActiveNotifications();
        if (active != null) {
            for (StatusBarNotification status : active) {
                int id = status.getId();
                if (id < NOTIFICATION_BASE || id > NOTIFICATION_BASE + 999) continue;
                Notification notification = status.getNotification();
                Bundle extras = notification == null ? Bundle.EMPTY : notification.extras;
                JSONObject item = new JSONObject();
                item.put("id", id - NOTIFICATION_BASE);
                item.put("title", charSequence(extras.getCharSequence(Notification.EXTRA_TITLE)));
                item.put("text", charSequence(extras.getCharSequence(Notification.EXTRA_TEXT)));
                item.put("ongoing", notification != null && (notification.flags & Notification.FLAG_ONGOING_EVENT) != 0);
                item.put("postedMs", status.getPostTime());
                items.put(item);
            }
        }
        JSONObject answer = ok("当前有 " + items.length() + " 条插件通知");
        answer.put("notifications", items);
        answer.put("channel", CHANNEL);
        return answer;
    }

    private static JSONObject notifyCancel(Context context, JSONObject body) throws Exception {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) throw new Failure("这台设备没有通知服务");
        int cancelled = 0;
        if (body.optBoolean("all", false)) {
            // Ask the system, not just our own set: notifications posted before a
            // process restart are still up there, and the caller means "all of mine".
            Set<Integer> ids = new HashSet<Integer>();
            try {
                StatusBarNotification[] active = manager.getActiveNotifications();
                if (active != null) {
                    for (StatusBarNotification status : active) {
                        int id = status.getId();
                        if (id >= NOTIFICATION_BASE && id <= NOTIFICATION_BASE + 999) ids.add(id);
                    }
                }
            } catch (Throwable ignored) {
            }
            synchronized (PLUGIN_NOTIFICATIONS) {
                ids.addAll(PLUGIN_NOTIFICATIONS);
            }
            for (Integer id : ids) {
                manager.cancel(id);
                PLUGIN_NOTIFICATIONS.remove(id);
                cancelled++;
            }
        } else {
            if (!body.has("id")) {
                throw new Failure("要取消哪条通知？",
                        "带上 id（1–999），或 {\"all\":true} 取消全部插件通知", null);
            }
            int pluginId = body.optInt("id", -1);
            if (pluginId < 1 || pluginId > 999) {
                throw new Failure("通知 id 必须在 1–999 之间（收到 " + pluginId + "）", null, null);
            }
            int notificationId = NOTIFICATION_BASE + pluginId;
            manager.cancel(notificationId);
            if (PLUGIN_NOTIFICATIONS.remove(notificationId)) cancelled++;
        }
        return ok("已取消 " + cancelled + " 条");
    }

    private static String charSequence(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    // ------------------------------------------------------------------ volume

    private static int streamId(String name) {
        switch (name == null ? "" : name.toLowerCase(Locale.ROOT)) {
            case "music": case "media": return AudioManager.STREAM_MUSIC;
            case "ring": case "ringtone": return AudioManager.STREAM_RING;
            case "alarm": return AudioManager.STREAM_ALARM;
            case "notification": return AudioManager.STREAM_NOTIFICATION;
            case "call": case "voice": case "voice_call": return AudioManager.STREAM_VOICE_CALL;
            default: return -1;
        }
    }

    private static String streamName(int id) {
        switch (id) {
            case AudioManager.STREAM_MUSIC: return "music";
            case AudioManager.STREAM_RING: return "ring";
            case AudioManager.STREAM_ALARM: return "alarm";
            case AudioManager.STREAM_NOTIFICATION: return "notification";
            case AudioManager.STREAM_VOICE_CALL: return "call";
            default: return "unknown";
        }
    }

    private static JSONObject volumeState(Context context) throws Exception {
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) throw new Failure("这台设备没有音频服务");
        JSONObject answer = ok("音量");
        answer.put("ringerMode", ringerMode(audio.getRingerMode()));
        JSONObject streams = new JSONObject();
        int[] ids = {AudioManager.STREAM_MUSIC, AudioManager.STREAM_RING, AudioManager.STREAM_ALARM,
                AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_VOICE_CALL};
        for (int id : ids) {
            streams.put(streamName(id), stream(audio, id));
        }
        answer.put("streams", streams);
        return answer;
    }

    private static JSONObject stream(AudioManager audio, int id) throws Exception {
        int max = audio.getStreamMaxVolume(id);
        int index = audio.getStreamVolume(id);
        JSONObject item = new JSONObject();
        item.put("percent", max <= 0 ? 0 : Math.round(index * 100f / max));
        item.put("index", index);
        item.put("max", max);
        item.put("muted", audio.isStreamMute(id));
        return item;
    }

    private static String ringerMode(int mode) {
        switch (mode) {
            case AudioManager.RINGER_MODE_SILENT: return "silent";
            case AudioManager.RINGER_MODE_VIBRATE: return "vibrate";
            default: return "normal";
        }
    }

    private static JSONObject volumeUpdate(Context context, JSONObject body) throws Exception {
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) throw new Failure("这台设备没有音频服务");
        boolean changed = false;
        String message = "";

        if (body.has("stream")) {
            String name = string(body, "stream");
            int id = streamId(name);
            if (id < 0) throw new Failure("不认识的音频流：" + name, "可选 music / ring / alarm / notification / call");
            if (body.has("percent")) {
                int max = audio.getStreamMaxVolume(id);
                int percent = clamp(body.optInt("percent", 50), 0, 100);
                int index = Math.round(percent * max / 100f);
                try {
                    audio.setStreamVolume(id, index, body.optBoolean("showUi", false)
                            ? AudioManager.FLAG_SHOW_UI : 0);
                } catch (SecurityException error) {
                    throw new Failure("系统拒绝调整「" + name + "」音量",
                            "免打扰或设备策略可能限定了这一路音量", "dnd_access");
                }
                message = "已调整 " + name;
                changed = true;
            } else if (body.has("adjust")) {
                String adjust = string(body, "adjust").toLowerCase(Locale.ROOT);
                int direction;
                switch (adjust) {
                    case "up": direction = AudioManager.ADJUST_RAISE; break;
                    case "down": direction = AudioManager.ADJUST_LOWER; break;
                    case "mute": direction = AudioManager.ADJUST_MUTE; break;
                    case "unmute": direction = AudioManager.ADJUST_UNMUTE; break;
                    default: throw new Failure("不认识的音量调整：" + adjust, "可选 up / down / mute / unmute");
                }
                try {
                    audio.adjustStreamVolume(id, direction, 0);
                } catch (SecurityException error) {
                    throw new Failure("系统拒绝调整「" + name + "」音量",
                            "免打扰或设备策略可能限定了这一路音量", "dnd_access");
                }
                message = "已" + adjust + " " + name;
                changed = true;
            } else {
                throw new Failure("改音量需要 percent 或 adjust", "例如 {\"stream\":\"music\",\"percent\":30}");
            }
        }

        if (body.has("ringer")) {
            String mode = string(body, "ringer").toLowerCase(Locale.ROOT);
            int target;
            switch (mode) {
                case "normal": target = AudioManager.RINGER_MODE_NORMAL; break;
                case "vibrate": target = AudioManager.RINGER_MODE_VIBRATE; break;
                case "silent": target = AudioManager.RINGER_MODE_SILENT; break;
                default: throw new Failure("不认识的铃声模式：" + mode, "可选 normal / vibrate / silent");
            }
            try {
                audio.setRingerMode(target);
            } catch (SecurityException error) {
                throw new Failure("系统不允许切换铃声模式",
                        "免打扰或设备策略可能锁定了铃声模式；先检查 /android/dnd", null);
            }
            message = append(message, "铃声模式 " + mode);
            changed = true;
        }

        if (body.has("media")) {
            String action = string(body, "media").toLowerCase(Locale.ROOT);
            int code = mediaKey(action);
            if (code <= 0) throw new Failure("不认识的媒体键：" + action,
                    "可选 play / pause / toggle / next / previous / stop");
            audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code));
            audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code));
            message = append(message, "媒体键 " + action);
            changed = true;
        }

        if (!changed) {
            throw new Failure("没有要改的东西", "带上 stream/ringer/media 之一，或 GET /android/volume 读状态");
        }

        JSONObject answer = volumeState(context);
        answer.put("message", message);
        return answer;
    }

    private static int mediaKey(String action) {
        switch (action) {
            case "play": return KeyEvent.KEYCODE_MEDIA_PLAY;
            case "pause": return KeyEvent.KEYCODE_MEDIA_PAUSE;
            case "toggle": return KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
            case "next": return KeyEvent.KEYCODE_MEDIA_NEXT;
            case "previous": case "prev": return KeyEvent.KEYCODE_MEDIA_PREVIOUS;
            case "stop": return KeyEvent.KEYCODE_MEDIA_STOP;
            default: return -1;
        }
    }

    // ------------------------------------------------------------------ display

    private static JSONObject displayState(Context context) throws Exception {
        JSONObject brightness = new JSONObject();
        int max = brightnessMax(context);
        int raw = brightnessRaw(context);
        brightness.put("percent", max <= 0 ? 0 : Math.round(raw * 100f / max));
        brightness.put("raw", raw);
        brightness.put("max", max);
        // True when max came from the fallback guess, not config_screenBrightnessSettingMaximum.
        // Callers should treat percent/absolute writes as approximate in that case.
        brightness.put("estimated", !brightnessMaxReliable());
        brightness.put("auto", autoBrightness(context));
        brightness.put("writable", Settings.System.canWrite(context));

        JSONObject rotation = new JSONObject();
        boolean auto = true;
        int user = 0;
        int current = 0;
        try {
            auto = Settings.System.getInt(context.getContentResolver(),
                    Settings.System.ACCELEROMETER_ROTATION, 1) == 1;
            user = Settings.System.getInt(context.getContentResolver(), Settings.System.USER_ROTATION, 0);
        } catch (Throwable error) {
            App.log("android display rotation: " + error);
        }
        Display display = display(context);
        if (display != null) {
            try {
                current = display.getRotation();
            } catch (Throwable ignored) {
            }
        }
        rotation.put("auto", auto);
        rotation.put("user", user);
        rotation.put("current", current);
        rotation.put("degrees", current * 90);

        JSONObject answer = ok("显示");
        answer.put("brightness", brightness);
        answer.put("rotation", rotation);
        answer.put("screen", screenMetrics(context));
        answer.put("keepScreenOn", MainActivity.wantsKeepScreenOn());
        return answer;
    }

    private static JSONObject screenMetrics(Context context) {
        JSONObject screen = new JSONObject();
        try {
            DisplayMetrics metrics = new DisplayMetrics();
            Display display = display(context);
            if (display != null) display.getRealMetrics(metrics);
            else metrics = context.getResources().getDisplayMetrics();
            screen.put("width", metrics.widthPixels);
            screen.put("height", metrics.heightPixels);
            screen.put("densityDpi", metrics.densityDpi);
            screen.put("density", (double) metrics.density);
            if (display != null) screen.put("refreshRate", (double) display.getRefreshRate());
        } catch (Throwable error) {
            App.log("android display metrics: " + error);
        }
        return screen;
    }

    private static JSONObject displayUpdate(Context context, BridgeServer.Host host, JSONObject body)
            throws Exception {
        StringBuilder message = new StringBuilder();
        if (body.has("brightness") || body.has("auto")) requireWriteSettings(context);

        if (body.has("brightness")) {
            int percent = clamp(body.optInt("brightness", 50), 0, 100);
            int max = brightnessMax(context);
            try {
                Settings.System.putInt(context.getContentResolver(),
                        Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                Settings.System.putInt(context.getContentResolver(),
                        Settings.System.SCREEN_BRIGHTNESS, Math.round(percent * max / 100f));
            } catch (SecurityException error) {
                throw new Failure("系统拒绝写亮度设置", "「修改系统设置」权限可能被撤销了", "write_settings");
            }
            message.append("亮度 ").append(percent).append("%");
            if (!brightnessMaxReliable()) {
                // The fallback guessed the scale; say so instead of claiming a
                // precise percentage that may be wrong by an order of magnitude.
                message.append("（量程为估算值，可能不准）");
            }
        }
        if (body.has("auto")) {
            boolean auto = body.optBoolean("auto", true);
            try {
                Settings.System.putInt(context.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS_MODE,
                        auto ? Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
                                : Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
            } catch (SecurityException error) {
                throw new Failure("系统拒绝改自动亮度", "「修改系统设置」权限可能被撤销了", "write_settings");
            }
            message.append(message.length() == 0 ? "" : "、").append(auto ? "自动亮度开" : "自动亮度关");
        }
        if (body.has("rotation")) {
            requireWriteSettings(context);
            String rotation = string(body, "rotation").toLowerCase(Locale.ROOT);
            int degrees;
            switch (rotation) {
                case "auto": degrees = -1; break;
                case "portrait": case "0": degrees = 0; break;
                case "landscape": case "1": degrees = 1; break;
                case "reverse-portrait": case "2": degrees = 2; break;
                case "reverse-landscape": case "3": degrees = 3; break;
                default: throw new Failure("不认识的旋转：" + rotation,
                        "可选 auto / portrait / landscape / reverse-portrait / reverse-landscape", null);
            }
            try {
                if (degrees < 0) {
                    Settings.System.putInt(context.getContentResolver(),
                            Settings.System.ACCELEROMETER_ROTATION, 1);
                    message.append(message.length() == 0 ? "" : "、").append("旋转自动");
                } else {
                    Settings.System.putInt(context.getContentResolver(),
                            Settings.System.ACCELEROMETER_ROTATION, 0);
                    Settings.System.putInt(context.getContentResolver(), Settings.System.USER_ROTATION, degrees);
                    message.append(message.length() == 0 ? "" : "、").append("旋转 ").append(rotation);
                }
            } catch (SecurityException error) {
                throw new Failure("系统拒绝改旋转设置", "「修改系统设置」权限可能被撤销了", "write_settings");
            }
        }
        if (body.has("keepOn")) {
            if (host == null) throw new Failure("应用界面不可用，暂时不能改常亮");
            boolean on = body.optBoolean("keepOn", false);
            // MainActivity owns the desired value and re-applies it on resume.
            host.onScreenKeepOn(on);
            message.append(message.length() == 0 ? "" : "、").append(on ? "常亮" : "取消常亮");
        }
        if (message.length() == 0) {
            throw new Failure("没有要改的东西",
                    "带上 brightness / auto / rotation / keepOn 之一，或 GET /android/display 读状态");
        }
        JSONObject answer = displayState(context);
        answer.put("message", "已更新显示：" + message);
        return answer;
    }

    private static void requireWriteSettings(Context context) throws Failure {
        if (!Settings.System.canWrite(context)) {
            throw new Failure("改亮度或旋转需要「修改系统设置」权限",
                    "设置 → 应用 → DSH → 修改系统设置；或 POST /android/permissions {\"request\":\"write_settings\"}",
                    "write_settings");
        }
    }

    // ---------------------------------------------------------------------- dnd

    private static JSONObject dndState(Context context) throws Exception {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) throw new Failure("这台设备没有通知服务");
        boolean granted = manager.isNotificationPolicyAccessGranted();
        JSONObject answer = ok("免打扰");
        answer.put("granted", granted);
        answer.put("filter", dndFilter(manager.getCurrentInterruptionFilter()));
        return answer;
    }

    private static String dndFilter(int filter) {
        switch (filter) {
            case NotificationManager.INTERRUPTION_FILTER_ALL: return "all";
            case NotificationManager.INTERRUPTION_FILTER_PRIORITY: return "priority";
            case NotificationManager.INTERRUPTION_FILTER_ALARMS: return "alarms";
            case NotificationManager.INTERRUPTION_FILTER_NONE: return "none";
            default: return "unknown";
        }
    }

    private static JSONObject dndUpdate(Context context, JSONObject body) throws Exception {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) throw new Failure("这台设备没有通知服务");
        if (!manager.isNotificationPolicyAccessGranted()) {
            throw new Failure("没有勿扰访问权限",
                    "设置 → 通知 → 勿扰 → 授予 DSH 权限；或 POST /android/permissions {\"request\":\"dnd\"}",
                    "dnd_access");
        }
        String filter = string(body, "filter").toLowerCase(Locale.ROOT);
        int value;
        switch (filter) {
            case "all": value = NotificationManager.INTERRUPTION_FILTER_ALL; break;
            case "priority": value = NotificationManager.INTERRUPTION_FILTER_PRIORITY; break;
            case "alarms": value = NotificationManager.INTERRUPTION_FILTER_ALARMS; break;
            case "none": value = NotificationManager.INTERRUPTION_FILTER_NONE; break;
            default: throw new Failure("不认识的免打扰级别：" + filter, "可选 all / priority / alarms / none");
        }
        try {
            manager.setInterruptionFilter(value);
        } catch (SecurityException error) {
            throw new Failure("系统拒绝改免打扰", "勿扰访问权限可能被撤销了", "dnd_access");
        }
        JSONObject answer = dndState(context);
        answer.put("message", "免打扰已切换到 " + filter);
        return answer;
    }

    // --------------------------------------------------------------------- apps

    private static JSONObject appsList(Context context, Map<String, String> params) throws Exception {
        PackageManager packages = context.getPackageManager();
        if (packages == null) throw new Failure("这台设备没有包管理器");
        boolean includeSystem = "1".equals(params.get("system")) || "true".equalsIgnoreCase(params.get("system"));
        String query = params.get("q") == null ? "" : params.get("q").trim().toLowerCase(Locale.ROOT);
        int limit = clamp(parseInt(params.get("limit"), 200), 1, 1000);

        List<JSONObject> apps = new ArrayList<JSONObject>();
        int matched = 0;
        for (ApplicationInfo info : packages.getInstalledApplications(0)) {
            if (info == null) continue;
            boolean system = (info.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
            if (system && !includeSystem) continue;
            String label;
            try {
                label = charSequence(packages.getApplicationLabel(info));
            } catch (Throwable error) {
                label = info.packageName;
            }
            if (!query.isEmpty()
                    && !label.toLowerCase(Locale.ROOT).contains(query)
                    && !info.packageName.toLowerCase(Locale.ROOT).contains(query)) {
                continue;
            }
            matched++;
            if (apps.size() >= limit) continue;
            JSONObject item = new JSONObject();
            item.put("package", info.packageName);
            item.put("label", label);
            item.put("system", system);
            item.put("enabled", info.enabled);
            try {
                PackageInfo packageInfo = packages.getPackageInfo(info.packageName, 0);
                item.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
                if (Build.VERSION.SDK_INT >= 28) {
                    item.put("versionCode", packageInfo.getLongVersionCode());
                } else {
                    item.put("versionCode", packageInfo.versionCode);
                }
            } catch (Throwable ignored) {
            }
            apps.add(item);
        }
        Collections.sort(apps, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject left, JSONObject right) {
                return left.optString("label", "").compareToIgnoreCase(right.optString("label", ""));
            }
        });
        JSONArray array = new JSONArray();
        for (JSONObject app : apps) array.put(app);
        JSONObject answer = ok("共 " + matched + " 个应用");
        // `count` keeps its historical meaning (all matches, before `limit`);
        // `matched` spells that out and `returned` is the length of `apps`.
        answer.put("count", matched);
        answer.put("matched", matched);
        answer.put("returned", array.length());
        answer.put("apps", array);
        return answer;
    }

    private static JSONObject appsAct(Context context, JSONObject body) throws Exception {
        PackageManager packages = context.getPackageManager();
        if (packages == null) throw new Failure("这台设备没有包管理器");
        String action = string(body, "action").toLowerCase(Locale.ROOT);
        String packageName = string(body, "package").trim();
        if (packageName.isEmpty()) throw new Failure("缺少应用包名", "{\"action\":\"launch\",\"package\":\"com.tencent.mm\"}");
        String label = packageName;
        try {
            ApplicationInfo info = packages.getApplicationInfo(packageName, 0);
            label = charSequence(packages.getApplicationLabel(info));
        } catch (Throwable ignored) {
        }
        switch (action) {
            case "launch": case "open": {
                Intent intent = packages.getLaunchIntentForPackage(packageName);
                if (intent == null) throw new Failure("「" + label + "」没有可启动的界面");
                launch(context, intent);
                return ok("已启动 " + label);
            }
            case "details": case "appinfo": {
                launch(context, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(Uri.parse("package:" + packageName)));
                return ok("已打开「" + label + "」的应用信息");
            }
            case "uninstall": case "delete": {
                launch(context, new Intent(Intent.ACTION_DELETE)
                        .setData(Uri.parse("package:" + packageName)));
                return ok("请在系统弹窗里确认卸载「" + label + "」");
            }
            default:
                throw new Failure("不认识的应用操作：" + action, "可选 launch / details / uninstall");
        }
    }

    private static void launch(Context context, Intent intent) throws Failure {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
        } catch (android.content.ActivityNotFoundException error) {
            throw new Failure("这台设备没有能处理该请求的界面");
        } catch (SecurityException error) {
            throw new Failure("系统拒绝了打开界面的请求（应用在后台？）",
                    "Android 10+ 限制后台拉起界面；打开悬浮窗权限后通常可用", "overlay");
        }
    }

    private static void openSettings(Context context, Intent intent) throws Failure {
        launch(context, intent);
    }

    // --------------------------------------------------------------------- share

    private static JSONObject share(Context context, JSONObject body) throws Exception {
        String text = required(body, "text");
        String title = string(body, "title");
        Intent send = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, text);
        if (!title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        Intent chooser = Intent.createChooser(send, title.isEmpty() ? "分享" : title)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launch(context, chooser);
        return ok("已打开分享面板");
    }

    // ------------------------------------------------------------ a11y surfaces

    private static JSONObject foreground() throws Exception {
        requireAccessibility();
        JSONObject answer = ok("前台应用");
        JSONObject current = Assist.foreground();
        answer.put("package", current.optString("package", ""));
        answer.put("app", current.optString("app", ""));
        answer.put("class", current.optString("class", ""));
        answer.put("own", current.optBoolean("own", false));
        return answer;
    }

    private static JSONObject screenshot(JSONObject body) throws Exception {
        requireAccessibility();
        if (Build.VERSION.SDK_INT < 30) {
            throw new Failure("截屏需要 Android 11（API 30）及以上", null, "android11");
        }
        int quality = clamp(body.optInt("quality", 75), 1, 100);
        int maxWidth = clamp(body.optInt("maxWidth", 1080), 240, 4096);
        int maxHeight = clamp(body.optInt("maxHeight", 2400), 240, 4096);
        JSONObject captured;
        try {
            captured = Assist.screenshot(quality, maxWidth, maxHeight);
        } catch (Assist.ScreenshotFailure error) {
            throw screenshotFailure(error.code, error.getMessage());
        }
        captured.put("ok", true);
        return captured;
    }

    /** Map the accessibility screenshot error code to the action that fixes it. */
    private static Failure screenshotFailure(int code, String message) {
        String error = message == null || message.trim().isEmpty() ? "截屏失败，请重试" : message;
        if (code == AccessibilityService.ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS) {
            return new Failure(error, "在 设置 → 安卓沙箱 → 手机助手 里关闭再打开无障碍服务", "accessibility");
        }
        if (code == AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT) {
            return new Failure(error, "系统限制截屏频率，等一秒再试", null);
        }
        return new Failure(error, null, null);
    }

    private static void requireAccessibility() throws Failure {
        if (!Assist.available()) {
            throw new Failure("无障碍服务未开启：设置 → 安卓沙箱 → 手机助手",
                    "点开「手机助手」开启 DSH 无障碍服务；截屏、前台应用、全局动作都依赖它", "accessibility");
        }
    }

    // -------------------------------------------------------------------- global

    private static JSONObject global(JSONObject body) throws Exception {
        requireAccessibility();
        String action = string(body, "action").toLowerCase(Locale.ROOT);
        int code;
        String label;
        switch (action) {
            case "back": code = AccessibilityService.GLOBAL_ACTION_BACK; label = "返回"; break;
            case "home": code = AccessibilityService.GLOBAL_ACTION_HOME; label = "主屏"; break;
            case "recents": case "recent": code = AccessibilityService.GLOBAL_ACTION_RECENTS; label = "最近任务"; break;
            case "notifications": case "shade": code = AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS; label = "通知栏"; break;
            case "lock":
                requireSdk(28, "锁屏");
                code = AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN;
                label = "锁屏";
                break;
            case "quick_settings": code = AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS; label = "快捷设置"; break;
            case "power_dialog": case "power": code = AccessibilityService.GLOBAL_ACTION_POWER_DIALOG; label = "电源菜单"; break;
            case "split_screen": code = AccessibilityService.GLOBAL_ACTION_TOGGLE_SPLIT_SCREEN; label = "分屏"; break;
            case "screenshot":
                requireSdk(30, "系统截屏");
                code = AccessibilityService.GLOBAL_ACTION_TAKE_SCREENSHOT;
                label = "截屏";
                break;
            case "dismiss_notifications":
                requireSdk(31, "收起通知栏");
                code = AccessibilityService.GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE;
                label = "收起通知栏";
                break;
            default:
                throw new Failure("不认识的全局动作：" + action,
                        "可选 back / home / recents / notifications / lock / quick_settings / power_dialog / split_screen / screenshot / dismiss_notifications",
                        null);
        }
        Assist.globalAction(code, label);
        return ok("已执行 " + action);
    }

    private static void requireSdk(int sdk, String what) throws Failure {
        if (Build.VERSION.SDK_INT < sdk) {
            // The `needs` value names the Android release the action needs, not
            // just "android11": dismiss_notifications is Android 12 / API 31.
            String need = sdk >= 31 ? "android12" : sdk >= 30 ? "android11" : null;
            throw new Failure(what + "需要 Android API " + sdk + " 及以上（当前 " + Build.VERSION.SDK_INT + "）",
                    null, need);
        }
    }

    // ---------------------------------------------------------------------- open

    private static JSONObject open(Context context, JSONObject body) throws Exception {
        if (body.has("url")) {
            String url = string(body, "url").trim();
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!"http".equals(scheme) && !"https".equals(scheme)
                    && !"mailto".equals(scheme) && !"tel".equals(scheme)) {
                throw new Failure("只允许 http / https / mailto / tel 链接",
                        "别的 scheme 会交给任意应用处理，桥不转发", null);
            }
            launch(context, new Intent(Intent.ACTION_VIEW, uri));
            return ok("已打开 " + url);
        }
        if (body.has("package")) {
            return appsAct(context, new JSONObject()
                    .put("action", "launch")
                    .put("package", string(body, "package")));
        }
        if (body.has("settings")) {
            String page = string(body, "settings").toLowerCase(Locale.ROOT);
            String label = openSettingsPage(context, page);
            return ok("已打开 " + label);
        }
        throw new Failure("要打开什么？", "带上 url / package / settings 之一",
                null);
    }

    private static String openSettingsPage(Context context, String page) throws Exception {
        String packageName = context.getPackageName();
        Intent intent;
        String label;
        switch (page) {
            case "home": intent = new Intent(Settings.ACTION_SETTINGS); label = "系统设置"; break;
            case "wifi": case "wlan": intent = new Intent(Settings.ACTION_WIFI_SETTINGS); label = "WLAN 设置"; break;
            case "bluetooth": intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS); label = "蓝牙设置"; break;
            case "data": intent = new Intent(Settings.ACTION_WIRELESS_SETTINGS); label = "移动网络设置"; break;
            case "airplane": intent = new Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS); label = "飞行模式设置"; break;
            case "location": intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS); label = "位置信息设置"; break;
            case "display": intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS); label = "显示设置"; break;
            case "sound": intent = new Intent(Settings.ACTION_SOUND_SETTINGS); label = "声音设置"; break;
            case "battery": intent = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS); label = "电池设置"; break;
            case "app": intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + packageName)); label = "DSH 应用信息"; break;
            case "notification": intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName); label = "DSH 通知设置"; break;
            case "accessibility": intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS); label = "无障碍设置"; break;
            case "overlay": intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                    .setData(Uri.parse("package:" + packageName)); label = "悬浮窗权限"; break;
            case "write_settings": intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
                    .setData(Uri.parse("package:" + packageName)); label = "修改系统设置权限"; break;
            case "dnd": intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS); label = "勿扰权限"; break;
            case "storage": intent = new Intent(Settings.ACTION_INTERNAL_STORAGE_SETTINGS); label = "存储设置"; break;
            case "developer": intent = new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS); label = "开发者选项"; break;
            default:
                throw new Failure("不认识的设置页：" + page,
                        "可选 home / wifi / bluetooth / data / airplane / location / display / sound / battery / app / notification / accessibility / overlay / write_settings / dnd / storage / developer",
                        null);
        }
        openSettings(context, intent);
        return label;
    }

    // ------------------------------------------------------------------ plumbing

    private static Map<String, String> parseQuery(String query) {
        Map<String, String> params = new HashMap<String, String>();
        if (query == null || query.isEmpty()) return params;
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) continue;
            int equals = pair.indexOf('=');
            String key = equals < 0 ? pair : pair.substring(0, equals);
            String value = equals < 0 ? "" : pair.substring(equals + 1);
            try {
                key = java.net.URLDecoder.decode(key, "UTF-8");
                value = java.net.URLDecoder.decode(value, "UTF-8");
            } catch (Throwable ignored) {
            }
            params.put(key, value);
        }
        return params;
    }

    private static int parseInt(String value, int fallback) {
        if (value == null || value.isEmpty()) return fallback;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            return fallback;
        }
    }

    private static JSONObject ok(String message) throws Exception {
        JSONObject answer = new JSONObject();
        answer.put("ok", true);
        answer.put("message", message);
        return answer;
    }

    private static JSONObject fail(String error, String hint, String need) {
        JSONObject answer = new JSONObject();
        try {
            answer.put("ok", false);
            answer.put("error", error);
            if (hint != null) answer.put("hint", hint);
            if (need != null) answer.put("needs", need);
        } catch (Throwable ignored) {
        }
        return answer;
    }

    private static String string(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) return "";
        Object value = object.opt(key);
        return value == null ? "" : String.valueOf(value);
    }

    private static String required(JSONObject body, String key) throws Failure {
        String value = string(body, key);
        if (value.isEmpty()) {
            throw new Failure("缺少参数 " + key, "请求体里要带 " + key, null);
        }
        return value;
    }

    private static String append(String current, String part) {
        return TextUtils.isEmpty(current) ? part : current + "、" + part;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
