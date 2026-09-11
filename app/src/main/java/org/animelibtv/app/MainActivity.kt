package org.animelibtv.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.text.InputType
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
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
import android.widget.EditText
import android.widget.Toast
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.IOException

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var fullscreenContainer: FrameLayout
    private lateinit var adBlocker: AdBlocker
    private lateinit var updateManager: UpdateManager
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var inputDialog: AlertDialog? = null
    @Volatile private var playerInputMode = false
    @Volatile private var playerInFrame = false
    @Volatile private var frameInputMode = false
    @Volatile private var frameCssFullscreen = false
    @Volatile private var videoCssFullscreen = false
    private var lastRemoteDispatchAt = 0L
    private var lastRemoteKeyCode = KeyEvent.KEYCODE_UNKNOWN
    private val navigationScript by lazy {
        assets.open("remote-navigation.js").bufferedReader().use { it.readText() }
    }
    private val playerNavigationScript by lazy {
        assets.open("player-navigation.js").bufferedReader().use { it.readText() }
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
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        webView.addJavascriptInterface(WebBridge(), "AnimeLibTvNative")
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                playerNavigationScript,
                setOf("*"),
            )
        }
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
        inputDialog?.dismiss()
        updateManager.shutdown()
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.removeJavascriptInterface("AnimeLibTvNative")
        webView.destroy()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isPress = event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0
        val isDown = event.action == KeyEvent.ACTION_DOWN

        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (isPress) handleBack()
            return true
        }

        if (event.keyCode == KeyEvent.KEYCODE_MENU ||
            event.keyCode == KeyEvent.KEYCODE_SETTINGS ||
            event.keyCode == KeyEvent.KEYCODE_INFO
        ) {
            if (isPress) showAdBlockSettings()
            return true
        }

        if (fullscreenView != null) {
            return super.dispatchKeyEvent(event)
        }

        if (playerInputMode) {
            if (playerInFrame) {
                val playerKey = event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                    event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
                    event.keyCode == KeyEvent.KEYCODE_DPAD_UP ||
                    event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
                    event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                    event.keyCode == KeyEvent.KEYCODE_ENTER ||
                    event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
                    event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                if (playerKey && event.action == KeyEvent.ACTION_UP) return true
                return super.dispatchKeyEvent(event)
            }
            val playerCommand = when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> "left"
                KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
                KeyEvent.KEYCODE_DPAD_UP -> "up"
                KeyEvent.KEYCODE_DPAD_DOWN -> "down"
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "activate"
                else -> null
            }
            if (playerCommand != null) {
                val repeatable = playerCommand != "activate"
                val dispatch = if (repeatable) {
                    isDown && shouldDispatchRepeat(event, 130L)
                } else {
                    isPress
                }
                if (dispatch) {
                    webView.evaluateJavascript(
                        "window.AnimeLibTvPlayer && window.AnimeLibTvPlayer.handle('$playerCommand')",
                        null,
                    )
                }
                return true
            }
            return super.dispatchKeyEvent(event)
        }

        if (frameInputMode) {
            val backwards = event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_UP
            val forwards = event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN
            if (backwards || forwards) {
                if (isDown && shouldDispatchRepeat(event, 150L)) dispatchTab(backwards)
                return true
            }
            return super.dispatchKeyEvent(event)
        }

        val command = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> "move('left')"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "move('right')"
            KeyEvent.KEYCODE_DPAD_UP -> "move('up')"
            KeyEvent.KEYCODE_DPAD_DOWN -> "move('down')"
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> "scrollPage(-1)"
            KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> "scrollPage(1)"
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "activate()"
            else -> null
        }

        if (command != null) {
            val repeatable = event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_UP ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
                event.keyCode == KeyEvent.KEYCODE_CHANNEL_UP ||
                event.keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN ||
                event.keyCode == KeyEvent.KEYCODE_PAGE_UP ||
                event.keyCode == KeyEvent.KEYCODE_PAGE_DOWN
            val dispatch = if (repeatable) {
                isDown && shouldDispatchRepeat(event, 130L)
            } else {
                isPress
            }
            if (dispatch) webView.evaluateJavascript("window.AnimeLibTv && window.AnimeLibTv.$command", null)
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @Deprecated("Handled for TV remotes that route Back through Activity instead of dispatchKeyEvent")
    override fun onBackPressed() {
        handleBack()
    }

    private fun shouldDispatchRepeat(event: KeyEvent, intervalMs: Long): Boolean {
        val now = SystemClock.uptimeMillis()
        if (event.repeatCount == 0 || event.keyCode != lastRemoteKeyCode ||
            now - lastRemoteDispatchAt >= intervalMs
        ) {
            lastRemoteKeyCode = event.keyCode
            lastRemoteDispatchAt = now
            return true
        }
        return false
    }

    private fun setFrameCssFullscreen(enabled: Boolean) {
        frameCssFullscreen = enabled
        webView.evaluateJavascript(
            "window.AnimeLibTv && window.AnimeLibTv.setFrameFullscreen($enabled)",
            null,
        )
    }

    private fun setVideoCssFullscreen(enabled: Boolean) {
        videoCssFullscreen = enabled
        webView.evaluateJavascript(
            "window.AnimeLibTv && window.AnimeLibTv.setVideoFullscreen($enabled)",
            null,
        )
    }

    private fun handleBack() {
        when {
            fullscreenView != null -> hideFullscreenVideo()
            videoCssFullscreen -> setVideoCssFullscreen(false)
            frameCssFullscreen -> setFrameCssFullscreen(false)
            playerInputMode -> {
                playerInputMode = false
                playerInFrame = false
                webView.evaluateJavascript("window.AnimeLibTv && window.AnimeLibTv.leavePlayer()", null)
            }
            frameInputMode -> {
                frameInputMode = false
                hideKeyboard()
                webView.evaluateJavascript("window.AnimeLibTv && window.AnimeLibTv.leaveFrame()", null)
            }
            webView.canGoBack() -> webView.goBack()
            !isHomeUrl(webView.url) -> webView.loadUrl(HOME_URL)
            else -> Unit
        }
    }

    private fun isHomeUrl(url: String?): Boolean {
        val uri = url?.let(Uri::parse) ?: return false
        return uri.host.equals("v5.animelib.org", ignoreCase = true) &&
            (uri.path == "/ru" || uri.path == "/ru/")
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

    private fun showNativeInput(initialValue: String, type: String, inputMode: String, placeholder: String) {
        runOnUiThread {
            if (isFinishing || isDestroyed) return@runOnUiThread
            inputDialog?.dismiss()
            val editor = EditText(this).apply {
                setText(initialValue)
                setSelection(text.length)
                hint = placeholder
                isSingleLine = true
                imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE
                this.inputType = when {
                    type.equals("password", true) ->
                        InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                    type.equals("email", true) ->
                        InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                    type.equals("tel", true) -> InputType.TYPE_CLASS_PHONE
                    type.equals("number", true) || inputMode.equals("numeric", true) ||
                        inputMode.equals("decimal", true) -> InputType.TYPE_CLASS_NUMBER
                    else -> InputType.TYPE_CLASS_TEXT
                }
            }
            lateinit var dialog: AlertDialog
            fun submit() {
                val encodedValue = JSONObject.quote(editor.text.toString())
                webView.evaluateJavascript(
                    "window.AnimeLibTv && window.AnimeLibTv.setInputValue($encodedValue)",
                    null,
                )
                dialog.dismiss()
            }
            dialog = AlertDialog.Builder(this)
                .setTitle(if (placeholder.isBlank()) getString(R.string.input_value_title) else placeholder)
                .setView(editor)
                .setPositiveButton(android.R.string.ok) { _, _ -> submit() }
                .setNegativeButton(android.R.string.cancel, null)
                .create()
            editor.setOnEditorActionListener { _, actionId, _ ->
                if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                    submit()
                    true
                } else {
                    false
                }
            }
            dialog.setOnDismissListener {
                if (inputDialog === dialog) inputDialog = null
            }
            inputDialog = dialog
            dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
            dialog.show()
            dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
            editor.requestFocus()
            editor.postDelayed({
                getSystemService(InputMethodManager::class.java).showSoftInput(
                    editor,
                    InputMethodManager.SHOW_IMPLICIT,
                )
            }, 150)
        }
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
        playerInFrame = false
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
        playerInFrame = false
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
            playerInFrame = false
            frameInputMode = false
        }

        @JavascriptInterface
        fun enterFramePlayerMode() {
            playerInputMode = true
            playerInFrame = true
            frameInputMode = false
        }

        @JavascriptInterface
        fun toggleFrameFullscreen() {
            runOnUiThread { setFrameCssFullscreen(!frameCssFullscreen) }
        }

        @JavascriptInterface
        fun toggleVideoFullscreen() {
            runOnUiThread { setVideoCssFullscreen(!videoCssFullscreen) }
        }

        @JavascriptInterface
        fun enterFrameMode() {
            frameInputMode = true
            playerInputMode = false
            playerInFrame = false
        }

        @JavascriptInterface
        fun showInput(initialValue: String, type: String, inputMode: String, placeholder: String) {
            showNativeInput(initialValue, type, inputMode, placeholder)
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
            playerInFrame = false
            frameInputMode = false
            frameCssFullscreen = false
            videoCssFullscreen = false
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
