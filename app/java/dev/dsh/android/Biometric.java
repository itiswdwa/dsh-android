package dev.dsh.android;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.DialogInterface;
import android.hardware.fingerprint.FingerprintManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Biometric authentication for the plugin/AI surface — the `/android/biometric`
 * half of docs/AI-API.md.
 *
 * <p>Two layers live here on purpose:
 *
 * <ul>
 *   <li>{@link #status()} and {@link #authenticate} are the bridge-facing API:
 *       plain JSON, no exceptions, blocking only while the user is answering.
 *       The activity owns the dialog via {@link BridgeServer.Host#onBiometric}
 *       (the bridge is a plain loopback server and must not assume an Activity
 *       exists).</li>
 *   <li>{@link Prompt} is the thin wrapper around the platform
 *       {@code android.hardware.biometrics.BiometricPrompt} (Android 9 / API 28+).
 *       It is a separate class so the Android 9-only types are not resolved when
 *       this app runs on API 26-27; nothing in this file touches them before
 *       {@link #startPrompt} is called.</li>
 * </ul>
 *
 * <p>When a biometric is enrolled, the prompt also allows the device credential
 * where the platform supports it: {@code setDeviceCredentialAllowed} arrived in
 * Android 10 (API 29) and {@code setAllowedAuthenticators} in Android 11
 * (API 30). Android 9's BiometricPrompt is biometric-only; a device with only a
 * PIN is reported as unavailable (no plain confirmation fallback, per the 1.2.2
 * revision).
 */
public final class Biometric {

    /** Contract: block for at most 60 s (see docs/AI-API.md §1). */
    public static final long TIMEOUT_MS = 60000L;

    /** Platform authenticator flags; literals so API 26-29 never resolves the API 30 class. */
    private static final int AUTH_BIOMETRIC_WEAK = 0x00FF;
    private static final int AUTH_DEVICE_CREDENTIAL = 0x8000;

    private Biometric() {
    }

    // ------------------------------------------------------------------ status

    /**
     * `GET /android/biometric`.
     *
     * <p>`available` answers "could the biometric prompt succeed right now":
     * Android 9+ and an enrolled biometric. A secure lock screen alone is reported
     * through `deviceSecure`/`mode:"credential"` but is not enough on its own —
     * per the 1.2.2 revision the consent confirmation is a biometric one, not a
     * plain allow/deny dialog. Once a biometric is enrolled the platform prompt
     * may still fall back to the device credential where the OS supports it.
     */
    public static JSONObject status() {
        JSONObject answer = new JSONObject();
        try {
            Context context = App.i();
            int sdk = Build.VERSION.SDK_INT;
            boolean deviceSecure = deviceSecure(context);
            boolean enrolled = biometricEnrolled(context);
            if (sdk < 28) {
                // A fingerprint enrolled on API 26/27 is still reported, but the
                // bridge cannot use it: there is no BiometricPrompt below 28.
                answer.put("ok", true);
                answer.put("sdk", sdk);
                answer.put("available", false);
                answer.put("enrolled", enrolled);
                answer.put("deviceSecure", deviceSecure);
                answer.put("mode", "none");
                answer.put("message", "生物识别需要 Android 9（API 28）及以上（当前 API " + sdk + "）");
                return answer;
            }
            // Credential-only devices are reported honestly as unavailable: consent
            // prompts are biometric confirmations, not a plain allow/deny dialog
            // (Lead decision, 1.2.2 revision). A secure lock screen is still part of
            // the prompt's fallback once a biometric is enrolled.
            boolean available = enrolled;
            String mode = enrolled ? "biometric" : deviceSecure ? "credential" : "none";
            answer.put("ok", true);
            answer.put("sdk", sdk);
            answer.put("available", available);
            answer.put("enrolled", enrolled);
            answer.put("deviceSecure", deviceSecure);
            answer.put("mode", mode);
            answer.put("message", available ? ""
                    : deviceSecure
                            ? "这台设备设置了锁屏密码，但没有录入指纹或人脸"
                            : "这台设备没有录入指纹或人脸，也没有设置锁屏密码");
            return answer;
        } catch (Throwable error) {
            return failure("无法读取生物识别状态：" + error, null, "biometric");
        }
    }

    /** Whether the platform biometric prompt exists on this device. */
    public static boolean promptSupported() {
        return Build.VERSION.SDK_INT >= 28;
    }

    /** The boolean surfaced as `capabilities.biometric` by `GET /android/info`. */
    public static boolean isReady() {
        try {
            return status().optBoolean("available", false);
        } catch (Throwable error) {
            return false;
        }
    }

    private static boolean biometricEnrolled(Context context) {
        if (Build.VERSION.SDK_INT >= 29) {
            // Separate class: BiometricManager itself does not exist on API 26-28.
            return Api29.enrolled(context);
        }
        try {
            FingerprintManager manager = (FingerprintManager)
                    context.getSystemService(Context.FINGERPRINT_SERVICE);
            return manager != null && manager.isHardwareDetected()
                    && manager.hasEnrolledFingerprints();
        } catch (Throwable error) {
            return false;
        }
    }

    private static boolean deviceSecure(Context context) {
        try {
            KeyguardManager keyguard = (KeyguardManager)
                    context.getSystemService(Context.KEYGUARD_SERVICE);
            return keyguard != null && keyguard.isDeviceSecure();
        } catch (Throwable error) {
            return false;
        }
    }

    /** API 29+ only; loaded lazily through {@link #biometricEnrolled}. */
    private static final class Api29 {
        static boolean enrolled(Context context) {
            try {
                android.hardware.biometrics.BiometricManager manager =
                        context.getSystemService(android.hardware.biometrics.BiometricManager.class);
                return manager != null
                        && manager.canAuthenticate()
                        == android.hardware.biometrics.BiometricManager.BIOMETRIC_SUCCESS;
            } catch (Throwable error) {
                return false;
            }
        }
    }

    // ----------------------------------------------------------------- request

    /**
     * `POST /android/biometric`: show the system prompt through the host activity
     * and block until it finishes (or 60 s pass).
     *
     * <p>Every outcome is JSON. Callers pass a prompt `title`, a `subtitle` and an
     * optional `description`; the first two are how the consent flow shows the
     * capability and the conversation.
     */
    public static JSONObject authenticate(BridgeServer.Host host, String title, String subtitle,
            String description, long timeoutMs) {
        JSONObject status = status();
        if (!status.optBoolean("available", false)) {
            boolean old = status.optInt("sdk", Build.VERSION.SDK_INT) < 28;
            JSONObject answer = failure(
                    status.optString("message", "这台设备无法进行生物识别确认"),
                    old ? "升级到 Android 9（API 28）及以上才能使用" : "先在系统设置里录入指纹或人脸，然后重试",
                    old ? "android9" : "biometric");
            try {
                answer.put("authenticated", false);
            } catch (Throwable ignored) {
            }
            return answer;
        }
        if (host == null) {
            JSONObject answer = failure("当前宿主不支持生物识别确认", null, null);
            try {
                answer.put("authenticated", false);
            } catch (Throwable ignored) {
            }
            return answer;
        }

        final long timeout = timeoutMs <= 0 ? TIMEOUT_MS : timeoutMs;
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicBoolean answered = new AtomicBoolean();
        final AtomicReference<Boolean> authenticated = new AtomicReference<Boolean>(Boolean.FALSE);
        final AtomicReference<String> message = new AtomicReference<String>("");
        BridgeServer.BiometricCallback callback = new BridgeServer.BiometricCallback() {
            @Override
            public void onResult(boolean ok, String error) {
                if (!answered.compareAndSet(false, true)) return;
                authenticated.set(ok);
                message.set(error == null ? "" : error);
                latch.countDown();
            }
        };
        // Every system prompt is labelled by the app, not just by the caller: the
        // prefix is added here (idempotently) and all three lines are single-line
        // and bounded so a plugin cannot paint a wall of text as a system dialog.
        final String promptTitle = headlinedTitle(title);
        final String promptSubtitle = cleanPromptText(subtitle);
        final String promptDescription = cleanPromptText(description);
        try {
            host.onBiometric(promptTitle, promptSubtitle, promptDescription, callback);
        } catch (Throwable error) {
            callback.onResult(false, "无法显示生物识别确认：" + error);
        }

        boolean completed;
        try {
            completed = latch.await(timeout, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            completed = false;
        }
        JSONObject answer;
        if (!completed) {
            // A canceled/timed-out prompt is not a missing grant: no `needs` here.
            answer = failure("生物识别确认超时（" + (timeout / 1000) + " 秒）", null, null);
        } else if (Boolean.TRUE.equals(authenticated.get())) {
            answer = new JSONObject();
            try {
                answer.put("ok", true);
                answer.put("authenticated", true);
            } catch (Throwable ignored) {
            }
            return answer;
        } else {
            String error = message.get();
            answer = failure(error == null || error.isEmpty() ? "用户取消或验证失败" : error,
                    null, null);
        }
        try {
            answer.put("authenticated", false);
        } catch (Throwable ignored) {
        }
        return answer;
    }

    // ----------------------------------------------------------------- routing

    /** Entry point for the bridge; `method` is the HTTP verb. */
    public static JSONObject handle(String method, JSONObject body, BridgeServer.Host host) {
        try {
            if (!"POST".equalsIgnoreCase(method == null ? "" : method)) return status();
            JSONObject request = body == null ? new JSONObject() : body;
            return authenticate(host,
                    request.optString("title", ""),
                    request.optString("subtitle", ""),
                    request.optString("description", ""),
                    TIMEOUT_MS);
        } catch (Throwable error) {
            return failure("生物识别接口失败：" + error, null, "biometric");
        }
    }

    // ------------------------------------------------------------------ prompt

    /** Completion callback for {@link Prompt}; always invoked once, on the main thread. */
    public interface PromptListener {
        void onResult(boolean authenticated, String error);
    }

    /**
     * Show the system BiometricPrompt. Only call this on API 28+; the nested
     * class is what keeps the platform's post-API-26 types out of this class's
     * older code paths.
     */
    public static Prompt startPrompt(Activity activity, String title, String subtitle,
            String description, PromptListener listener) {
        if (Build.VERSION.SDK_INT < 28) {
            throw new IllegalStateException("生物识别需要 Android 9（API 28）及以上");
        }
        return new Prompt(activity, title, subtitle, description, listener);
    }

    /** One in-flight BiometricPrompt; the activity keeps the reference so it can cancel. */
    public static final class Prompt {
        private final android.hardware.biometrics.BiometricPrompt prompt;
        private final CancellationSignal cancellation = new CancellationSignal();
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final AtomicBoolean done = new AtomicBoolean();
        private final PromptListener listener;
        private final Runnable timeout;

        private Prompt(Activity activity, String title, String subtitle, String description,
                PromptListener listener) {
            this.listener = listener;
            this.timeout = new Runnable() {
                @Override
                public void run() {
                    finish(false, "验证超时，请重试");
                }
            };

            android.hardware.biometrics.BiometricPrompt.Builder builder =
                    new android.hardware.biometrics.BiometricPrompt.Builder(activity)
                            .setTitle(title == null || title.isEmpty() ? "验证身份" : title);
            if (subtitle != null && !subtitle.isEmpty()) builder.setSubtitle(subtitle);
            if (description != null && !description.isEmpty()) builder.setDescription(description);

            final java.util.concurrent.Executor executor = activity.getMainExecutor();
            if (Build.VERSION.SDK_INT >= 30) {
                // BIOMETRIC_WEAK includes strong sensors and also lets 2D face
                // unlock count; DEVICE_CREDENTIAL is the PIN/pattern fallback.
                builder.setAllowedAuthenticators(AUTH_BIOMETRIC_WEAK | AUTH_DEVICE_CREDENTIAL);
            } else if (Build.VERSION.SDK_INT >= 29) {
                // Android 10 added the credential fallback to this prompt class;
                // Android 9 has no such flag (MainActivity uses the keyguard screen).
                builder.setDeviceCredentialAllowed(true);
            } else {
                // Android 9 is biometric-only, and the platform refuses to build
                // that prompt without a negative button.
                builder.setNegativeButton("取消", executor,
                        new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                finish(false, "用户取消或验证失败");
                            }
                        });
            }

            this.prompt = builder.build();
            // The bridge waits 60 s; leave a little room so the activity answers
            // first and the caller never sees a dangling prompt.
            handler.postDelayed(timeout, TIMEOUT_MS - 5000L);
            try {
                prompt.authenticate(cancellation, executor,
                        new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(
                                    android.hardware.biometrics.BiometricPrompt.AuthenticationResult result) {
                                finish(true, null);
                            }

                            @Override
                            public void onAuthenticationError(int errorCode, CharSequence errString) {
                                finish(false, readableError(errorCode, errString));
                            }

                            @Override
                            public void onAuthenticationFailed() {
                                // The system keeps the prompt up for a retry; the user
                                // has not answered yet, so there is nothing to report.
                            }
                        });
            } catch (Throwable error) {
                finish(false, "无法启动生物识别确认：" + error);
            }
        }

        /** Cancel from the activity (e.g. it is being destroyed) and report. */
        public void cancel() {
            finish(false, "DSH 界面已关闭，未完成确认");
        }

        private void finish(boolean authenticated, String error) {
            if (!done.compareAndSet(false, true)) return;
            handler.removeCallbacks(timeout);
            try {
                cancellation.cancel();
            } catch (Throwable ignored) {
            }
            if (listener != null) listener.onResult(authenticated, error);
        }

        private static String readableError(int code, CharSequence message) {
            switch (code) {
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED:
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_CANCELED:
                    return "用户取消或验证失败";
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT:
                    return "尝试次数过多，请用锁屏密码解锁后再试";
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT:
                    return "生物识别已被系统锁定，请用锁屏密码解锁后再试";
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_TIMEOUT:
                    return "验证超时，请重试";
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS:
                    return "没有录入指纹或人脸，请先在系统设置里录入";
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT:
                    return "这台设备没有可用的生物识别硬件";
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                    return "生物识别硬件暂时不可用，请稍后再试";
                case android.hardware.biometrics.BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL:
                    return "没有设置锁屏密码，请先在系统设置里设置";
                default:
                    String text = message == null ? "" : String.valueOf(message).trim();
                    return text.isEmpty() ? "验证失败（错误码 " + code + "）" : text;
            }
        }
    }

    // ------------------------------------------------------------------ errors

    /** Fixed prefix on every system prompt, so the dialog always names DSH. */
    private static final String PROMPT_PREFIX = "DSH 请求：";

    /** One prompt line is at most this long (title/subtitle/description each). */
    private static final int PROMPT_TEXT_LIMIT = 120;

    /**
     * Single-line, bounded caller text. Newlines would otherwise let a plugin
     * imitate the dialog's own layout; the limit keeps the dialog readable.
     */
    private static String cleanPromptText(String value) {
        if (value == null) return "";
        String text = value.replaceAll("\\s+", " ").trim();
        if (text.length() > PROMPT_TEXT_LIMIT) {
            text = text.substring(0, PROMPT_TEXT_LIMIT).trim();
        }
        return text;
    }

    /** Same as {@link #cleanPromptText}, plus the DSH prefix (idempotent). */
    private static String headlinedTitle(String title) {
        String text = cleanPromptText(title);
        if (text.isEmpty()) text = "验证身份";
        if (!text.startsWith(PROMPT_PREFIX)) text = PROMPT_PREFIX + text;
        if (text.length() > PROMPT_TEXT_LIMIT) {
            text = text.substring(0, PROMPT_TEXT_LIMIT).trim();
        }
        return text;
    }

    private static JSONObject failure(String error, String hint, String need) {
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
}
