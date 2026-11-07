package co.cuervo.tiya

import android.app.KeyguardManager
import android.content.Context
import android.os.PowerManager
import android.telephony.SmsManager
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Envoi des messages automatiques (WhatsApp ou SMS), avec reformulation par l'IA. */
object TiyaAuto {

    /** Prépare le texte du jour : le message type, ou une version reformulée par l'IA. */
    fun composeText(ctx: Context, item: JSONObject): String {
        val template = item.optString("template").trim()
        if (!item.optBoolean("aiVary", false) || template.isEmpty()) return template
        return try {
            val settings = TiyaSettings(ctx)
            val today = SimpleDateFormat("EEEE d MMMM", Locale.FRENCH).format(Date())
            val tone = item.optString("tone").ifBlank { "chaleureux et naturel" }
            val last = item.optString("lastText")
            val system = "Tu rédiges de courts messages personnels en français, au nom de l'utilisateur. " +
                "Réponds uniquement en JSON : {\"message\": \"...\"}."
            val prompt = buildString {
                append("Message type de l'utilisateur, à reformuler pour aujourd'hui ($today) :\n« $template »\n")
                append("Destinataire : ${item.optString("name")}.\nTon souhaité : $tone.\n")
                if (last.isNotBlank()) append("Message envoyé la dernière fois (ne le répète pas mot pour mot) : « $last »\n")
                append("Règles : garde le même sens et la même intention, varie la formulation, reste court ")
                append("(longueur proche du message type), pas de guillemets, pas de signature, n'invente aucun fait, ")
                append("aucun événement ni promesse qui ne soit pas dans le message type. Les émojis du message type peuvent être gardés.")
            }
            val raw = LlmClient(settings).ask(system, prompt, null)
            val s = raw.indexOf('{')
            val e = raw.lastIndexOf('}')
            val msg = if (s >= 0 && e > s) JSONObject(raw.substring(s, e + 1)).optString("message") else raw
            msg.trim().trim('"', '«', '»', ' ').ifBlank { template }
        } catch (_: Exception) {
            template   // en cas de problème réseau ou d'IA : le message type est envoyé tel quel
        }
    }

    fun phoneUnlocked(ctx: Context): Boolean {
        val pm = ctx.getSystemService(PowerManager::class.java)
        val km = ctx.getSystemService(KeyguardManager::class.java)
        return pm.isInteractive && !km.isKeyguardLocked
    }

    /**
     * Envoie un message automatique. Renvoie un court compte rendu.
     * WhatsApp a besoin d'un téléphone déverrouillé : sinon le message est mis en attente.
     */
    fun send(ctx: Context, item: JSONObject, force: Boolean = false): String {
        val store = TiyaStore(ctx)
        val name = item.optString("name")
        val channel = item.optString("channel", "whatsapp")
        val id = item.optString("id")

        if (channel == "sms") {
            val text = composeText(ctx, item)
            return try {
                if (ctx.checkSelfPermission(android.Manifest.permission.SEND_SMS) !=
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                ) throw SecurityException("permission SMS")
                val sms = if (android.os.Build.VERSION.SDK_INT >= 31) ctx.getSystemService(SmsManager::class.java)
                else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }
                val parts = sms.divideMessage(text)
                sms.sendMultipartTextMessage(item.optString("number"), null, parts, null, null)
                markSent(store, item, text)
                TiyaScheduler.notify(ctx, TiyaScheduler.CH_MESSAGES, id.hashCode(), "SMS envoyé à $name", text)
                "SMS envoyé à $name."
            } catch (e: Exception) {
                TiyaScheduler.notify(
                    ctx, TiyaScheduler.CH_MESSAGES, id.hashCode(), "SMS non envoyé à $name",
                    "Autorise l'envoi de SMS dans Tiya › Messages automatiques."
                )
                "Échec de l'envoi du SMS : ${e.message}"
            }
        }

        // --- WhatsApp
        val service = TiyaService.instance
        if (service == null || (!force && !phoneUnlocked(ctx))) {
            val q = store.pending()
            if (!q.contains(id)) q.add(id)
            store.setPending(q)
            TiyaScheduler.notify(
                ctx, TiyaScheduler.CH_MESSAGES, id.hashCode(), "Message pour $name prêt",
                if (service == null) "Active Tiya dans l'accessibilité pour que le message parte."
                else "Déverrouille ton téléphone : Tiya l'enverra aussitôt."
            )
            return "En attente du déverrouillage."
        }
        if (service.agent.running) {
            // Tiya est occupée : on réessaie à la fin.
            val q = store.pending()
            if (!q.contains(id)) q.add(id)
            store.setPending(q)
            return "Tiya est occupée : le message partira juste après."
        }
        val text = composeText(ctx, item)
        val contact = QuickCommands.Contact(name, item.optString("number"), true)
        service.setStatus("Message automatique pour $name…")
        val r = QuickCommands(service, null)
            .sendWhatsappDirect(contact, text, channel == "whatsapp_business")
        service.setStatus(null)
        service.goHome()
        return if (r != null && r.startsWith("Message envoyé")) {
            markSent(store, item, text)
            TiyaScheduler.notify(ctx, TiyaScheduler.CH_MESSAGES, id.hashCode(), "WhatsApp envoyé à $name", text)
            TiyaBus.emit("message", "📨 Message automatique envoyé à $name : « $text »")
            r
        } else {
            TiyaScheduler.notify(
                ctx, TiyaScheduler.CH_MESSAGES, id.hashCode(), "Message à $name non envoyé",
                "Ouvre Tiya › Messages automatiques et appuie sur « Envoyer maintenant »."
            )
            r ?: "Échec : WhatsApp introuvable."
        }
    }

    private fun markSent(store: TiyaStore, item: JSONObject, text: String) {
        val fresh = store.autoMessage(item.optString("id")) ?: item
        fresh.put("lastSent", System.currentTimeMillis())
        fresh.put("lastText", text)
        store.saveAutoMessage(fresh)
    }

    /** Envoie les messages restés en attente (appelé au déverrouillage). */
    fun flushPending(ctx: Context) {
        val store = TiyaStore(ctx)
        val ids = store.pending()
        if (ids.isEmpty()) return
        store.setPending(emptyList())
        Thread {
            Thread.sleep(1500)
            ids.forEach { id ->
                store.autoMessage(id)?.let { send(ctx, it) }
                Thread.sleep(1000)
            }
        }.start()
    }
}
