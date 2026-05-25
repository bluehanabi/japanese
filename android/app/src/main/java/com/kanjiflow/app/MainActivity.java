package com.kanjiflow.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import java.util.Locale;

public class MainActivity extends Activity {

    // 외부 접속 전용 (어느 네트워크에서나 동일하게 접속)
    private static final String APP_URL = "http://211.109.91.64:8005/";
    // 앱 테마 배경색 (#0d0f14) — 로딩 중에도 검은 화면 대신 이 색을 보여준다
    private static final int BG = 0xFF0D0F14;

    private WebView web;
    private ProgressBar spinner;
    private long pausedAt = 0;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    // JS 에서 호출하는 네이티브 일본어 TTS (WebView speechSynthesis 보다 안정적)
    public class TTSBridge {
        @JavascriptInterface
        public void speak(final String text) {
            if (!ttsReady || text == null || text.isEmpty()) return;
            runOnUiThread(() -> tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kf"));
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.JAPANESE);
                ttsReady = true;
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(BG);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        // TTS 등 미디어 자동재생 허용
        ws.setMediaPlaybackRequiresUserGesture(false);
        // 항상 서버에서 최신본을 불러오도록 캐시 사용 안 함 (업데이트 반영)
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.addJavascriptInterface(new TTSBridge(), "AndroidTTS");

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (spinner != null) spinner.setVisibility(View.VISIBLE);
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if (spinner != null) spinner.setVisibility(View.GONE);
            }
        });

        // 로딩 중 검은 화면 대신 브랜드 배경 + 스피너를 보여준다
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        spinner = new ProgressBar(this);
        FrameLayout.LayoutParams spLp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        root.addView(web, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(spinner, spLp);
        setContentView(root);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
            spinner.setVisibility(View.GONE);
        } else {
            web.loadUrl(APP_URL);
        }
    }

    @Override
    public void onBackPressed() {
        // 뒤로(제스처/버튼)를 WebView 앱 내비게이션으로 전달.
        // 오버레이 닫기/홈 이동은 JS가 처리, 홈에서 누르면 'exit' → 앱을 백그라운드로(종료 X)
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.appBack ? appBack() : 'exit')", value -> {
            if (value == null || value.contains("exit")) {
                moveTaskToBack(true);
            }
        });
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

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }
}
