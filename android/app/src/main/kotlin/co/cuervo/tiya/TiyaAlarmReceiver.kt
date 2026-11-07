package co.cuervo.tiya

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Se déclenche à l'heure d'un rappel du programme ou d'un message automatique. */
class TiyaAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val kind = intent.getStringExtra("kind") ?: return
        val id = intent.getStringExtra("id") ?: return
        val pending = goAsync()
        Thread {
            try {
                val store = TiyaStore(context)
                when (kind) {
                    TiyaScheduler.KIND_AGENDA -> store.agendaItem(id)?.let { item ->
                        val title = item.optString("title")
                        val note = item.optString("note")
                        val before = item.optInt("remindBefore", 0)
                        val h = item.optInt("hour")
                        val m = item.optInt("minute")
                        val time = "${h} h ${"%02d".format(m)}"
                        val head = if (before > 0) "Dans $before min ($time) : $title" else "C'est l'heure : $title"
                        TiyaScheduler.notify(context, TiyaScheduler.CH_AGENDA, id.hashCode(), head, note.ifBlank { "Prévu à $time" })
                        if (item.optBoolean("speak", true)) {
                            val name = TiyaSettings(context).userName
                            val who = if (name.isBlank()) "" else "$name, "
                            val say = if (before > 0) "${who}dans $before minutes : $title." else "${who}il est $time. C'est l'heure : $title."
                            waitForService()?.speak(if (note.isBlank()) say else "$say $note")
                        }
                        TiyaBus.emit("message", "⏰ $head")
                        // Un rappel « une fois » se désactive après coup.
                        if (item.optString("date").isNotEmpty() && TiyaStore.nextTrigger(item, before) == null) {
                            item.put("enabled", false)
                            store.saveAgenda(item)
                        }
                        TiyaScheduler.schedule(context, kind, item)
                    }
                    TiyaScheduler.KIND_MESSAGE -> store.autoMessage(id)?.let { item ->
                        waitForService()
                        TiyaAuto.send(context, item)
                        TiyaScheduler.schedule(context, kind, store.autoMessage(id) ?: item)
                    }
                }
            } finally {
                pending.finish()
            }
        }.start()
    }

    /** Après un redémarrage de l'app, le service d'accessibilité met un instant à revenir. */
    private fun waitForService(): TiyaService? {
        for (i in 0 until 20) {
            TiyaService.instance?.let { return it }
            Thread.sleep(250)
        }
        return null
    }
}
