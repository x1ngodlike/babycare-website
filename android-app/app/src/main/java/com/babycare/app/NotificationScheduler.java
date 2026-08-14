package com.babycare.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

public final class NotificationScheduler {
    static final String CHANNEL_VACCINE = "vaccine_reminders";
    static final String CHANNEL_MORNING = "morning_updates";
    static final String CHANNEL_FEEDING = "feeding_reminders";
    static final String CHANNEL_CARE = "care_reminders";
    private static final String PREFS = "babycare_notifications";
    private static final String STORED_REMINDERS = "vaccine_reminders";
    private static final String ACTION_VACCINE_REMINDER = "com.babycare.app.VACCINE_REMINDER";
    private static final long MINUTE_MILLIS = 60_000L;

    private NotificationScheduler() {}

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.createNotificationChannel(channel(CHANNEL_VACCINE, "疫苗预约提醒", "在门诊预约前一天提醒"));
        manager.createNotificationChannel(channel(CHANNEL_MORNING, "宝宝早报", "每天的宝宝照护摘要"));
        manager.createNotificationChannel(channel(CHANNEL_FEEDING, "喂奶提醒", "喂奶间隔提醒"));
        manager.createNotificationChannel(channel(CHANNEL_CARE, "照护提醒", "用药和日常照护提醒"));
    }

    private static NotificationChannel channel(String id, String name, String description) {
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(description);
        channel.enableVibration(true);
        return channel;
    }

    static boolean canNotify(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static String permissionStatus(Context context) {
        return canNotify(context) ? "granted" : "required";
    }

    static void sync(Context context, String json) {
        createChannel(context);
        String previous = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(STORED_REMINDERS, "[]");
        cancelAll(context, previous);
        String safeJson = json == null || json.isBlank() ? "[]" : json;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(STORED_REMINDERS, safeJson)
            .apply();
        if (AppNotificationSettings.enabled(context, "vaccine")) scheduleAll(context, safeJson);
    }

    static void rescheduleStored(Context context) {
        String stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(STORED_REMINDERS, "[]");
        if (AppNotificationSettings.enabled(context, "vaccine")) scheduleAll(context, stored);
    }

    static void cancelStored(Context context) {
        String stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(STORED_REMINDERS, "[]");
        cancelAll(context, stored);
    }

    static boolean showTest(Context context, String type) {
        if (!canNotify(context)) return false;
        String channel = channelFor(type);
        String title;
        String body;
        switch (type) {
            case "morning": title = "宝宝早报 · 测试"; body = "测试成功。每天的喂奶统计、今日待办和疫苗安排会显示在这里。"; break;
            case "feeding": title = "该记录喂奶啦"; body = "测试成功。达到设置的喂奶间隔后会收到提醒。"; break;
            case "care": title = "照护提醒：测试"; body = "测试成功。用药和照护计划到时间后会显示在这里。"; break;
            default: title = "疫苗提醒 · 测试"; body = "测试成功。已预约疫苗会在接种前一天提醒。"; break;
        }
        post(context, 9_001 + Math.abs(type.hashCode() % 500), channel, title, body, "today");
        return true;
    }

    static String channelFor(String type) {
        if ("morning".equals(type)) return CHANNEL_MORNING;
        if ("feeding".equals(type)) return CHANNEL_FEEDING;
        if ("care".equals(type)) return CHANNEL_CARE;
        return CHANNEL_VACCINE;
    }

    private static void scheduleAll(Context context, String json) {
        try {
            JSONArray reminders = new JSONArray(json);
            for (int index = 0; index < reminders.length(); index++) {
                JSONObject reminder = reminders.optJSONObject(index);
                if (reminder != null) scheduleOne(context, reminder);
            }
        } catch (Exception ignored) {
            // Invalid input never breaks the WebView host. A later sync replaces it.
        }
    }

    private static void cancelAll(Context context, String json) {
        try {
            JSONArray reminders = new JSONArray(json);
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (manager == null) return;
            for (int index = 0; index < reminders.length(); index++) {
                JSONObject reminder = reminders.optJSONObject(index);
                if (reminder == null) continue;
                manager.cancel(pendingIntent(context, reminder.optString("id"), reminder));
            }
        } catch (Exception ignored) {
            // Nothing to cancel when the previous payload cannot be read.
        }
    }

    private static void scheduleOne(Context context, JSONObject reminder) {
        try {
            String id = reminder.getString("id");
            LocalDate appointmentDate = LocalDate.parse(reminder.getString("appointmentOn"));
            String savedTime = reminder.optString("appointmentTime", "");
            LocalTime appointmentTime = savedTime.isBlank() ? LocalTime.of(9, 0) : LocalTime.parse(savedTime);
            ZoneId zone = ZoneId.systemDefault();
            long appointmentAt = LocalDateTime.of(appointmentDate, appointmentTime).atZone(zone).toInstant().toEpochMilli();
            long now = System.currentTimeMillis();
            if (appointmentAt <= now) return;

            long notifyAt = LocalDateTime.of(appointmentDate.minusDays(1), appointmentTime)
                .atZone(zone)
                .toInstant()
                .toEpochMilli();
            if (notifyAt <= now) notifyAt = now + MINUTE_MILLIS;

            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (manager != null) {
                manager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    notifyAt,
                    pendingIntent(context, id, reminder)
                );
            }
        } catch (Exception ignored) {
            // Skip a malformed reminder and continue scheduling the others.
        }
    }

    private static PendingIntent pendingIntent(Context context, String id, JSONObject reminder) {
        Intent intent = new Intent(context, VaccineReminderReceiver.class)
            .setAction(ACTION_VACCINE_REMINDER)
            .putExtra("notificationId", requestCode(id))
            .putExtra("vaccineName", reminder.optString("vaccineName", "疫苗"))
            .putExtra("dose", reminder.optInt("dose", 1))
            .putExtra("appointmentOn", reminder.optString("appointmentOn", ""))
            .putExtra("appointmentTime", reminder.optString("appointmentTime", ""));
        return PendingIntent.getBroadcast(
            context,
            requestCode(id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int requestCode(String id) {
        return id == null ? 0 : id.hashCode() & 0x7fffffff;
    }

    static void post(Context context, int id, String channelId, String title, String body, String target) {
        createChannel(context);
        Intent launch = new Intent(context, MainActivity.class)
            .putExtra("notificationTarget", target)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            id,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification notification = new Notification.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .build();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(id, notification);
    }

    public static final class VaccineReminderReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!canNotify(context)) return;
            String vaccineName = intent.getStringExtra("vaccineName");
            int dose = intent.getIntExtra("dose", 1);
            String day = intent.getStringExtra("appointmentOn");
            String time = intent.getStringExtra("appointmentTime");
            String schedule = day == null ? "" : day;
            if (time != null && !time.isBlank()) schedule += " " + time;
            post(
                context,
                intent.getIntExtra("notificationId", 0),
                CHANNEL_VACCINE,
                "明天接种：" + (vaccineName == null ? "疫苗" : vaccineName) + " · 第" + dose + "剂",
                schedule + "。具体接种安排请以门诊为准。",
                "vaccine"
            );
        }
    }

    public static final class BootReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            rescheduleStored(context);
            AppNotificationPoller.start(context);
        }
    }
}
