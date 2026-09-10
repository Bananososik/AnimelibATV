package org.animelibtv.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var fullscreenContainer: FrameLayout
    private lateinit var adBlocker: AdBlocker
    private lateinit var updateManager: UpdateManager
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    @Volatile private var playerInputMode = false
    @Volatile private var frameInputMode = false
    private val navigationScript by lazy {
        assets.open("remote-navigation.js").bufferedReader().use { it.readText() }
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        hideSystemUi()

        adBlocker = AdBlocker(this)
        updateManager = UpdateManager(this)
        webView = findViewById(R.id.web_view)
        fullscreenContainer = findViewById(R.id.fullscreen_container)

        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            userAgentString = desktopUserAgent()
            mediaPlaybackRequiresUserGesture = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        webView.addJavascriptInterface(WebBridge(), "AnimeLibTvNative")
        webView.webViewClient = AnimeLibWebViewClient()
        webView.webChromeClient = AnimeLibChromeClient()
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        webView.setInitialScale(50)
        webView.requestFocus()

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(HOME_URL)
        }
        updateManager.checkAtStartup()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        updateManager.onResume()
        hideSystemUi()
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        updateManager.shutdown()
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.removeJavascriptInterface("AnimeLibTvNative")
        webView.destroy()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isPress = event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0

        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (isPress) handleBack()
            return true
        }

        if (event.keyCode == KeyEvent.KEYCODE_MENU || event.keyCode == KeyEvent.KEYCODE_SETTINGS) {
            if (isPress) showAdBlockSettings()
            return true
        }

        if (fullscreenView != null || playerInputMode) {
            return super.dispatchKeyEvent(event)
        }

        if (frameInputMode) {
            val backwards = event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_UP
            val forwards = event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN
            if (backwards || forwards) {
                if (isPress) dispatchTab(backwards)
                return true
            }
            return super.dispatchKeyEvent(event)
        }

        val command = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> "move('left')"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "move('right')"
            KeyEvent.KEYCODE_DPAD_UP -> "move('up')"
            KeyEvent.KEYCODE_DPAD_DOWN -> "move('down')"
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "activate()"
            else -> null
        }

        if (command != null) {
            if (isPress) webView.evaluateJavascript("window.AnimeLibTv && window.AnimeLibTv.$command", null)
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun handleBack() {
        when {
            fullscreenView != null -> hideFullscreenVideo()
            playerInputMode -> {
                playerInputMode = false
                webView.evaluateJavascript("window.AnimeLibTv && window.AnimeLibTv.leavePlayer()", null)
            }
            frameInputMode -> {
                frameInputMode = false
                hideKeyboard()
                webView.evaluateJavascript("window.AnimeLibTv && window.AnimeLibTv.leaveFrame()", null)
            }
            webView.canGoBack() -> webView.goBack()
            else -> finish()
        }
    }

    private fun injectTvNavigation() {
        val desktopViewportScript = """
            (function() {
              var meta = document.querySelector('meta[name="viewport"]');
              if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                (document.head || document.documentElement).appendChild(meta);
              }
              meta.content = 'width=1920, initial-scale=0.5, minimum-scale=0.5, maximum-scale=0.5, user-scalable=no';
              window.dispatchEvent(new Event('resize'));
            })();
        """.trimIndent()
        webView.evaluateJavascript(desktopViewportScript) {
            webView.evaluateJavascript(navigationScript, null)
        }
    }

    private fun showAdBlockSettings() {
        runOnUiThread {
            val modes = arrayOf(
                getString(R.string.adblock_standard),
                getString(R.string.adblock_enhanced),
                getString(R.string.adblock_off),
            )
            val values = arrayOf(AdBlockMode.STANDARD, AdBlockMode.ENHANCED, AdBlockMode.OFF)
            val selected = values.indexOf(adBlocker.mode)

            AlertDialog.Builder(this)
                .setTitle(R.string.adblock_title)
                .setSingleChoiceItems(modes, selected) { dialog, which ->
                    val changed = adBlocker.mode != values[which]
                    adBlocker.mode = values[which]
                    dialog.dismiss()
                    if (changed) {
                        Toast.makeText(this, R.string.adblock_changed, Toast.LENGTH_SHORT).show()
                        webView.reload()
                    }
                }
                .setNegativeButton(android.R.string.cancel, null)
                .setNeutralButton(R.string.check_updates) { _, _ ->
                    updateManager.checkForUpdates(manual = true)
                }
                .show()
        }
    }

    private fun dispatchTab(backwards: Boolean) {
        val now = SystemClock.uptimeMillis()
        val metaState = if (backwards) KeyEvent.META_SHIFT_ON else 0
        webView.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_TAB, 0, metaState))
        webView.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_TAB, 0, metaState))
    }

    private fun showKeyboard() {
        webView.postDelayed({
            webView.requestFocus()
            getSystemService(InputMethodManager::class.java).showSoftInput(
                webView,
                0,
            )
        }, 100)
    }

    private fun hideKeyboard() {
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(webView.windowToken, 0)
    }

    private fun showFullscreenVideo(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (fullscreenView != null) {
            callback.onCustomViewHidden()
            return
        }
        fullscreenView = view
        fullscreenCallback = callback
        fullscreenContainer.addView(
            view,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )
        fullscreenContainer.visibility = View.VISIBLE
        webView.visibility = View.GONE
        playerInputMode = true
        frameInputMode = false
        view.requestFocus()
        hideSystemUi()
    }

    private fun hideFullscreenVideo() {
        val view = fullscreenView ?: return
        fullscreenContainer.removeView(view)
        fullscreenContainer.visibility = View.GONE
        webView.visibility = View.VISIBLE
        fullscreenView = null
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        playerInputMode = false
        frameInputMode = false
        webView.requestFocus()
        hideSystemUi()
    }

    private fun hideSystemUi() {
        window.insetsController?.apply {
            hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
            systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun desktopUserAgent(): String {
        val chromeVersion = WebView.getCurrentWebViewPackage()?.versionName ?: "143.0.0.0"
        return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/$chromeVersion Safari/537.36 AnimeLibTV/0.1"
    }

    inner class WebBridge {
        @JavascriptInterface
        fun openSettings() = showAdBlockSettings()

        @JavascriptInterface
        fun enterPlayerMode() {
            playerInputMode = true
            frameInputMode = false
        }

        @JavascriptInterface
        fun enterFrameMode() {
            frameInputMode = true
            playerInputMode = false
        }

        @JavascriptInterface
        fun showKeyboard() {
            this@MainActivity.showKeyboard()
        }
    }

    private inner class AnimeLibWebViewClient : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            return adBlocker.intercept(request.url) ?: super.shouldInterceptRequest(view, request)
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val scheme = request.url.scheme?.lowercase()
            val host = request.url.host?.lowercase()
            if (scheme == "http" && host == AUTH_HOST) {
                val secureUrl = request.url.buildUpon().scheme("https").build()
                view.loadUrl(secureUrl.toString())
                return true
            }
            return scheme != "http" && scheme != "https"
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            playerInputMode = false
            frameInputMode = false
            super.onPageStarted(view, url, favicon)
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            injectTvNavigation()
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: android.webkit.WebResourceError,
        ) {
            super.onReceivedError(view, request, error)
            if (request.isForMainFrame) {
                Toast.makeText(this@MainActivity, R.string.page_load_error, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private inner class AnimeLibChromeClient : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            showFullscreenVideo(view, callback)
        }

        override fun onHideCustomView() {
            hideFullscreenVideo()
        }
    }

    private companion object {
        const val HOME_URL = "https://v5.animelib.org/ru?section=home-updates"
        const val AUTH_HOST = "auth.hentaicdn.org"
    }
}
