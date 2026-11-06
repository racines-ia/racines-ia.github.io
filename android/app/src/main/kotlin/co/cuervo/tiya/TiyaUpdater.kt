package co.cuervo.tiya

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Mises à jour intégrées : vérifie la dernière version publiée sur GitHub,
 * la télécharge et ouvre l'installateur Android.
 */
object TiyaUpdater {
    // Dépôt où GitHub publie les APK de Tiya.
    const val REPO = "racines-ia/racines-ia.github.io"

    fun currentVersion(ctx: Context): Pair<String, Long> {
        val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }
        return Pair(info.versionName ?: "?", code)
    }

    private fun preferredAsset(): String {
        val abis = Build.SUPPORTED_ABIS.toList()
        return if (abis.contains("arm64-v8a")) "Tiya.apk" else "Tiya-armv7.apk"
    }

    /** À appeler hors du fil principal. */
    fun check(ctx: Context): Map<String, Any?> {
        val conn = URL("https://api.github.com/repos/$REPO/releases/latest").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "Tiya-Android")
            if (conn.responseCode !in 200..299) {
                return mapOf("available" to false, "error" to "GitHub a répondu ${conn.responseCode}")
            }
            val text = BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
            val json = JSONObject(text)
            val tag = json.optString("tag_name")               // ex. v1.1.7
            val remoteCode = tag.substringAfterLast('.').toLongOrNull() ?: 0L
            val remoteName = tag.removePrefix("v")
            val (curName, curCode) = currentVersion(ctx)
            val assets = json.optJSONArray("assets")
            val wanted = preferredAsset()
            var url: String? = null
            var size = 0L
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.optString("name") == wanted || (url == null && a.optString("name") == "Tiya.apk")) {
                        url = a.optString("browser_download_url")
                        size = a.optLong("size")
                    }
                }
            }
            return mapOf(
                "available" to (remoteCode > curCode && url != null),
                "current" to curName,
                "latest" to remoteName,
                "url" to url,
                "size" to size,
                "notes" to json.optString("body", ""),
            )
        } catch (e: Exception) {
            return mapOf("available" to false, "error" to (e.message ?: e.toString()))
        } finally {
            conn.disconnect()
        }
    }

    fun canInstall(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

    fun openInstallPermission(ctx: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    /** Télécharge l'APK en envoyant la progression à l'interface, puis lance l'installation. */
    fun download(ctx: Context, url: String, version: String) {
        val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val fileName = "Tiya-$version.apk"
        ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let { dir ->
            java.io.File(dir, fileName).delete()
        }
        val req = DownloadManager.Request(Uri.parse(url))
            .setTitle("Tiya $version")
            .setDescription("Mise à jour de Tiya")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, fileName)
        val id = dm.enqueue(req)

        Thread {
            var finished = false
            while (!finished) {
                Thread.sleep(500)
                val c = dm.query(DownloadManager.Query().setFilterById(id)) ?: break
                c.use {
                    if (!it.moveToFirst()) {
                        TiyaBus.emit("update_error", "Téléchargement annulé.")
                        finished = true
                        return@use
                    }
                    val status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    val done = it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    val total = it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    when (status) {
                        DownloadManager.STATUS_SUCCESSFUL -> {
                            TiyaBus.emit("update_progress", "", mapOf("progress" to 1.0))
                            install(ctx, dm.getUriForDownloadedFile(id))
                            finished = true
                        }
                        DownloadManager.STATUS_FAILED -> {
                            TiyaBus.emit("update_error", "Le téléchargement a échoué. Vérifie ta connexion.")
                            finished = true
                        }
                        else -> if (total > 0) {
                            TiyaBus.emit("update_progress", "", mapOf("progress" to done.toDouble() / total))
                        }
                    }
                }
            }
        }.start()
    }

    private fun install(ctx: Context, uri: Uri?) {
        if (uri == null) {
            TiyaBus.emit("update_error", "Fichier de mise à jour introuvable.")
            return
        }
        val i = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            ctx.startActivity(i)
            TiyaBus.emit("update_ready", "Installation lancée.")
        } catch (e: Exception) {
            TiyaBus.emit("update_error", "Impossible d'ouvrir l'installateur : ${e.message}")
        }
    }
}
