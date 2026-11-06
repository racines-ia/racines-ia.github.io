package co.cuervo.tiya

import android.os.Handler
import android.os.Looper

/**
 * Canal interne entre le service (qui agit sur le téléphone) et l'interface Flutter.
 * Garde aussi l'historique récent pour que l'app le retrouve quand on la rouvre.
 */
object TiyaBus {
    private val main = Handler(Looper.getMainLooper())
    private val listeners = mutableListOf<(Map<String, Any?>) -> Unit>()
    private val history = ArrayList<Map<String, Any?>>()

    @Synchronized
    fun addListener(l: (Map<String, Any?>) -> Unit) {
        listeners.add(l)
    }

    @Synchronized
    fun removeListener(l: (Map<String, Any?>) -> Unit) {
        listeners.remove(l)
    }

    @Synchronized
    fun historySnapshot(): List<Map<String, Any?>> = ArrayList(history)

    @Synchronized
    fun clearHistory() {
        history.clear()
    }

    /**
     * type : user | step | message | ask | confirm | done | error | status | speech | partial_speech
     */
    fun emit(type: String, text: String = "", extra: Map<String, Any?> = emptyMap()) {
        val event = HashMap<String, Any?>()
        event["type"] = type
        event["text"] = text
        event["time"] = System.currentTimeMillis()
        event.putAll(extra)
        val copy: List<(Map<String, Any?>) -> Unit>
        synchronized(this) {
            if (type != "partial_speech" && type != "status") {
                history.add(event)
                while (history.size > 300) history.removeAt(0)
            }
            copy = ArrayList(listeners)
        }
        main.post { copy.forEach { runCatching { it(event) } } }
    }
}
