package com.nirixon.app;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

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
