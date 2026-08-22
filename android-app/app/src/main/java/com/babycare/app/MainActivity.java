package com.babycare.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.CalendarContract;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 41;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 42;

    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorView;
    private TextView errorMessage;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String pendingNotificationTarget;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean wasUsingLan = false;
    private long lastAutoSwitchTime = 0;
    private static final long AUTO_SWITCH_COOLDOWN_MS = 3000; // 3秒冷却时间，防止频繁切换

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createContentView();
        configureSystemBars();
        NotificationScheduler.createChannel(this);
        AppNotificationPoller.start(this);
        captureNotificationTarget(getIntent());
        configureWebView();
        registerNetworkCallback();

        String selectedUrl = ServerConfig.selectedUrl(this);
        if (selectedUrl.isEmpty()) {
            showServerDialog(true); // 首次使用，未配置
        } else {
            // 智能降级：优先连接局域网，失败尝试外网
            String lanUrl = ServerConfig.lanUrl(this);
            String publicUrl = ServerConfig.publicUrl(this);
            ServerConfig.Environment env = ServerConfig.environment(this);
            
            // 如果配置了局域网，优先尝试
            if (!lanUrl.isEmpty() && !publicUrl.isEmpty()) {
                // 两个都配置了，先尝试当前选择的环境
                probeAndConnect(selectedUrl, () -> {
                    // 当前选择的失败，尝试另一个
                    String fallbackUrl = env == ServerConfig.Environment.LAN ? publicUrl : lanUrl;
                    probeAndConnect(fallbackUrl, () -> {
                        // 都失败，显示错误页
                        String errorMsg = env == ServerConfig.Environment.LAN
                            ? "局域网和外网均无法连接，请检查网络或切换服务器"
                            : "外网和局域网均无法连接，请检查网络或切换服务器";
                        runOnUiThread(() -> showConnectionError(errorMsg));
                    });
                });
            } else if (!lanUrl.isEmpty()) {
                // 只配置了局域网
                probeAndConnect(lanUrl, () -> {
                    runOnUiThread(() -> showConnectionError("无法连接局域网服务器，请检查 WiFi 和服务器状态"));
                });
            } else if (!publicUrl.isEmpty()) {
                // 只配置了外网
                probeAndConnect(publicUrl, () -> {
                    runOnUiThread(() -> showConnectionError("无法连接外网服务器，请检查网络或切换服务器"));
                });
            } else {
                showServerDialog(true); // 都为空，需要配置
            }
        }
    }

    private void probeAndConnect(String url, Runnable onFail) {
        ServerConfig.probe(url, success -> {
            if (success) {
                // 连接成功，自动更新环境选择
                ServerConfig.Environment newEnv = url.equals(ServerConfig.lanUrl(this)) 
                    ? ServerConfig.Environment.LAN 
                    : ServerConfig.Environment.PUBLIC;
                ServerConfig.save(this, ServerConfig.publicUrl(this), ServerConfig.lanUrl(this), newEnv);
                runOnUiThread(() -> loadSelectedServer());
            } else {
                onFail.run();
            }
        });
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                runOnUiThread(() -> handleNetworkChange());
            }

            @Override
            public void onLost(Network network) {
                runOnUiThread(() -> handleNetworkChange());
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities networkCapabilities) {
                runOnUiThread(() -> handleNetworkChange());
            }
        };

        NetworkRequest request = new NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();
        connectivityManager.registerNetworkCallback(request, networkCallback);

        // 初始化当前网络状态
        wasUsingLan = isWifiConnected() && ServerConfig.environment(this) == ServerConfig.Environment.LAN;
    }

    private void handleNetworkChange() {
        if (System.currentTimeMillis() - lastAutoSwitchTime < AUTO_SWITCH_COOLDOWN_MS) {
            return; // 冷却时间内，不处理
        }

        boolean wifiConnected = isWifiConnected();
        ServerConfig.Environment currentEnv = ServerConfig.environment(this);

        // 如果当前使用的是局域网，但 WiFi 已断开，自动切换到外网
        if (currentEnv == ServerConfig.Environment.LAN && !wifiConnected) {
            String lanUrl = ServerConfig.lanUrl(this);
            String publicUrl = ServerConfig.publicUrl(this);
            
            // 只有外网地址配置了才切换
            if (publicUrl != null && !publicUrl.isEmpty()) {
                // 探测外网是否可用
                ServerConfig.probe(publicUrl, success -> {
                    if (success) {
                        ServerConfig.save(MainActivity.this, publicUrl, lanUrl, ServerConfig.Environment.PUBLIC);
                        lastAutoSwitchTime = System.currentTimeMillis();
                        wasUsingLan = false;
                        runOnUiThread(this::loadSelectedServer);
                    } else {
                        // 外网也不可用，显示错误页
                        runOnUiThread(() -> showConnectionError("局域网不可用，外网也无法连接，请检查网络或切换服务器"));
                    }
                });
                return;
            } else {
                // 没有外网地址，显示错误页
                runOnUiThread(() -> showConnectionError("WiFi 已断开，且未配置外网服务器，请切换服务器"));
            }
        }

        // 如果 WiFi 重新连接，且之前使用的是局域网（自动切换前），提示用户可切回
        if (wifiConnected && wasUsingLan && currentEnv == ServerConfig.Environment.PUBLIC) {
            wasUsingLan = false; // 重置，避免重复提示
            // 不自动切回，因为用户可能已经习惯外网，需要手动切换
        }

        wasUsingLan = wifiConnected && ServerConfig.environment(this) == ServerConfig.Environment.LAN;
    }

    private boolean isWifiConnected() {
        if (connectivityManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network network = connectivityManager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
            return capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        } else {
            // 旧版本API
            @SuppressWarnings("deprecation")
            android.net.NetworkInfo wifiInfo = connectivityManager.getNetworkInfo(ConnectivityManager.TYPE_WIFI);
            return wifiInfo != null && wifiInfo.isConnected();
        }
    }

    private void configureSystemBars() {
        Window window = getWindow();
        int background = getColor(R.color.brand_background);
        boolean darkMode = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
        window.setStatusBarColor(background);
        window.setNavigationBarColor(background);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(true);
            WindowInsetsController controller = window.getDecorView().getWindowInsetsController();
            if (controller != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(darkMode ? 0 : mask, mask);
            }
        } else {
            int flags = window.getDecorView().getSystemUiVisibility();
            int lightFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            window.getDecorView().setSystemUiVisibility(darkMode ? flags & ~lightFlags : flags | lightFlags);
        }
    }

    private void createContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.brand_background));
        root.setFitsSystemWindows(true);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(false);
        progressBar.setMax(100);
        progressBar.setProgressTintList(ColorStateList.valueOf(getColor(R.color.brand_primary)));
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        );
        progressParams.gravity = Gravity.TOP;
        root.addView(progressBar, progressParams);

        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(dp(32), dp(32), dp(32), dp(32));
        errorView.setBackgroundColor(getColor(R.color.brand_background));
        errorView.setVisibility(View.GONE);

        TextView errorTitle = new TextView(this);
        errorTitle.setText("无法连接服务器");
        errorTitle.setTextSize(22);
        errorTitle.setTextColor(getColor(R.color.brand_text));
        errorTitle.setGravity(Gravity.CENTER);
        errorView.addView(errorTitle, matchWrap(dp(0), dp(0)));

        errorMessage = new TextView(this);
        errorMessage.setText("请检查网络和服务器地址，然后重试。");
        errorMessage.setTextSize(15);
        errorMessage.setTextColor(getColor(R.color.brand_text_secondary));
        errorMessage.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = matchWrap(dp(0), dp(20));
        errorView.addView(errorMessage, messageParams);

        Button retry = createButton("重新连接");
        retry.setOnClickListener(view -> retryConnection());
        errorView.addView(retry, matchWrap(dp(0), dp(18)));

        Button change = createButton("更换服务器");
        change.setOnClickListener(view -> showServerDialog(false));
        errorView.addView(change, matchWrap(dp(0), dp(10)));

        root.addView(errorView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
    }

    private Button createButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setMinHeight(dp(48));
        button.setAllCaps(false);
        return button;
    }

    private LinearLayout.LayoutParams matchWrap(int top, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, top, 0, bottom);
        return params;
    }

    @SuppressWarnings("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " BabyCareAndroid/1.4.0");
        webView.addJavascriptInterface(new NativeBridge(), "BabyCareNative");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
                String selected = ServerConfig.selectedUrl(MainActivity.this);
                if (("http".equals(scheme) || "https".equals(scheme)) && ServerConfig.sameOrigin(uri.toString(), selected)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                errorView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
                dispatchNotificationTarget();
                AppNotificationPoller.pollNow(MainActivity.this);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                showConnectionError("服务器暂时不可用，请确认当前网络可以访问所选地址。");
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) {
                    showConnectionError("服务器返回 " + response.getStatusCode() + "，请稍后重试或更换服务器。");
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                showConnectionError("服务器证书无效或已过期。为保护家庭数据，应用没有继续连接。");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception error) {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                }
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "没有可用的文件选择器", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener(createDownloadListener());
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (!URLUtil.isNetworkUrl(url) || !ServerConfig.sameOrigin(url, ServerConfig.selectedUrl(this))) {
                Toast.makeText(this, "已阻止不受信任的下载地址", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.setTitle(fileName);
                request.setDescription("正在导出宝宝照护备份");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(this, "已开始下载，可在系统通知中查看", Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                Toast.makeText(this, "下载失败，请稍后重试", Toast.LENGTH_LONG).show();
            }
        };
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme) && !"mailto".equals(scheme) && !"tel".equals(scheme)) {
            Toast.makeText(this, "已阻止不支持的链接", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "没有可打开此链接的应用", Toast.LENGTH_SHORT).show();
        }
    }

    private void loadSelectedServer() {
        String server = ServerConfig.selectedUrl(this);
        if (server.isEmpty()) {
            showServerDialog(true);
            return;
        }
        errorView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(server + "/");
    }

    private void showConnectionError(String message) {
        progressBar.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorView.setVisibility(View.VISIBLE);
    }

    private void retryConnection() {
        errorView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        
        String selectedUrl = ServerConfig.selectedUrl(this);
        if (selectedUrl.isEmpty()) {
            showServerDialog(true);
            return;
        }

        String lanUrl = ServerConfig.lanUrl(this);
        String publicUrl = ServerConfig.publicUrl(this);
        ServerConfig.Environment env = ServerConfig.environment(this);
        
        if (!lanUrl.isEmpty() && !publicUrl.isEmpty()) {
            // 两个都配置了，先尝试当前选择的环境
            probeAndConnect(selectedUrl, () -> {
                String fallbackUrl = env == ServerConfig.Environment.LAN ? publicUrl : lanUrl;
                probeAndConnect(fallbackUrl, () -> {
                    String errorMsg = env == ServerConfig.Environment.LAN
                        ? "局域网和外网均无法连接，请检查网络或切换服务器"
                        : "外网和局域网均无法连接，请检查网络或切换服务器";
                    runOnUiThread(() -> showConnectionError(errorMsg));
                });
            });
        } else if (!lanUrl.isEmpty()) {
            probeAndConnect(lanUrl, () -> 
                runOnUiThread(() -> showConnectionError("无法连接局域网服务器，请检查 WiFi 和服务器状态"))
            );
        } else if (!publicUrl.isEmpty()) {
            probeAndConnect(publicUrl, () -> 
                runOnUiThread(() -> showConnectionError("无法连接外网服务器，请检查网络或切换服务器"))
            );
        } else {
            showServerDialog(true);
        }
    }

    private void showServerDialog(boolean required) {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(8), dp(24), 0);

        TextView intro = new TextView(this);
        intro.setText(required
            ? "首次使用请填写服务器地址。连接成功后会记住本次选择。"
            : "切换环境会重新加载页面。未同步记录仍保留在原环境，下次返回后可继续同步。");
        intro.setTextSize(15);
        intro.setTextColor(getColor(R.color.brand_text));
        content.addView(intro, matchWrap(0, dp(16)));

        RadioGroup radioGroup = new RadioGroup(this);
        radioGroup.setOrientation(LinearLayout.HORIZONTAL);
        RadioButton publicRadio = new RadioButton(this);
        publicRadio.setText("外网");
        publicRadio.setId(View.generateViewId());
        RadioButton lanRadio = new RadioButton(this);
        lanRadio.setText("局域网");
        lanRadio.setId(View.generateViewId());
        radioGroup.addView(publicRadio);
        radioGroup.addView(lanRadio);
        content.addView(radioGroup, matchWrap(0, dp(12)));

        EditText publicInput = createUrlInput("外网 HTTPS 地址，例如 https://baby.example.com", ServerConfig.publicUrl(this));
        content.addView(publicInput, matchWrap(0, dp(10)));
        EditText lanInput = createUrlInput("局域网地址，例如 http://192.168.1.10:5937", ServerConfig.lanUrl(this));
        content.addView(lanInput, matchWrap(0, dp(10)));

        TextView status = new TextView(this);
        status.setText(R.string.server_health_hint);
        status.setTextSize(14);
        status.setTextColor(getColor(R.color.brand_text_secondary));
        content.addView(status, matchWrap(0, 0));

        ServerConfig.Environment current = ServerConfig.environment(this);
        if (current == ServerConfig.Environment.LAN) lanRadio.setChecked(true);
        else publicRadio.setChecked(true);

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("服务器设置")
            .setView(content)
            .setPositiveButton("测试并连接", null)
            .setNegativeButton(required ? null : "取消", null)
            .setCancelable(!required)
            .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            ServerConfig.Environment selected = lanRadio.isChecked() ? ServerConfig.Environment.LAN : ServerConfig.Environment.PUBLIC;
            String selectedValue = selected == ServerConfig.Environment.LAN ? lanInput.getText().toString() : publicInput.getText().toString();
            String validation = ServerConfig.validate(selectedValue, selected);
            if (validation != null) {
                status.setText(validation);
                status.setTextColor(Color.rgb(170, 35, 35));
                return;
            }

            status.setText("正在测试连接…");
            status.setTextColor(getColor(R.color.brand_text_secondary));
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            testServer(ServerConfig.normalize(selectedValue), (success, message) -> {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                if (!success) {
                    status.setText(message);
                    status.setTextColor(Color.rgb(170, 35, 35));
                    return;
                }
                ServerConfig.save(
                    this,
                    publicInput.getText().toString(),
                    lanInput.getText().toString(),
                    selected
                );
                AppNotificationPoller.start(this);
                dialog.dismiss();
                loadSelectedServer();
            });
        }));
        dialog.show();
    }

    private EditText createUrlInput(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setSingleLine(true);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        input.setMinHeight(dp(52));
        return input;
    }

    private interface ServerTestCallback {
        void complete(boolean success, String message);
    }

    private void testServer(String server, ServerTestCallback callback) {
        networkExecutor.execute(() -> {
            boolean success = false;
            String message = "连接失败，请检查地址、Wi-Fi 和服务器状态";
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(server + "/api/health").openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setRequestProperty("Accept", "application/json");
                connection.setInstanceFollowRedirects(false);
                int status = connection.getResponseCode();
                success = status >= 200 && status < 300;
                if (!success) message = "服务器返回 " + status + "，请确认这是宝宝照护服务地址";
            } catch (Exception error) {
                String detail = error.getMessage();
                if (detail != null && !detail.isBlank()) message = "连接失败：" + detail;
            } finally {
                if (connection != null) connection.disconnect();
            }
            boolean finalSuccess = success;
            String finalMessage = message;
            runOnUiThread(() -> callback.complete(finalSuccess, finalMessage));
        });
    }

    private final class NativeBridge {
        @JavascriptInterface
        public void openServerSettings() {
            runOnUiThread(() -> showServerDialog(false));
        }

        @JavascriptInterface
        public String getServerInfo() {
            String lanUrl = ServerConfig.lanUrl(MainActivity.this);
            String publicUrl = ServerConfig.publicUrl(MainActivity.this);
            ServerConfig.Environment env = ServerConfig.environment(MainActivity.this);
            String currentUrl = ServerConfig.selectedUrl(MainActivity.this);
            return String.format("{\"lanUrl\":\"%s\",\"publicUrl\":\"%s\",\"environment\":\"%s\",\"currentUrl\":\"%s\"}",
                lanUrl, publicUrl, env.name(), currentUrl);
        }

        @JavascriptInterface
        public String getEnvironmentLabel() {
            return ServerConfig.environment(MainActivity.this).label;
        }

        @JavascriptInterface
        public String getNotificationPermissionStatus() {
            return NotificationScheduler.permissionStatus(MainActivity.this);
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && !NotificationScheduler.canNotify(MainActivity.this)) {
                    requestPermissions(
                        new String[] { Manifest.permission.POST_NOTIFICATIONS },
                        NOTIFICATION_PERMISSION_REQUEST
                    );
                } else {
                    notifyWebPermissionChanged();
                }
            });
        }

        @JavascriptInterface
        public void showTestNotification(String type) {
            runOnUiThread(() -> {
                if (!NotificationScheduler.showTest(MainActivity.this, type)) {
                    Toast.makeText(MainActivity.this, "请先允许 APP 发送通知", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public String getAppNotificationSettings() {
            return AppNotificationSettings.json(MainActivity.this);
        }

        @JavascriptInterface
        public void saveAppNotificationSettings(String json) {
            runOnUiThread(() -> AppNotificationSettings.save(MainActivity.this, json));
        }

        @JavascriptInterface
        public void syncVaccineReminders(String remindersJson) {
            runOnUiThread(() -> NotificationScheduler.sync(MainActivity.this, remindersJson));
        }

        @JavascriptInterface
        public void addVaccineToCalendar(String title, String appointmentOn, String appointmentTime, String description) {
            runOnUiThread(() -> openCalendarInsert(title, appointmentOn, appointmentTime, description));
        }
    }

    private void openCalendarInsert(String title, String appointmentOn, String appointmentTime, String description) {
        try {
            LocalDate date = LocalDate.parse(appointmentOn);
            boolean allDay = appointmentTime == null || appointmentTime.isBlank();
            long start;
            long end;
            if (allDay) {
                start = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
                end = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
            } else {
                LocalTime time = LocalTime.parse(appointmentTime);
                LocalDateTime localStart = LocalDateTime.of(date, time);
                start = localStart.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                end = localStart.plusHours(1).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            }
            Intent intent = new Intent(Intent.ACTION_INSERT)
                .setData(CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.Events.DESCRIPTION, description)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
                .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end)
                .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, allDay)
                .putExtra(CalendarContract.Events.AVAILABILITY, CalendarContract.Events.AVAILABILITY_BUSY);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "手机上没有可用的日历应用", Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            Toast.makeText(this, "日程信息不完整，请先检查预约时间", Toast.LENGTH_LONG).show();
        }
    }

    private void notifyWebPermissionChanged() {
        if (webView == null) return;
        String status = NotificationScheduler.permissionStatus(this);
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('babycare:native-notification-permission',{detail:'" + status + "'}))",
            null
        );
    }

    private void captureNotificationTarget(Intent intent) {
        if (intent == null) return;
        String target = intent.getStringExtra("notificationTarget");
        if (target != null && !target.isBlank()) pendingNotificationTarget = target;
    }

    private void dispatchNotificationTarget() {
        if (webView == null || pendingNotificationTarget == null) return;
        String target = pendingNotificationTarget.replace("'", "");
        pendingNotificationTarget = null;
        webView.evaluateJavascript(
            "setTimeout(function(){window.dispatchEvent(new CustomEvent('babycare:native-notification-open',{detail:'" + target + "'}));},500)",
            null
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureNotificationTarget(intent);
        dispatchNotificationTarget();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) notifyWebPermissionChanged();
    }

    private volatile boolean jsBackHandled = false;

    @Override
    public void onBackPressed() {
        if (errorView.getVisibility() == View.VISIBLE) {
            showServerDialog(false);
            return;
        }
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        jsBackHandled = false;
        try {
            webView.evaluateJavascript(
                "(function(){try{var r=window.babycareHandleBack&&window.babycareHandleBack();return r===true?'1':'0';}catch(e){return '0';}})();",
                value -> {
                    String safe = value == null ? "" : value;
                    if ("1".equals(safe.replace("\"", ""))) {
                        jsBackHandled = true;
                        return;
                    }
                    if (webView.canGoBack()) webView.goBack();
                    else MainActivity.super.onBackPressed();
                }
            );
        } catch (Exception error) {
            if (webView.canGoBack()) webView.goBack();
            else super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileChooserCallback.onReceiveValue(result);
        fileChooserCallback = null;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            notifyWebPermissionChanged();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onStop() {
        CookieManager.getInstance().flush();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (networkCallback != null && connectivityManager != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
                // 忽略注销异常
            }
            networkCallback = null;
        }
        if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
        fileChooserCallback = null;
        networkExecutor.shutdownNow();
        CookieManager.getInstance().flush();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
