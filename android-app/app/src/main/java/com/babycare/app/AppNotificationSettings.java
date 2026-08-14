package com.babycare.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

final class AppNotificationSettings {
    private static final String PREFS = "babycare_app_notification_settings";
    private static final String[] TYPES = { "morning", "feeding", "care", "vaccine" };

    private AppNotificationSettings() {}

    static boolean enabled(Context context, String type) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getBoolean("all", true) && prefs.getBoolean(type, true);
    }

    static String json(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject result = new JSONObject();
        try {
            result.put("all", prefs.getBoolean("all", true));
            for (String type : TYPES) result.put(type, prefs.getBoolean(type, true));
        } catch (Exception ignored) {}
        return result.toString();
    }

    static void save(Context context, String json) {
        try {
            JSONObject input = new JSONObject(json);
            SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            editor.putBoolean("all", input.optBoolean("all", true));
            for (String type : TYPES) editor.putBoolean(type, input.optBoolean(type, true));
            editor.apply();
            if (enabled(context, "vaccine")) NotificationScheduler.rescheduleStored(context);
            else NotificationScheduler.cancelStored(context);
            AppNotificationPoller.pollNow(context);
        } catch (Exception ignored) {}
    }
}
