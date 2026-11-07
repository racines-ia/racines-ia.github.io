package co.cuervo.tiya

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
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

    /**
     * Télécharge l'APK puis l'installe directement avec l'installateur d'Android.
     * Dès que Tiya s'est mise à jour une fois elle-même, Android 12+ installe les
     * versions suivantes sans même demander de confirmation.
     */
    fun download(ctx: Context, url: String, version: String) {
        Thread {
            try {
                val file = java.io.File(ctx.cacheDir, "tiya-update.apk")
                var conn = URL(url).openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = true
                conn.connectTimeout = 20_000
                conn.readTimeout = 60_000
                conn.setRequestProperty("User-Agent", "Tiya-Android")
                // GitHub redirige vers son stockage : on suit les redirections manuellement si besoin.
                var hops = 0
                while (conn.responseCode in 300..399 && hops < 5) {
                    val loc = conn.getHeaderField("Location") ?: break
                    conn.disconnect()
                    conn = URL(loc).openConnection() as HttpURLConnection
                    conn.setRequestProperty("User-Agent", "Tiya-Android")
                    hops++
                }
                if (conn.responseCode !in 200..299) throw Exception("serveur ${conn.responseCode}")
                val total = conn.contentLengthLong
                var done = 0L
                var lastEmit = 0L
                conn.inputStream.use { input ->
                    file.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val r = input.read(buf)
                            if (r < 0) break
                            out.write(buf, 0, r)
                            done += r
                            val now = System.currentTimeMillis()
                            if (total > 0 && now - lastEmit > 300) {
                                lastEmit = now
                                TiyaBus.emit("update_progress", "", mapOf("progress" to done.toDouble() / total))
                            }
                        }
                    }
                }
                conn.disconnect()
                TiyaBus.emit("update_progress", "", mapOf("progress" to 1.0))
                installFile(ctx, file, version)
            } catch (e: Exception) {
                TiyaBus.emit("update_error", "Le téléchargement a échoué (${e.message}). Vérifie ta connexion.")
            }
        }.start()
    }

    private fun installFile(ctx: Context, file: java.io.File, version: String) {
        val installer = ctx.packageManager.packageInstaller
        val params = android.content.pm.PackageInstaller.SessionParams(
            android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        params.setAppPackageName(ctx.packageName)
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(android.content.pm.PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("tiya.apk", 0, file.length()).use { out ->
                file.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val intent = Intent(ctx, TiyaInstallReceiver::class.java).setPackage(ctx.packageName)
            val flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= 31) android.app.PendingIntent.FLAG_MUTABLE else 0)
            val pi = android.app.PendingIntent.getBroadcast(ctx, id, intent, flags)
            TiyaBus.emit("update_installing", "Installation de Tiya $version…")
            session.commit(pi.intentSender)
        }
    }
}
