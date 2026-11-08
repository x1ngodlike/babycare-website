package com.babycare.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.webkit.CookieManager;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class FeedingWidget extends AppWidgetProvider {
    static final String ACTION_RECORD = "com.babycare.app.OPEN_WIDGET_FEEDING";
    private static final String ACTION_REFRESH = "com.babycare.app.REFRESH_FEEDING_WIDGET";
    private static final String PREFS = "babycare_feeding_widget";
    private static final String SIGNED_OUT = "signed_out";
    private static final ExecutorService NETWORK = Executors.newSingleThreadExecutor();

    static void refresh(Context context) {
        if (widgetIds(context).length > 0) {
            context.sendBroadcast(new Intent(context, FeedingWidget.class).setAction(ACTION_REFRESH));
        }
    }

    static synchronized void setSignedIn(Context context, boolean signedIn) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(SIGNED_OUT, !signedIn).apply();
        if (!signedIn) {
            int[] ids = widgetIds(context);
            if (ids.length > 0) render(context, ids, null, null, R.string.feeding_widget_login);
        } else {
            refresh(context);
        }
    }

    private static int[] widgetIds(Context context) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, FeedingWidget.class));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            onUpdate(context, AppWidgetManager.getInstance(context), widgetIds(context));
        } else {
            super.onReceive(context, intent);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        if (ids.length == 0) return;
        Context app = context.getApplicationContext();
        PendingResult pending = goAsync();
        NETWORK.execute(() -> {
            try {
                load(app, ids);
            } finally {
                pending.finish();
            }
        });
    }

    private static boolean signedOut(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(SIGNED_OUT, false);
    }

    private static void load(Context context, int[] ids) {
        String server = ServerConfig.selectedUrl(context);
        if (server.isBlank()) {
            render(context, ids, null, null, R.string.feeding_widget_setup);
            return;
        }

        String endpoint = server + "/api/widget/feeding";
        CookieManager cookies = CookieManager.getInstance();
        String cookie = cookies.getCookie(endpoint);
        if (signedOut(context) || cookie == null || cookie.isBlank()) {
            render(context, ids, null, null, R.string.feeding_widget_login);
            return;
        }

        Snapshot snapshot;
        try {
            snapshot = requestSnapshot(endpoint, cookie);
            if (snapshot == null) {
                // Old servers may send their SPA entry page instead of a 404 for unknown API routes.
                snapshot = requestSnapshot(server + "/api/feeding-prediction", cookie);
            }
            if (snapshot == null) snapshot = Snapshot.status(R.string.feeding_widget_server_error);
        } catch (IOException error) {
            snapshot = Snapshot.status(R.string.feeding_widget_connection_error);
        } catch (Exception error) {
            snapshot = Snapshot.status(R.string.feeding_widget_server_error);
        }

        synchronized (FeedingWidget.class) {
            if (!signedOut(context) && server.equals(ServerConfig.selectedUrl(context))
                && Objects.equals(cookie, cookies.getCookie(endpoint))) {
                render(context, ids, snapshot.last(), snapshot.next(), snapshot.statusLabel());
            }
        }
    }

    private record Snapshot(Instant last, Instant next, int statusLabel) {
        static Snapshot status(int label) {
            return new Snapshot(null, null, label);
        }
    }

    // Null means the endpoint is unavailable on this version of the server.
    private static Snapshot requestSnapshot(String endpoint, String cookie) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setConnectTimeout(2_500);
            connection.setReadTimeout(4_000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cookie", cookie);
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_UNAUTHORIZED) {
                return Snapshot.status(R.string.feeding_widget_login);
            }
            if (status == HttpURLConnection.HTTP_NOT_FOUND) return null;
            if (status != HttpURLConnection.HTTP_OK) {
                return Snapshot.status(R.string.feeding_widget_server_error);
            }

            String contentType = connection.getContentType();
            if (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("text/html")) {
                return null;
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder body = new StringBuilder();
                char[] chunk = new char[2048];
                int count;
                while ((count = reader.read(chunk)) != -1) {
                    body.append(chunk, 0, count);
                    if (body.length() > 128 * 1024) throw new IllegalArgumentException("Widget response too large");
                }
                JSONObject data = new JSONObject(body.toString());
                if (!data.has("lastFeedAt") || !data.has("nextFeedAt")) {
                    return Snapshot.status(R.string.feeding_widget_server_error);
                }
                Instant last = readInstant(data, "lastFeedAt");
                Instant next = readInstant(data, "nextFeedAt");
                if (last != null && last.isAfter(Instant.now())) return new Snapshot(null, null, 0);
                return new Snapshot(last, next, 0);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static Instant readInstant(JSONObject data, String key) {
        return data.isNull(key) ? null : Instant.parse(data.optString(key));
    }

    private static void render(Context context, int[] ids, Instant last, Instant next, int statusLabel) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.feeding_widget);
        Intent intent = new Intent(context, MainActivity.class).setAction(ACTION_RECORD)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(context, 9_801, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.feeding_widget_record, open);
        Intent retry = new Intent(context, FeedingWidget.class).setAction(ACTION_REFRESH);
        views.setOnClickPendingIntent(R.id.feeding_widget_timing, PendingIntent.getBroadcast(
            context, 9_802, retry, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        ));

        boolean hasLast = last != null && statusLabel == 0;
        views.setViewVisibility(R.id.feeding_widget_elapsed, hasLast ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.feeding_widget_last_status, hasLast ? View.GONE : View.VISIBLE);
        if (hasLast) {
            long elapsed = Math.max(0, System.currentTimeMillis() - last.toEpochMilli());
            views.setChronometer(R.id.feeding_widget_elapsed, SystemClock.elapsedRealtime() - elapsed, null, true);
        } else {
            views.setChronometer(R.id.feeding_widget_elapsed, SystemClock.elapsedRealtime(), null, false);
            views.setTextViewText(R.id.feeding_widget_last_status, context.getString(
                statusLabel == 0 ? R.string.feeding_widget_empty : statusLabel));
        }

        String nextLabel;
        if (statusLabel != 0) {
            nextLabel = context.getString(R.string.feeding_widget_placeholder);
        } else if (next == null) {
            nextLabel = context.getString(R.string.feeding_widget_no_prediction);
        } else {
            ZoneId zone = ZoneId.systemDefault();
            ZonedDateTime nextLocal = next.atZone(zone);
            boolean sameDay = nextLocal.toLocalDate().equals(Instant.now().atZone(zone).toLocalDate());
            nextLabel = nextLocal.format(DateTimeFormatter.ofPattern(sameDay ? "HH:mm" : "M/d HH:mm"));
        }
        views.setTextViewText(R.id.feeding_widget_next_value, nextLabel);
        AppWidgetManager.getInstance(context).updateAppWidget(ids, views);
    }
}
