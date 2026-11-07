package co.cuervo.tiya

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

/** Programme les alarmes de Tiya (programme du jour + messages automatiques) et envoie les notifications. */
object TiyaScheduler {
    const val KIND_AGENDA = "agenda"
    const val KIND_MESSAGE = "message"
    const val CH_AGENDA = "tiya_agenda"
    const val CH_MESSAGES = "tiya_messages"

    private fun pi(ctx: Context, kind: String, id: String, create: Boolean): PendingIntent? {
        val i = Intent(ctx, TiyaAlarmReceiver::class.java)
            .setAction("co.cuervo.tiya.ALARM.$kind.$id")
            .putExtra("kind", kind)
            .putExtra("id", id)
        val flags = PendingIntent.FLAG_IMMUTABLE or
            (if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE)
        return PendingIntent.getBroadcast(ctx, (kind + id).hashCode(), i, flags)
    }

    fun cancel(ctx: Context, kind: String, id: String) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        pi(ctx, kind, id, false)?.let { am.cancel(it); it.cancel() }
    }

    fun schedule(ctx: Context, kind: String, item: JSONObject) {
        val id = item.optString("id")
        cancel(ctx, kind, id)
        if (!item.optBoolean("enabled", true)) return
        val offset = if (kind == KIND_AGENDA) item.optInt("remindBefore", 0) else 0
        val at = TiyaStore.nextTrigger(item, offset) ?: return
        val am = ctx.getSystemService(AlarmManager::class.java)
        val p = pi(ctx, kind, id, true) ?: return
        try {
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
            }
        } catch (_: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
        }
    }

    /** Reprogramme tout (au démarrage du téléphone, après une mise à jour, après une modification). */
    fun scheduleAll(ctx: Context) {
        val store = TiyaStore(ctx)
        store.agenda().forEach { schedule(ctx, KIND_AGENDA, it) }
        store.autoMessages().forEach { schedule(ctx, KIND_MESSAGE, it) }
    }

    // ------------------------------------------------------------ notifications

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_AGENDA, "Programme et rappels", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Rappels de ton emploi du temps"
                enableVibration(true)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_MESSAGES, "Messages automatiques", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Messages envoyés automatiquement par Tiya"
            }
        )
    }

    fun notify(ctx: Context, channel: String, id: Int, title: String, text: String) {
        ensureChannels(ctx)
        if (Build.VERSION.SDK_INT >= 33 &&
            ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        val content = open?.let {
            PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val b = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(ctx, channel)
        else {
            @Suppress("DEPRECATION")
            android.app.Notification.Builder(ctx)
        }
        b.setSmallIcon(R.drawable.ic_stat_tiya)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(android.app.Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setColor(0xFF2563EB.toInt())
            .setCategory(if (channel == CH_AGENDA) android.app.Notification.CATEGORY_REMINDER else android.app.Notification.CATEGORY_MESSAGE)
        if (content != null) b.setContentIntent(content)
        ctx.getSystemService(NotificationManager::class.java).notify(id, b.build())
    }
}
