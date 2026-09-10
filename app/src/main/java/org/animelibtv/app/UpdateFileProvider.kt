package org.animelibtv.app

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

class UpdateFileProvider : ContentProvider() {
    override fun onCreate() = true

    override fun getType(uri: Uri): String {
        requireUpdateUri(uri)
        return APK_MIME_TYPE
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor {
        requireUpdateUri(uri)
        val file = updateFile()
        val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val cursor = MatrixCursor(columns)
        cursor.addRow(columns.map { column ->
            when (column) {
                OpenableColumns.DISPLAY_NAME -> UpdateConfig.RELEASE_APK_NAME
                OpenableColumns.SIZE -> file.length()
                else -> null
            }
        })
        return cursor
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        requireUpdateUri(uri)
        if (mode != "r") throw FileNotFoundException("Update file is read-only")
        val file = updateFile()
        if (!file.isFile) throw FileNotFoundException("Update APK is missing")
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? =
        throw UnsupportedOperationException("Read-only provider")

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException("Read-only provider")

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = throw UnsupportedOperationException("Read-only provider")

    private fun requireUpdateUri(uri: Uri) {
        val expectedAuthority = "${requireContext().packageName}.updates"
        require(uri.scheme == "content" && uri.authority == expectedAuthority && uri.path == UPDATE_PATH) {
            "Unknown update URI"
        }
    }

    private fun updateFile(): File = File(requireContext().cacheDir, "updates/${UpdateConfig.RELEASE_APK_NAME}")

    private companion object {
        const val UPDATE_PATH = "/update.apk"
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }
}
