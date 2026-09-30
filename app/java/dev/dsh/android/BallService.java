package dev.dsh.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.XmlResourceParser;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.PixelFormat;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.VectorDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.text.InputType;
import android.util.Xml;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.xmlpull.v1.XmlPullParser;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Locale;

/**
 * The floating whale: a mouth for the agent, always one gesture away.
 *
 *   hold   talk (push to talk — it records while you hold it, stops when you let go)
 *   tap    an input box appears beside it, for typing instead of speaking
 *   drag   move it; it settles against the nearest edge
 *
 * A bubble above the whale says what just happened — listening, what was heard,
 * sent, or that the mic is missing — because a ball that silently swallows a
 * sentence is worse than no ball at all. The bubble lives in the same window as
 * the ball, so it follows it around the screen.
 *
 * Size and picture are configuration, not code (see {@link #PREF_SIZE} and
 * {@link #PREF_IMAGE}): both are read from the bridge, so changing how it looks
 * is a hot package away instead of a new shell.
 */
public final class BallService extends Service {

    private static final String CHANNEL = "assistant";
    private static final int NOTIFICATION_ID = 4210;

    /** Whether the user wants the ball up; survives app updates and reboots. */
    static final String PREF_ENABLED = "ballEnabled";

    /** Appearance, set from the settings page through `/ball/config`. */
    static final String PREF_SIZE = "ballSizeDp";
    static final String PREF_IMAGE = "ballImagePath";
    static final int DEFAULT_SIZE_DP = 58;

    private static volatile boolean running;
    /** The instance a delivery result is reported back to. */
    private static volatile BallService live;

    private WindowManager windowManager;
    private WindowManager.LayoutParams ballParams;
    private WindowManager.LayoutParams panelParams;
    private View ballWindow;
    private TextView bubble;
    private View ball;
    private View panel;
    private EditText input;
    private TextView panelStatus;

    private SpeechRecognizer recognizer;
    private boolean listening;
    private boolean talking;
    private String heard;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideBubble = () -> {
        if (bubble != null) bubble.setVisibility(View.GONE);
    };

    public static boolean isRunning() {
        return running;
    }

    /** Start the overlay and remember that the user wants it (see {@link #restore}). */
    public static void start(Context ctx) {
        App.i().prefs.edit().putBoolean(PREF_ENABLED, true).apply();
        if (!Assist.canOverlay(ctx) || running) return;
        ctx.startForegroundService(new Intent(ctx, BallService.class));
    }

    /** Stop the overlay and remember that the user does not want it. */
    public static void stop(Context ctx) {
        App.i().prefs.edit().putBoolean(PREF_ENABLED, false).apply();
        ctx.stopService(new Intent(ctx, BallService.class));
    }

    /**
     * Bring the ball back after the process was replaced.
     *
     * An app update kills the service, and without this the ball silently
     * disappeared until the user went digging in the settings again — the ball is
     * a thing the user turned on, so it should stay on.
     */
    public static void restore(Context ctx) {
        if (!App.i().prefs.getBoolean(PREF_ENABLED, false)) return;
        if (!Assist.canOverlay(ctx) || running) return;
        ctx.startForegroundService(new Intent(ctx, BallService.class));
    }

    /** Re-read the appearance settings by restarting the overlay. */
    public static void reload(Context ctx) {
        if (!running) return;
        ctx.stopService(new Intent(ctx, BallService.class));
        ctx.startForegroundService(new Intent(ctx, BallService.class));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        live = this;
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
        live = null;
        stopListening();
        hidePanel();
        handler.removeCallbacks(hideBubble);
        if (ballWindow != null) {
            try {
                windowManager.removeView(ballWindow);
            } catch (Exception ignored) {
            }
            ballWindow = null;
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

    private int sizePx() {
        SharedPreferences prefs = App.i().prefs;
        int dp = prefs.getInt(PREF_SIZE, DEFAULT_SIZE_DP);
        return dp(dp < 32 ? DEFAULT_SIZE_DP : Math.min(dp, 140));
    }

    /**
     * The picture: whatever the user chose, else the brand mark.
     *
     * A vector drawable (Android's XML vector format) or any bitmap Android can
     * decode. A missing or unreadable file falls back to the whale rather than
     * leaving an invisible ball on screen.
     */
    private Drawable icon() {
        String path = App.i().prefs.getString(PREF_IMAGE, "");
        if (path != null && !path.isEmpty()) {
            File file = new File(path);
            if (file.isFile()) {
                try {
                    if (path.endsWith(".xml")) {
                        try (InputStream in = new FileInputStream(file)) {
                            XmlPullParser parser = Xml.newPullParser();
                            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
                            parser.setInput(in, null);
                            Drawable vector = VectorDrawable.createFromXml(getResources(), parser);
                            if (vector != null) return vector;
                        }
                    }
                    Bitmap bitmap = BitmapFactory.decodeFile(path);
                    if (bitmap != null) return new BitmapDrawable(getResources(), bitmap);
                } catch (Exception error) {
                    App.log("ball icon " + path + ": " + error);
                }
            }
        }
        return getResources().getDrawable(R.drawable.ic_whale_monochrome, null);
    }

    private void showBall() {
        int size = sizePx();

        // One window holds the bubble and the ball: the bubble then moves with
        // the ball for free, and cannot drift out of sync with it.
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);

        bubble = new TextView(this);
        GradientDrawable bubbleBackground = new GradientDrawable();
        bubbleBackground.setCornerRadius(dp(14));
        bubbleBackground.setColor(getResources().getColor(R.color.ball_bubble));
        bubble.setBackground(bubbleBackground);
        bubble.setTextColor(getResources().getColor(R.color.ball_bubble_text));
        bubble.setTextSize(12);
        bubble.setPadding(dp(10), dp(6), dp(10), dp(6));
        bubble.setVisibility(View.GONE);
        bubble.setMaxWidth(dp(220));
        LinearLayout.LayoutParams bubbleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        bubbleParams.bottomMargin = dp(6);
        column.addView(bubble, bubbleParams);

        FrameLayout circle = new FrameLayout(this);
        GradientDrawable fill = new GradientDrawable();
        fill.setShape(GradientDrawable.OVAL);
        fill.setColor(getResources().getColor(R.color.ball_fill));
        fill.setStroke(dp(1), getResources().getColor(R.color.ball_stroke));
        circle.setBackground(fill);
        ImageView mark = new ImageView(this);
        mark.setImageDrawable(icon());
        int inset = Math.max(4, size / 6);
        FrameLayout.LayoutParams markParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        markParams.setMargins(inset, inset, inset, inset);
        circle.addView(mark, markParams);
        circle.setAlpha(0.94f);
        column.addView(circle, new LinearLayout.LayoutParams(size, size));

        ballWindow = column;
        ball = circle;
        ballParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        ballParams.gravity = Gravity.TOP | Gravity.START;
        ballParams.x = App.i().prefs.getInt("ballX", dp(12));
        ballParams.y = App.i().prefs.getInt("ballY", dp(220));
        circle.setOnTouchListener(new BallTouch());
        windowManager.addView(ballWindow, ballParams);
    }

    /** Show a short status above the ball; it fades out on its own. */
    private void say(String text, long millis) {
        if (bubble == null) return;
        handler.removeCallbacks(hideBubble);
        bubble.setText(text);
        bubble.setVisibility(View.VISIBLE);
        if (millis > 0) handler.postDelayed(hideBubble, millis);
    }

    /**
     * Hold to talk, tap to type, drag to move.
     *
     * The distinction is made on release rather than on press: a press that
     * lasts becomes recording, one that does not becomes the input box, and
     * movement in between turns it into a drag (which cancels whatever else it
     * had started).
     */
    private final class BallTouch implements View.OnTouchListener {
        private int startX, startY;
        private float touchX, touchY;
        private boolean dragging;
        private final Runnable holdToTalk = new Runnable() {
            @Override
            public void run() {
                if (dragging) return;
                talking = true;
                heard = null;
                say(getString(R.string.ball_listening), 0);
                startListening();
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
                    ball.setAlpha(1f);
                    // Short of the platform's long press: holding a microphone
                    // should start recording the moment it is clearly a hold.
                    handler.postDelayed(holdToTalk, 260);
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    int dx = (int) (event.getRawX() - touchX);
                    int dy = (int) (event.getRawY() - touchY);
                    if (!dragging && Math.hypot(dx, dy) > dp(8)) {
                        dragging = true;
                        handler.removeCallbacks(holdToTalk);
                        stopListening();
                        talking = false;
                        say("", 0);
                    }
                    if (dragging) {
                        ballParams.x = startX + dx;
                        ballParams.y = startY + dy;
                        try {
                            windowManager.updateViewLayout(ballWindow, ballParams);
                        } catch (Exception ignored) {
                        }
                    }
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    handler.removeCallbacks(holdToTalk);
                    ball.setAlpha(0.94f);
                    boolean wasTalking = talking;
                    talking = false;
                    if (dragging) {
                        settleAgainstEdge();
                    } else if (wasTalking) {
                        // Releasing ends the recording; the result callback sends.
                        stopListening(true);
                    } else {
                        openPanel();
                    }
                    return true;
                default:
                    return false;
            }
        }
    }

    /** Leave the ball at the side it was dropped nearest, and remember where. */
    private void settleAgainstEdge() {
        int screen = getResources().getDisplayMetrics().widthPixels;
        int width = sizePx();
        int target = ballParams.x + width / 2 > screen / 2 ? screen - width - dp(12) : dp(12);
        ballParams.x = target;
        try {
            windowManager.updateViewLayout(ballWindow, ballParams);
        } catch (Exception ignored) {
        }
        App.i().prefs.edit().putInt("ballX", ballParams.x).putInt("ballY", ballParams.y).apply();
    }

    // ------------------------------------------------------------------- panel

    /** The typing box, placed beside the ball rather than over the screen bottom. */
    private void openPanel() {
        if (panel != null) {
            focusInput();
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

        panelStatus = new TextView(this);
        panelStatus.setTextColor(getResources().getColor(R.color.panel_hint));
        panelStatus.setTextSize(12);
        panelStatus.setText(getString(R.string.ball_prompt));
        column.addView(panelStatus);

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

        Button send = new Button(this);
        send.setText(R.string.ball_send);
        send.setOnClickListener(v -> submit(input.getText().toString()));
        actions.addView(send);

        Button close = new Button(this);
        close.setText(R.string.ball_close);
        close.setOnClickListener(v -> hidePanel());
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        closeParams.leftMargin = dp(8);
        actions.addView(close, closeParams);
        column.addView(actions, actionsParams);

        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        boolean onLeft = ballParams.x + sizePx() / 2 < screenWidth / 2;
        panelParams = new WindowManager.LayoutParams(
                Math.min(dp(300), screenWidth - dp(24)),
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        panelParams.gravity = Gravity.TOP | Gravity.START;
        panelParams.x = onLeft ? dp(12) : screenWidth - panelParams.width - dp(12);
        panelParams.y = Math.max(dp(12), ballParams.y + sizePx() + dp(10));
        panelParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;

        panel = column;
        try {
            windowManager.addView(panel, panelParams);
        } catch (Exception error) {
            App.log("ball panel: " + error);
            panel = null;
            return;
        }
        focusInput();
    }

    private void focusInput() {
        if (input == null) return;
        input.requestFocus();
        InputMethodManager keyboard =
                (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
    }

    private void hidePanel() {
        stopListening();
        if (panel == null) return;
        View view = panel;
        panel = null;
        input = null;
        panelStatus = null;
        try {
            windowManager.removeView(view);
        } catch (Exception ignored) {
        }
    }

    /** Hand the words over, and say so in the bubble. */
    private void submit(String text) {
        String value = text == null ? "" : text.trim();
        if (value.isEmpty()) {
            say(getString(R.string.ball_empty), 2000);
            return;
        }
        hidePanel();
        say(getString(R.string.ball_you) + value, 0);
        Assist.deliver(value);
    }

    /**
     * What the page did with the words, told back to the bubble.
     *
     * "已交给 DSH" was a claim the app could not back up: if the harness had no
     * composer on screen, the text went nowhere and the ball still said it was
     * delivered. The status comes from the page itself now.
     */
    /**
     * A line from outside — the page, or the agent's own tools — shown in the
     * bubble.
     *
     * This is how the ball reports what the assistant is *doing*: the page knows
     * which tool is running, and the guest scripts know what they were asked to
     * do. The ball only has to show it.
     */
    static void sayFromOutside(String text) {
        BallService service = live;
        if (service == null || text == null || text.trim().isEmpty()) return;
        String line = text.trim();
        service.handler.post(() -> service.say(line.length() > 60 ? line.substring(0, 60) + "…" : line, 6000));
    }

    static void onDeliveryResult(String status) {
        BallService service = live;
        if (service == null) return;
        String text;
        if ("pasted".equals(status)) text = service.getString(R.string.ball_sent);
        else if ("clipboard".equals(status)) text = service.getString(R.string.ball_copied);
        else if ("no-composer".equals(status)) text = service.getString(R.string.ball_no_composer);
        else if ("empty".equals(status)) text = service.getString(R.string.ball_empty);
        else text = service.getString(R.string.ball_failed) + "（" + status + "）";
        service.handler.post(() -> service.say(text, 4000));
    }

    private static String shorten(String text) {
        return text.length() <= 24 ? text : text.substring(0, 24) + "…";
    }

    // ------------------------------------------------------------------- voice

    private void startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            say(getString(R.string.ball_no_voice), 3000);
            return;
        }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            say(getString(R.string.ball_no_mic), 4000);
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
        try {
            recognizer.startListening(intent);
        } catch (Exception error) {
            listening = false;
            say(String.valueOf(error.getMessage()), 3000);
        }
    }

    private void stopListening() {
        stopListening(false);
    }

    /**
     * End the recording.
     *
     * @param deliver send the transcript as soon as it arrives; false only stops
     *                the microphone (a gesture that turned into a drag)
     */
    private void stopListening(boolean deliver) {
        listening = false;
        if (recognizer != null) {
            try {
                if (deliver) recognizer.stopListening();
                else recognizer.cancel();
            } catch (Exception ignored) {
            }
        }
    }

    private final class Listener implements RecognitionListener {
        @Override
        public void onPartialResults(android.os.Bundle partial) {
            String text = first(partial);
            if (text != null) {
                heard = text;
                say(text, 0);
            }
        }

        @Override
        public void onResults(android.os.Bundle results) {
            listening = false;
            String text = first(results);
            if (text == null || text.trim().isEmpty()) {
                say(getString(R.string.ball_heard_nothing), 2500);
                return;
            }
            // Push-to-talk sends on release: that is the whole gesture. The
            // bubble keeps the text on screen so a mis-hearing is visible.
            say(getString(R.string.ball_you) + text.trim(), 0);
            Assist.deliver(text.trim());
        }

        @Override
        public void onError(int code) {
            listening = false;
            if (heard != null && !heard.trim().isEmpty()) {
                say(getString(R.string.ball_you) + heard.trim(), 0);
                Assist.deliver(heard.trim());
                return;
            }
            say(code == SpeechRecognizer.ERROR_NO_MATCH
                            || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                            ? getString(R.string.ball_heard_nothing)
                            : getString(R.string.ball_voice_failed) + " (" + code + ")",
                    3000);
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
