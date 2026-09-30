package dev.dsh.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Locale;

/**
 * The floating whale: a shortcut from "I want something done on this phone" to
 * the agent, from anywhere.
 *
 *   tap        dictate (speech to text), then send
 *   long-press type it instead
 *   drag       move it; it settles against the nearest edge
 *
 * Either way the text goes into a new session in the harness, which is where the
 * phone-control tools live — the ball is a mouth, not a second brain.
 *
 * It is a foreground service with a TYPE_APPLICATION_OVERLAY window: the overlay
 * permission is the one thing a user has to grant, and there is no way around
 * asking for it (Settings.ACTION_MANAGE_OVERLAY_PERMISSION).
 */
public final class BallService extends Service {

    private static final String CHANNEL = "assistant";
    private static final int NOTIFICATION_ID = 4210;

    private static volatile boolean running;

    private WindowManager windowManager;
    private WindowManager.LayoutParams ballParams;
    private WindowManager.LayoutParams panelParams;
    private View ball;
    private View panel;
    private EditText input;
    private TextView status;

    private SpeechRecognizer recognizer;
    private boolean listening;
    private final Handler handler = new Handler(Looper.getMainLooper());

    public static boolean isRunning() {
        return running;
    }

    public static void start(Context ctx) {
        if (!Assist.canOverlay(ctx) || running) return;
        ctx.startForegroundService(new Intent(ctx, BallService.class));
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, BallService.class));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        startForeground(NOTIFICATION_ID, notification());
        showBall();
        App.log("floating ball shown");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        stopListening();
        hidePanel();
        if (ball != null) {
            try {
                windowManager.removeView(ball);
            } catch (Exception ignored) {
            }
            ball = null;
        }
        App.log("floating ball hidden");
        super.onDestroy();
    }

    // ------------------------------------------------------------ notification

    private Notification notification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL,
                    getString(R.string.ball_channel), NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setDescription(getString(R.string.ball_channel_hint));
            manager.createNotificationChannel(channel);
        }
        PendingIntent open = PendingIntent.getActivity(this, 1,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_whale_monochrome)
                .setContentTitle(getString(R.string.ball_running))
                .setContentText(getString(R.string.ball_running_hint))
                .setContentIntent(open)
                .setOngoing(true)
                .build();
    }

    // -------------------------------------------------------------------- ball

    private void showBall() {
        int size = dp(58);
        FrameLayout view = new FrameLayout(this);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(getResources().getColor(R.color.ball_fill));
        circle.setStroke(dp(1), getResources().getColor(R.color.ball_stroke));
        view.setBackground(circle);

        // The brand mark, white on the fill — the same whale as the launcher icon.
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.ic_whale_monochrome);
        FrameLayout.LayoutParams markParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        int inset = dp(9);
        markParams.setMargins(inset, inset, inset, inset);
        view.addView(mark, markParams);
        view.setAlpha(0.92f);

        ballParams = new WindowManager.LayoutParams(size, size,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        ballParams.gravity = Gravity.TOP | Gravity.START;
        ballParams.x = dp(12);
        ballParams.y = dp(220);
        view.setOnTouchListener(new DragListener());
        windowManager.addView(view, ballParams);
        ball = view;
    }

    /** Drag to move, tap to dictate, long-press to type. */
    private final class DragListener implements View.OnTouchListener {
        private int startX, startY;
        private float touchX, touchY;
        private boolean dragging;
        private final Runnable longPress = new Runnable() {
            @Override
            public void run() {
                if (!dragging) {
                    dragging = true;   // consumes this gesture: no tap on release
                    openPanel(false);
                }
            }
        };

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    startX = ballParams.x;
                    startY = ballParams.y;
                    touchX = event.getRawX();
                    touchY = event.getRawY();
                    dragging = false;
                    view.setAlpha(1f);
                    handler.postDelayed(longPress, ViewConfiguration.getLongPressTimeout());
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    int dx = (int) (event.getRawX() - touchX);
                    int dy = (int) (event.getRawY() - touchY);
                    if (!dragging && Math.hypot(dx, dy) > dp(8)) {
                        dragging = true;
                        handler.removeCallbacks(longPress);
                    }
                    if (dragging) {
                        ballParams.x = startX + dx;
                        ballParams.y = startY + dy;
                        try {
                            windowManager.updateViewLayout(view, ballParams);
                        } catch (Exception ignored) {
                        }
                    }
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    handler.removeCallbacks(longPress);
                    view.setAlpha(0.92f);
                    if (!dragging) {
                        openPanel(true);
                    } else {
                        settleAgainstEdge();
                    }
                    return true;
                default:
                    return false;
            }
        }
    }

    /** Leave the ball at the side it was dropped nearest, so it stops covering the middle. */
    private void settleAgainstEdge() {
        int screen = getResources().getDisplayMetrics().widthPixels;
        int target = ballParams.x + dp(29) > screen / 2 ? screen - dp(70) : dp(12);
        ballParams.x = target;
        try {
            windowManager.updateViewLayout(ball, ballParams);
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------- panel

    private void openPanel(boolean listen) {
        if (panel != null) {
            if (listen) startListening();
            return;
        }
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable card = new GradientDrawable();
        card.setCornerRadius(dp(18));
        card.setColor(getResources().getColor(R.color.panel_fill));
        card.setStroke(dp(1), getResources().getColor(R.color.panel_stroke));
        column.setBackground(card);
        column.setPadding(dp(14), dp(12), dp(14), dp(12));

        status = new TextView(this);
        status.setTextColor(getResources().getColor(R.color.panel_hint));
        status.setTextSize(12);
        status.setText(listen ? getString(R.string.ball_listening) : getString(R.string.ball_prompt));
        column.addView(status);

        input = new EditText(this);
        input.setHint(R.string.ball_input_hint);
        input.setTextColor(getResources().getColor(R.color.panel_text));
        input.setHintTextColor(getResources().getColor(R.color.panel_hint));
        input.setTextSize(15);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setMinLines(2);
        input.setMaxLines(4);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        inputParams.topMargin = dp(8);
        column.addView(input, inputParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsParams.topMargin = dp(10);

        Button mic = new Button(this);
        mic.setText(R.string.ball_speak);
        mic.setOnClickListener(v -> {
            if (listening) {
                stopListening();
            } else {
                startListening();
            }
        });
        actions.addView(mic);

        Button send = new Button(this);
        send.setText(R.string.ball_send);
        send.setOnClickListener(v -> submit(input.getText().toString()));
        LinearLayout.LayoutParams sendParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        sendParams.leftMargin = dp(8);
        actions.addView(send, sendParams);
        column.addView(actions, actionsParams);

        Button close = new Button(this);
        close.setText(R.string.ball_close);
        close.setOnClickListener(v -> hidePanel());
        column.addView(close);

        panel = column;
        panelParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        panelParams.gravity = Gravity.BOTTOM;
        panelParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        try {
            windowManager.addView(panel, panelParams);
        } catch (Exception error) {
            App.log("ball panel: " + error);
            panel = null;
            return;
        }
        if (listen) startListening();
        else input.requestFocus();
    }

    private void hidePanel() {
        stopListening();
        if (panel == null) return;
        View view = panel;
        panel = null;
        input = null;
        status = null;
        try {
            windowManager.removeView(view);
        } catch (Exception ignored) {
        }
    }

    private void submit(String text) {
        String value = text == null ? "" : text.trim();
        if (value.isEmpty()) {
            if (status != null) status.setText(R.string.ball_empty);
            return;
        }
        if (status != null) status.setText(getString(R.string.ball_sent));
        hidePanel();
        Assist.deliver(value);
    }

    // ------------------------------------------------------------------- voice

    private void startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            if (status != null) status.setText(R.string.ball_no_voice);
            return;
        }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            if (status != null) status.setText(R.string.ball_no_mic);
            return;
        }
        if (recognizer == null) recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new Listener());
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toString());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        listening = true;
        if (status != null) status.setText(R.string.ball_listening);
        try {
            recognizer.startListening(intent);
        } catch (Exception error) {
            listening = false;
            if (status != null) status.setText(String.valueOf(error.getMessage()));
        }
    }

    private void stopListening() {
        listening = false;
        if (recognizer != null) {
            try {
                recognizer.stopListening();
            } catch (Exception ignored) {
            }
        }
    }

    private final class Listener implements RecognitionListener {
        @Override
        public void onPartialResults(android.os.Bundle partial) {
            String text = first(partial);
            if (text != null && input != null) input.setText(text);
        }

        @Override
        public void onResults(android.os.Bundle results) {
            listening = false;
            String text = first(results);
            if (text != null && input != null) {
                input.setText(text);
                input.setSelection(text.length());
            }
            // Left in the box rather than sent: a mis-heard sentence should cost
            // one look, not one wrong instruction to an agent that acts.
            if (status != null) status.setText(R.string.ball_review);
        }

        @Override
        public void onError(int code) {
            listening = false;
            if (status != null) {
                status.setText(code == SpeechRecognizer.ERROR_NO_MATCH
                        || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                        ? getString(R.string.ball_heard_nothing)
                        : getString(R.string.ball_voice_failed) + " (" + code + ")");
            }
        }

        private String first(android.os.Bundle bundle) {
            if (bundle == null) return null;
            ArrayList<String> values = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (values == null || values.isEmpty()) return null;
            return values.get(0);
        }

        @Override public void onReadyForSpeech(android.os.Bundle params) { }
        @Override public void onBeginningOfSpeech() { }
        @Override public void onRmsChanged(float rms) { }
        @Override public void onBufferReceived(byte[] buffer) { }
        @Override public void onEndOfSpeech() { }
        @Override public void onEvent(int type, android.os.Bundle params) { }
    }

    private int dp(int value) {
        return (int) android.util.TypedValue.applyDimension(
                android.util.TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }
}
