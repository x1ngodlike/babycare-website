package com.babycare.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ServerConfig {
    interface ProbeCallback {
        void onResult(boolean success);
    }

    enum Environment {
        PUBLIC("外网"),
        LAN("局域网");

        final String label;

        Environment(String label) {
            this.label = label;
        }
    }

    private static final String PREFS = "babycare_server";
    private static final String PUBLIC_URL = "public_url";
    private static final String LAN_URL = "lan_url";
    private static final String ENVIRONMENT = "environment";
    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");

    private ServerConfig() {}

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String publicUrl(Context context) {
        return preferences(context).getString(PUBLIC_URL, "");
    }

    static String lanUrl(Context context) {
        return preferences(context).getString(LAN_URL, "");
    }

    static Environment environment(Context context) {
        String saved = preferences(context).getString(ENVIRONMENT, Environment.PUBLIC.name());
        try {
            return Environment.valueOf(saved);
        } catch (IllegalArgumentException ignored) {
            return Environment.PUBLIC;
        }
    }

    static String selectedUrl(Context context) {
        return environment(context) == Environment.PUBLIC ? publicUrl(context) : lanUrl(context);
    }

    static void save(Context context, String publicUrl, String lanUrl, Environment environment) {
        preferences(context).edit()
            .putString(PUBLIC_URL, normalize(publicUrl))
            .putString(LAN_URL, normalize(lanUrl))
            .putString(ENVIRONMENT, environment.name())
            .apply();
    }

    static String validate(String value, Environment environment) {
        String normalized = normalize(value);
        if (normalized.isEmpty()) return "请填写" + environment.label + "服务器地址";

        final URI uri;
        try {
            uri = URI.create(normalized);
        } catch (IllegalArgumentException error) {
            return "地址格式不正确";
        }

        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost();
        if (host == null || host.isBlank() || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
            return "请填写完整的服务器根地址，不要包含账号、参数或页面路径";
        }
        if (!uri.getPath().isEmpty() && !"/".equals(uri.getPath())) {
            return "服务器地址不能包含页面路径";
        }

        if (environment == Environment.PUBLIC && !"https".equals(scheme)) {
            return "外网地址必须使用 HTTPS";
        }
        if (environment == Environment.LAN) {
            if (!"http".equals(scheme) && !"https".equals(scheme)) return "局域网地址必须使用 HTTP 或 HTTPS";
            if ("http".equals(scheme) && !isPrivateLanHost(host)) return "HTTP 仅允许私网 IP、.local 或局域网主机名";
        }
        return null;
    }

    static String normalize(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    static boolean sameOrigin(String candidate, String selectedServer) {
        try {
            URI left = URI.create(candidate);
            URI right = URI.create(selectedServer);
            return left.getScheme().equalsIgnoreCase(right.getScheme())
                && left.getHost().equalsIgnoreCase(right.getHost())
                && effectivePort(left) == effectivePort(right);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static boolean isPrivateLanHost(String host) {
        String lower = host.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".local") || (!lower.contains(".") && !lower.contains(":"))) return true;
        if ("10.0.2.2".equals(lower)) return true;

        Matcher matcher = IPV4.matcher(lower);
        if (!matcher.matches()) return lower.startsWith("fd") || lower.startsWith("fc") || lower.startsWith("fe80:");
        int first = Integer.parseInt(matcher.group(1));
        int second = Integer.parseInt(matcher.group(2));
        for (int index = 1; index <= 4; index++) {
            if (Integer.parseInt(matcher.group(index)) > 255) return false;
        }
        return first == 10
            || (first == 172 && second >= 16 && second <= 31)
            || (first == 192 && second == 168);
    }

    static void probe(String url, ProbeCallback callback) {
        new Thread(() -> {
            boolean success = false;
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url + "/api/health").openConnection();
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept", "application/json");
                connection.setInstanceFollowRedirects(false);
                int status = connection.getResponseCode();
                success = status >= 200 && status < 300;
            } catch (Exception ignored) {
                // 连接失败
            } finally {
                if (connection != null) connection.disconnect();
            }
            callback.onResult(success);
        }).start();
    }
}
