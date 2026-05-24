package com.kanjiflow.app;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    // 집 와이파이(내부망) 우선, 실패하면 외부망으로 자동 전환
    private static final String LAN = "http://192.168.10.35:8005/";
    private static final String WAN = "http://211.109.91.64:8005/";

    private WebView web;
    private boolean triedFallback = false;
    private long pausedAt = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        // TTS 등 미디어 자동재생 허용
        ws.setMediaPlaybackRequiresUserGesture(false);
        // 항상 서버에서 최신본을 불러오도록 캐시 사용 안 함 (업데이트 반영)
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // 내부망 접속 실패 시 한 번만 외부망으로 재시도
                if (!triedFallback && failingUrl != null && failingUrl.startsWith(LAN)) {
                    triedFallback = true;
                    view.loadUrl(WAN);
                }
            }
        });

        setContentView(web);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(LAN);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        pausedAt = System.currentTimeMillis();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 앱을 잠깐이 아니라 한동안(20초 이상) 떠났다가 돌아오면 최신본으로 새로고침
        if (pausedAt > 0 && System.currentTimeMillis() - pausedAt > 20000 && web != null) {
            web.reload();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
