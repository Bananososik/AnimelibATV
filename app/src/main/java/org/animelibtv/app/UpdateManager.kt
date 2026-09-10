package org.animelibtv.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.Executors

class UpdateManager(private val activity: Activity) {
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val preferences = activity.getSharedPreferences(PREFERENCES, Activity.MODE_PRIVATE)
    private var waitingForInstallPermission = false

    fun checkAtStartup() {
        if (UpdateConfig.GITHUB_REPOSITORY.isBlank()) return
        val lastCheck = preferences.getLong(KEY_LAST_CHECK, 0L)
        if (System.currentTimeMillis() - lastCheck < CHECK_INTERVAL_MS) return
        mainHandler.postDelayed({ checkForUpdates(manual = false) }, STARTUP_DELAY_MS)
    }

    fun checkForUpdates(manual: Boolean) {
        if (UpdateConfig.GITHUB_REPOSITORY.isBlank()) {
            if (manual) toast(R.string.update_repository_missing)
            return
        }
        if (manual) toast(R.string.update_checking)
        executor.execute {
            try {
                val release = fetchLatestRelease()
                preferences.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
                mainHandler.post {
                    if (isNewer(release.version, currentVersion())) {
                        showUpdateDialog(release)
                    } else if (manual) {
                        toast(R.string.update_latest_installed)
                    }
                }
            } catch (_: Exception) {
                if (manual) mainHandler.post { toast(R.string.update_check_failed) }
            }
        }
    }

    fun onResume() {
        if (!waitingForInstallPermission) return
        if (activity.packageManager.canRequestPackageInstalls()) {
            waitingForInstallPermission = false
            installDownloadedUpdate()
        }
    }

    fun shutdown() {
        mainHandler.removeCallbacksAndMessages(null)
        executor.shutdownNow()
    }

    private fun fetchLatestRelease(): ReleaseInfo {
        val repository = UpdateConfig.GITHUB_REPOSITORY.trim().trim('/')
        require(repository.matches(Regex("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")))
        val apiUrl = "https://api.github.com/repos/$repository/releases/latest"
        val json = JSONObject(readText(apiUrl))
        val assets = json.getJSONArray("assets")
        var fallback: JSONObject? = null
        var selected: JSONObject? = null
        for (index in 0 until assets.length()) {
            val asset = assets.getJSONObject(index)
            val name = asset.optString("name")
            if (name.equals(UpdateConfig.RELEASE_APK_NAME, ignoreCase = true)) selected = asset
            if (fallback == null && name.endsWith(".apk", ignoreCase = true)) fallback = asset
        }
        val asset = selected ?: fallback ?: error("Release has no APK")
        val downloadUrl = asset.getString("browser_download_url")
        require(URI(downloadUrl).scheme == "https" && URI(downloadUrl).host.equals("github.com", true))
        return ReleaseInfo(json.getString("tag_name"), downloadUrl)
    }

    private fun readText(address: String): String {
        val connection = openConnection(address)
        try {
            require(connection.responseCode in 200..299)
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun showUpdateDialog(release: ReleaseInfo) {
        if (activity.isFinishing || activity.isDestroyed) return
        AlertDialog.Builder(activity)
            .setTitle(R.string.update_available_title)
            .setMessage(activity.getString(R.string.update_available_message, release.version))
            .setPositiveButton(R.string.update_download) { _, _ -> downloadUpdate(release) }
            .setNegativeButton(R.string.update_later, null)
            .show()
    }

    private fun downloadUpdate(release: ReleaseInfo) {
        toast(R.string.update_downloading)
        executor.execute {
            val destination = updateFile()
            val temporary = File(destination.parentFile, "${destination.name}.part")
            try {
                destination.parentFile?.mkdirs()
                temporary.delete()
                val connection = openConnection(release.downloadUrl)
                try {
                    require(connection.responseCode in 200..299)
                    val declaredSize = connection.contentLengthLong
                    require(declaredSize in -1..MAX_APK_SIZE)
                    connection.inputStream.use { input ->
                        temporary.outputStream().use { output ->
                            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                            var total = 0L
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                total += count
                                require(total <= MAX_APK_SIZE)
                                output.write(buffer, 0, count)
                            }
                        }
                    }
                } finally {
                    connection.disconnect()
                }
                require(temporary.length() > 0)
                if (destination.exists()) destination.delete()
                require(temporary.renameTo(destination))
                verifyApk(destination)
                mainHandler.post { requestInstall(destination) }
            } catch (_: Exception) {
                temporary.delete()
                destination.delete()
                mainHandler.post { toast(R.string.update_download_failed) }
            }
        }
    }

    private fun verifyApk(apk: File) {
        val archive = archivePackageInfo(apk) ?: error("Invalid APK")
        require(archive.packageName == activity.packageName)
        val installed = installedPackageInfo()
        require(signingDigests(archive) == signingDigests(installed))
    }

    @Suppress("DEPRECATION")
    private fun archivePackageInfo(apk: File): PackageInfo? =
        if (Build.VERSION.SDK_INT >= 33) {
            activity.packageManager.getPackageArchiveInfo(
                apk.absolutePath,
                PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
            )
        } else {
            activity.packageManager.getPackageArchiveInfo(apk.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
        }

    @Suppress("DEPRECATION")
    private fun installedPackageInfo(): PackageInfo =
        if (Build.VERSION.SDK_INT >= 33) {
            activity.packageManager.getPackageInfo(
                activity.packageName,
                PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()),
            )
        } else {
            activity.packageManager.getPackageInfo(activity.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        }

    @Suppress("DEPRECATION")
    private fun signingDigests(info: PackageInfo): Set<String> {
        val signingInfo = info.signingInfo ?: error("APK has no signing certificate")
        val signatures = if (signingInfo.hasMultipleSigners()) {
            signingInfo.apkContentsSigners
        } else {
            signingInfo.signingCertificateHistory
        }
        return signatures.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
        }.toSet()
    }

    private fun requestInstall(apk: File) {
        if (!apk.isFile) return
        if (!activity.packageManager.canRequestPackageInstalls()) {
            waitingForInstallPermission = true
            activity.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}"),
                ),
            )
            return
        }
        launchInstaller()
    }

    private fun installDownloadedUpdate() {
        if (updateFile().isFile) launchInstaller()
    }

    private fun launchInstaller() {
        val uri = Uri.Builder()
            .scheme("content")
            .authority("${activity.packageName}.updates")
            .path("update.apk")
            .build()
        activity.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, APK_MIME_TYPE)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
        )
    }

    private fun updateFile() = File(activity.cacheDir, "updates/${UpdateConfig.RELEASE_APK_NAME}")

    private fun openConnection(address: String): HttpURLConnection =
        (URI(address).toURL().openConnection() as HttpURLConnection).apply {
            connectTimeout = NETWORK_TIMEOUT_MS
            readTimeout = NETWORK_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "AnimeLibTV/${currentVersion()}")
        }

    private fun currentVersion(): String = installedPackageInfo().versionName ?: "0"

    private fun isNewer(candidate: String, current: String): Boolean {
        val left = VERSION_NUMBER.findAll(candidate).map { it.value.toLongOrNull() ?: 0 }.toList()
        val right = VERSION_NUMBER.findAll(current).map { it.value.toLongOrNull() ?: 0 }.toList()
        for (index in 0 until maxOf(left.size, right.size)) {
            val comparison = (left.getOrElse(index) { 0 }).compareTo(right.getOrElse(index) { 0 })
            if (comparison != 0) return comparison > 0
        }
        return false
    }

    private fun toast(message: Int) = Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()

    private data class ReleaseInfo(val version: String, val downloadUrl: String)

    private companion object {
        const val PREFERENCES = "updates"
        const val KEY_LAST_CHECK = "last_check"
        const val CHECK_INTERVAL_MS = 12L * 60L * 60L * 1000L
        const val STARTUP_DELAY_MS = 5_000L
        const val NETWORK_TIMEOUT_MS = 20_000
        const val MAX_APK_SIZE = 200L * 1024L * 1024L
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        val VERSION_NUMBER = Regex("\\d+")
    }
}
