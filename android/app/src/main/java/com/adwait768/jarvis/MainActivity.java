package com.adwait768.jarvis;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final int MIC_PERMISSION_REQUEST = 7001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new JarvisAndroidBridge(this), "JarvisAndroid");

        new Handler().postDelayed(() -> injectJarvisNativeHelpers(webView), 1200);
        new Handler().postDelayed(() -> injectJarvisNativeHelpers(webView), 3000);

        if (android.os.Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.MODIFY_AUDIO_SETTINGS
            }, MIC_PERMISSION_REQUEST);
        }
    }

    private void injectJarvisNativeHelpers(WebView webView) {
        String js = "(function(){" +
                "if(window.__JARVIS_NATIVE_READY)return;window.__JARVIS_NATIVE_READY=true;" +
                "window.JARVIS_NATIVE={" +
                "openApp:function(name){return window.JarvisAndroid&&window.JarvisAndroid.openApp(String(name));}," +
                "playMusic:function(q){return window.JarvisAndroid&&window.JarvisAndroid.playMusic(String(q||''));}," +
                "requestMicrophone:function(){return window.JarvisAndroid&&window.JarvisAndroid.requestMicrophone();}," +
                "openUrl:function(url){return window.JarvisAndroid&&window.JarvisAndroid.openUrl(String(url));}" +
                "};" +
                "var input=document.querySelector('.controls input');" +
                "if(input){input.addEventListener('keydown',function(e){" +
                "if(e.key!=='Enter')return;var v=(input.value||'').trim();" +
                "var m=v.match(/^open\\s+(.+)$/i);" +
                "if(m&&window.JarvisAndroid){if(window.JarvisAndroid.openApp(m[1])){e.preventDefault();e.stopImmediatePropagation();return;}}" +
                "var p=v.match(/^(play|play music|listen to)\\s+(.+)$/i);" +
                "if(p&&window.JarvisAndroid){if(window.JarvisAndroid.playMusic(p[2])){e.preventDefault();e.stopImmediatePropagation();return;}}" +
                "},true);}" +
                "var mic=document.querySelector('.mic');if(mic){mic.addEventListener('click',function(){if(window.JarvisAndroid)window.JarvisAndroid.requestMicrophone();},true);}" +
                "})();";
        webView.evaluateJavascript(js, null);
    }

    public static class JarvisAndroidBridge {
        private final Activity activity;
        private final Map<String,String> packages = new HashMap<>();

        JarvisAndroidBridge(Activity activity) {
            this.activity = activity;
            String[][] apps = {
                {"youtube", "com.google.android.youtube"},
                {"youtube music", "com.google.android.apps.youtube.music"},
                {"whatsapp", "com.whatsapp"},
                {"instagram", "com.instagram.android"},
                {"facebook", "com.facebook.katana"},
                {"telegram", "org.telegram.messenger"},
                {"spotify", "com.spotify.music"},
                {"chrome", "com.android.chrome"},
                {"gmail", "com.google.android.gm"},
                {"maps", "com.google.android.apps.maps"},
                {"google maps", "com.google.android.apps.maps"},
                {"play store", "com.android.vending"},
                {"settings", "com.android.settings"},
                {"calculator", "com.google.android.calculator"},
                {"phone", "com.google.android.dialer"},
                {"messages", "com.google.android.apps.messaging"},
                {"photos", "com.google.android.apps.photos"}
            };
            for (String[] a : apps) packages.put(a[0], a[1]);
        }

        @JavascriptInterface
        public boolean openApp(String requested) {
            String name = requested == null ? "" : requested.toLowerCase(Locale.ROOT).trim();
            String pkg = packages.get(name);
            if (pkg == null) {
                for (Map.Entry<String,String> e : packages.entrySet()) {
                    if (name.contains(e.getKey())) {
                        pkg = e.getValue();
                        break;
                    }
                }
            }
            if (pkg == null) return false;
            Intent launch = activity.getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch == null) return false;
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(launch);
            return true;
        }

        @JavascriptInterface
        public boolean openUrl(String url) {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return false;
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean playMusic(String query) {
            String q = query == null ? "" : query.trim();
            try {
                Uri uri = Uri.parse("https://music.youtube.com/search?q=" + Uri.encode(q));
                Intent i = new Intent(Intent.ACTION_VIEW, uri);
                i.setPackage("com.google.android.apps.youtube.music");
                try {
                    activity.startActivity(i);
                } catch (Exception noYouTubeMusic) {
                    i.setPackage(null);
                    activity.startActivity(i);
                }
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public void requestMicrophone() {
            if (android.os.Build.VERSION.SDK_INT >= 23 &&
                    activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(new String[]{
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.MODIFY_AUDIO_SETTINGS
                }, MIC_PERMISSION_REQUEST);
            }
        }
    }
}
