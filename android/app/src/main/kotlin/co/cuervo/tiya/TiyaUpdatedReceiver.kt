package co.cuervo.tiya

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Après une mise à jour, Tiya se rouvre toute seule. */
class TiyaUpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        launch.putExtra("tiya_updated", true)
        runCatching { context.startActivity(launch) }
    }
}
