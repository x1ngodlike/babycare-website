package com.babycare.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
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
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 41;

    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorView;
    private TextView errorMessage;
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createContentView();
        configureSystemBars();
        configureWebView();

        if (ServerConfig.selectedUrl(this).isEmpty()) showServerDialog(true);
        else loadSelectedServer();
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
        retry.setOnClickListener(view -> loadSelectedServer());
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
        settings.setUserAgentString(settings.getUserAgentString() + " BabyCareAndroid/1.1.2");
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
        public String getEnvironmentLabel() {
            return ServerConfig.environment(MainActivity.this).label;
        }
    }

    @Override
    public void onBackPressed() {
        if (errorView.getVisibility() == View.VISIBLE) {
            showServerDialog(false);
            return;
        }
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
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
        if (webView != null) webView.onResume();
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
