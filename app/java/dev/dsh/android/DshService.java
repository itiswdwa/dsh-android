package dev.dsh.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Foreground service that keeps the PRoot/node Web server alive while the app
 * is backgrounded.
 *
 * Android otherwise freezes and then reaps the process, which would kill the
 * harness mid-turn, so the server is owned by a service with an ongoing
 * notification that also acts as the "return to UI" affordance.
 */
public final class DshService extends Service implements ServerBus.Listener {

    public static final String ACTION_ENSURE = "dev.dsh.android.ENSURE";
    public static final String ACTION_STOP = "dev.dsh.android.STOP";

    private static final String CHANNEL = "dsh-server";
    private static final int NOTIFICATION_ID = 0x4453;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private android.os.PowerManager.WakeLock wakeLock;
    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            if (App.i().prefs.getBoolean("autoRestart", true)
                    && !ServerBus.running()
                    && Payload.isReady()) {
                App.log("watchdog: restarting server");
                ServerBus.start(DshService.this, Distros.active(DshService.this),
                        App.i().prefs.getString("apiKey", ""));
            }
            handler.postDelayed(this, 15000);
        }
    };

    public static void ensure(Context ctx) {
        Intent intent = new Intent(ctx, DshService.class).setAction(ACTION_ENSURE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    public static void stopServer(Context ctx) {
        Intent intent = new Intent(ctx, DshService.class).setAction(ACTION_STOP);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        ServerBus.addListener(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification("正在准备…"));
        String action = intent == null ? ACTION_ENSURE : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            handler.removeCallbacks(watchdog);
            releaseWakeLock();
            ServerBus.stop();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        acquireWakeLock();
        if (Payload.isReady()) {
            if (!ServerBus.running()) {
                ServerBus.start(this, Distros.active(this), App.i().prefs.getString("apiKey", ""));
            }
            handler.removeCallbacks(watchdog);
            handler.postDelayed(watchdog, 15000);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(watchdog);
        releaseWakeLock();
        ServerBus.removeListener(this);
        super.onDestroy();
    }

    /**
     * Keep the CPU running while the sandbox serves a session.
     *
     * A phone that sleeps freezes the PRoot process tree, which would break a
     * harness turn that is mid-flight. The lock is partial (no screen, no
     * brightness) and is released the moment the user stops the server, so the
     * only cost is idle battery while the harness is actually up.
     */
    private void acquireWakeLock() {
        if (!App.i().prefs.getBoolean("keepAwake", true)) return;
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            android.os.PowerManager manager = getSystemService(android.os.PowerManager.class);
            if (manager == null) return;
            wakeLock = manager.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "dsh:server");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(60 * 60 * 1000L);
        } catch (Throwable error) {
            App.log("wake lock: " + error);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Throwable ignored) {
        }
        wakeLock = null;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onServerState() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(describe()));
        }
    }

    private String describe() {
        switch (ServerBus.state()) {
            case RUNNING:
                return "运行中 · 127.0.0.1:" + App.i().activePort();
            case STARTING:
                return "启动中…";
            case ERROR:
                return "启动失败（点开查看日志）";
            default:
                return "已停止";
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getActivity(this, 0, open, piFlags);

        // 停止/启动：通知栏里直接能做的两件事。以前只有一条常驻通知，想停服务得
        // 先回应用、再开面板、再点一次 —— 通知本来就该承担它自己那一步。
        Intent stop = new Intent(this, DshService.class).setAction(ACTION_STOP);
        Intent start = new Intent(this, DshService.class).setAction(ACTION_ENSURE);
        PendingIntent stopIntent = PendingIntent.getService(this, 2, stop, piFlags);
        PendingIntent startIntent = PendingIntent.getService(this, 3, start, piFlags);

        boolean running = ServerBus.state() == ServerBus.State.RUNNING;
        Notification.Action toggle = new Notification.Action.Builder(
                android.graphics.drawable.Icon.createWithResource(this,
                        running ? android.R.drawable.ic_menu_close_clear_cancel : android.R.drawable.ic_media_play),
                running ? "停止" : "启动",
                running ? stopIntent : startIntent).build();

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return builder
                .setContentTitle("DeepSeek Harness")
                .setContentText(text)
                // The product mark rather than a generic sync glyph: the status
                // bar is the one place this app is visible all day.
                .setSmallIcon(R.drawable.ic_whale_monochrome)
                .setOngoing(running || ServerBus.state() == ServerBus.State.STARTING)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .addAction(toggle)
                .setContentIntent(pending)
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                "Harness 服务", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("保持 DeepSeek Harness 的本地服务运行");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}
