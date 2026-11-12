package com.nirixon.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends BridgeActivity {

    /** Bridge exposed to the web bundle as window.NirixonNative. */
    private class NirixonNative {
        @JavascriptInterface
        public void printHtml(String html, String jobName) {
            runOnUiThread(() -> {
                final String name = (jobName == null || jobName.isEmpty()) ? "Nirixon" : jobName;
                WebView printView = new WebView(MainActivity.this);
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        if (pm == null) return;
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(name);
                        pm.print(name, adapter, new PrintAttributes.Builder().build());
                    }
                });
                printView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            });
        }

        @JavascriptInterface
        public void printPage(String jobName) {
            runOnUiThread(() -> {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) return;
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) return;
                String name = (jobName == null || jobName.isEmpty()) ? "Nirixon" : jobName;
                PrintDocumentAdapter adapter = wv.createPrintDocumentAdapter(name);
                pm.print(name, adapter, new PrintAttributes.Builder().build());
            });
        }

        @JavascriptInterface
        public boolean saveFile(String filename, String mime, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getCacheDir();
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, filename);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(data);
                }
                Uri uri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        file);
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(share, filename);
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> startActivity(chooser));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void openExternal(String url) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> startActivity(intent));
            } catch (Exception ignored) {
                // No app can handle the scheme; stay in the WebView.
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        // Native print / file-save / external-app handoff for the web bundle.
        webView.addJavascriptInterface(new NirixonNative(), "NirixonNative");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception ignored) {
                // Ignore unsupported downloads; the in-app summary works offline.
            }
        });

        // Android keeps the WebView HTTP cache across APK updates. Without this,
        // an updated app can keep loading the previous index.html/bundle and look
        // like nothing changed. Clear it once per installed version.
        SharedPreferences prefs = getSharedPreferences("nirixon", MODE_PRIVATE);
        long installedVersion = -1;
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            installedVersion = PackageInfoCompat.getLongVersionCode(info);
        } catch (PackageManager.NameNotFoundException ignored) {
            // Should not happen for our own package.
        }
        if (prefs.getLong("webview_cache_version", -1L) != installedVersion) {
            webView.clearCache(true);
            prefs.edit().putLong("webview_cache_version", installedVersion).apply();
            webView.reload();
        }
    }
}
