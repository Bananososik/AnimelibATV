package org.animelibtv.app

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream

enum class AdBlockMode(val storedValue: String) {
    STANDARD("standard"),
    ENHANCED("enhanced"),
    OFF("off");

    companion object {
        fun from(value: String?): AdBlockMode = entries.firstOrNull { it.storedValue == value } ?: STANDARD
    }
}

class AdBlocker(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    var mode: AdBlockMode
        get() = AdBlockMode.from(preferences.getString(KEY_MODE, AdBlockMode.STANDARD.storedValue))
        set(value) {
            preferences.edit().putString(KEY_MODE, value.storedValue).apply()
        }

    fun intercept(uri: Uri): WebResourceResponse? {
        if (mode == AdBlockMode.OFF || !shouldBlock(uri)) return null
        return WebResourceResponse(
            "text/plain",
            "utf-8",
            204,
            "No Content",
            emptyMap(),
            ByteArrayInputStream(ByteArray(0)),
        )
    }

    internal fun shouldBlock(uri: Uri): Boolean {
        val host = uri.host?.lowercase().orEmpty()
        val path = uri.path?.lowercase().orEmpty()

        if (host == "kodikplayer.com" || host.endsWith(".kodikplayer.com")) return false
        if (host == "animelib.org" || host.endsWith(".animelib.org")) return false

        if (host == "mc.yandex.ru" || host == "mc.webvisor.org") return true
        if (host == "an.yandex.ru" || host.endsWith(".yandexadexchange.net")) return true
        if ((host == "yandex.ru" || host.endsWith(".yandex.ru")) && path.startsWith("/ads")) return true
        if (host == "yastatic.net" && path.startsWith("/safeframe-bundles")) return true
        if (host == "adfox.yandex.ru" || host.endsWith(".adfox.ru")) return true

        if (mode != AdBlockMode.ENHANCED) return false

        return ENHANCED_HOST_SUFFIXES.any { host == it || host.endsWith(".$it") }
    }

    private companion object {
        const val PREFERENCES = "animelib_tv_preferences"
        const val KEY_MODE = "adblock_mode"

        val ENHANCED_HOST_SUFFIXES = setOf(
            "doubleclick.net",
            "googlesyndication.com",
            "googleadservices.com",
            "adservice.google.com",
            "adnxs.com",
            "criteo.com",
            "criteo.net",
            "taboola.com",
            "outbrain.com",
            "scorecardresearch.com",
            "adsrvr.org",
            "pubmatic.com",
            "rubiconproject.com",
        )
    }
}
