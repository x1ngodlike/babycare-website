package com.babycare.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class AppNotificationPoller extends BroadcastReceiver {
    private static final String PREFS = "babycare_app_notification_sync";
    private static final String CLIENT_ID = "client_id";
    private static final String ACTION = "com.babycare.app.POLL_NOTIFICATIONS";
    private static final long INTERVAL = 15 * 60_000L;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    static void start(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) {
            manager.setInexactRepeating(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 60_000L,
                INTERVAL,
                pendingIntent(context)
            );
        }
        pollNow(context);
    }

    static void pollNow(Context context) {
        context.sendBroadcast(new Intent(context, AppNotificationPoller.class).setAction(ACTION));
    }

    private static PendingIntent pendingIntent(Context context) {
        return PendingIntent.getBroadcast(
            context,
            9_800,
            new Intent(context, AppNotificationPoller.class).setAction(ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!AppNotificationSettings.enabled(context, "morning")
            && !AppNotificationSettings.enabled(context, "feeding")
            && !AppNotificationSettings.enabled(context, "care")) return;
        String server = ServerConfig.selectedUrl(context);
        if (server == null || server.isBlank()) return;
        String cookie = CookieManager.getInstance().getCookie(server);
        if (cookie == null || cookie.isBlank()) return;
        PendingResult pending = goAsync();
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try { poll(appContext, server, cookie); }
            finally { pending.finish(); }
        });
    }

    private static void poll(Context context, String server, String cookie) {
        HttpURLConnection connection = null;
        try {
            String clientId = clientId(context);
            String cursorKey = "cursor_" + Integer.toHexString(server.hashCode());
            long after = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(cursorKey, 0L);
            URL url = new URL(server + "/api/app-notifications?after=" + after + "&clientId=" + clientId);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(8_000);
            connection.setReadTimeout(8_000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cookie", cookie);
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return;
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            JSONObject response = new JSONObject(body.toString());
            JSONArray items = response.optJSONArray("items");
            if (items != null && NotificationScheduler.canNotify(context)) {
                for (int index = 0; index < items.length(); index++) {
                    JSONObject item = items.optJSONObject(index);
                    if (item == null) continue;
                    String type = item.optString("type", "care");
                    if (!AppNotificationSettings.enabled(context, type)) continue;
                    NotificationScheduler.post(
                        context,
                        20_000 + item.optInt("id", index),
                        NotificationScheduler.channelFor(type),
                        item.optString("title", "宝宝照护提醒"),
                        item.optString("body", "有一项新的照护提醒。"),
                        item.optString("target", "today")
                    );
                }
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putLong(cursorKey, response.optLong("cursor", after))
                .apply();
        } catch (Exception ignored) {
            // Network and session errors are retried on the next periodic sync.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String clientId(Context context) {
        String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CLIENT_ID, "");
        if (saved != null && !saved.isBlank()) return saved;
        String created = UUID.randomUUID().toString();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CLIENT_ID, created).apply();
        return created;
    }
}
