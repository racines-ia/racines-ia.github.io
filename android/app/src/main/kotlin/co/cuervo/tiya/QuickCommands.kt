package co.cuervo.tiya

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.Settings
import java.net.URLEncoder
import java.text.Normalizer
import java.util.Locale

/**
 * Raccourcis instantanés : les commandes courantes sont exécutées directement,
 * sans passer par l'IA (réponse en moins d'une seconde).
 * Renvoie null quand la commande n'est pas reconnue : l'IA prend alors le relais.
 */
class QuickCommands(private val service: TiyaService, private val agent: TiyaAgent?) {

    class Contact(val name: String, val number: String, val exact: Boolean)

    fun tryHandle(original: String): String? {
        val text = original.trim().trimEnd('.', '!', '?').trim()
        val low = text.lowercase(Locale.FRENCH)
        val n = norm(text)

        // Commandes composées (« … et … », « puis ») : laissées à l'IA.
        if (Regex("\\b(et|puis|ensuite|apres)\\b").containsMatchIn(n.substringBefore(':')) &&
            !n.contains(':')
        ) return null

        // --- Programme / messages automatiques créés à la voix
        scheduleByVoice(text, n)?.let { return it }

        // --- Lampe torche
        Regex("^(allume|active|ouvre)\\s+(la\\s+)?(lampe|torche|flash|lumiere)").find(n)?.let {
            return torch(true)
        }
        Regex("^(eteins|desactive|coupe|ferme)\\s+(la\\s+)?(lampe|torche|flash|lumiere)").find(n)?.let {
            return torch(false)
        }

        // --- Alarme
        Regex("(alarme|reveil|reveille[- ]moi)\\D{0,12}(\\d{1,2})\\s*(h|heures?|:)\\s*(\\d{1,2})?").find(n)?.let { m ->
            val h = m.groupValues[2].toInt()
            val min = m.groupValues[4].toIntOrNull() ?: 0
            if (h in 0..23 && min in 0..59) return alarm(h, min)
        }

        // --- Minuteur
        Regex("(minuteur|chrono|timer|compte a rebours)\\D{0,8}(\\d+)\\s*(s|sec|secondes?|min|minutes?|h|heures?)\\b").find(n)?.let { m ->
            val v = m.groupValues[2].toInt()
            val unit = m.groupValues[3]
            val secs = when {
                unit.startsWith("h") -> v * 3600
                unit.startsWith("min") -> v * 60
                else -> v
            }
            if (secs in 1..86_400) return timer(secs)
        }

        // --- Bluetooth / Wi-Fi
        Regex("^(active|allume|desactive|eteins|coupe)\\s+(le\\s+|la\\s+)?(bluetooth|wi-?fi|wifi)$").find(n)?.let { m ->
            val on = m.groupValues[1] in listOf("active", "allume")
            val wifi = m.groupValues[3].startsWith("wi")
            return toggleSetting(wifi, on)
        }

        // --- Message vocal WhatsApp
        Regex("^(envoie|envoyer|fais|faire|enregistre|laisse)\\s+(un\\s+|une\\s+)?(vocal|message vocal|audio|note vocale)\\s+(a|au|pour)\\s+(.+?)(\\s+(sur|par|via|dans)\\s+whatsapp(\\s+business)?)?$")
            .find(n)?.let { m ->
                val who = m.groupValues[5].trim()
                return whatsappVoice(who, business = m.groupValues[8].isNotEmpty())
            }

        // --- Message WhatsApp avec texte
        whatsappMessage(text, low, n)?.let { return it }

        // --- SMS
        Regex("^(envoie|ecris|envoyer)\\s+(un\\s+)?(sms|texto|message texte)\\s+(a|au)\\s+(.+?)\\s*[:,]\\s*(que\\s+)?").find(n)?.let { m ->
            val who = m.groupValues[5].trim()
            val body = bodyAfter(text, m.range.last + 1)
            if (body.isNotEmpty()) return sms(who, body)
        }

        // --- Appel
        Regex("^(appelle|appeler|appel|telephone a|telephone au|compose le|compose)\\s+(.+)$").find(n)?.let { m ->
            val target = m.groupValues[2].trim()
            if (target.contains("whatsapp") || target.contains("video")) return null
            return call(target)
        }

        // --- Navigation simple
        when (n) {
            "retour", "reviens", "reviens en arriere" -> return service.globalBack().let { "C'est fait." }
            "accueil", "ecran d'accueil", "va a l'accueil" -> return service.goHome().let { "C'est fait." }
            "notifications", "ouvre les notifications" -> return service.notifications().let { "Voici tes notifications." }
        }

        // --- Ouvrir une application
        Regex("^(ouvre|ouvrir|lance|lancer|demarre|demarrer|va sur|vas sur|aller sur)\\s+(l'|la\\s+|le\\s+|les\\s+)?(app(lication)?\\s+)?(.+)$").find(n)?.let { m ->
            val app = m.groupValues[5].trim()
            if (app.split(' ').size > 4) return null
            val r = service.openApp(app)
            return if (r.startsWith("OK")) {
                r.removePrefix("OK : ").removeSuffix(" ouvert.").let { "J'ai ouvert $it." }
            } else null   // inconnue : l'IA cherchera mieux
        }
        return null
    }

    // ------------------------------------------------------------ programme à la voix

    private fun scheduleByVoice(text: String, n: String): String? {
        val time = "(\\d{1,2})\\s*(?:h|heures?|:)\\s*(\\d{1,2})?"
        // « Chaque jour à 8h, envoie à ma femme sur WhatsApp : Bonjour mon cœur »
        Regex("^(chaque jour|tous les jours|chaque matin|chaque soir)\\s*(a|vers)?\\s*$time\\s*,?\\s*(envoie|ecris|envoyer|dis)\\s+(un message\\s+)?(a|au)\\s+(.+?)(\\s+(sur|par|via)\\s+(whatsapp business|whatsapp|sms))?\\s*[:,]\\s*(que\\s+|qu')?")
            .find(n)?.let { m ->
                val h = m.groupValues[3].toInt()
                val min = m.groupValues[4].toIntOrNull() ?: 0
                val who = m.groupValues[8].trim()
                val chan = when (m.groupValues[11]) {
                    "sms" -> "sms"
                    "whatsapp business" -> "whatsapp_business"
                    else -> "whatsapp"
                }
                val body = bodyAfter(text, m.range.last + 1)
                if (h !in 0..23 || min !in 0..59 || body.isEmpty()) return null
                if (!hasContacts()) return needContacts()
                val c = findContact(who) ?: return "Je ne trouve pas « $who » dans tes contacts."
                val item = org.json.JSONObject()
                    .put("name", c.name).put("number", c.number).put("channel", chan)
                    .put("hour", h).put("minute", min).put("days", org.json.JSONArray())
                    .put("template", body).put("aiVary", true).put("tone", "chaleureux et naturel")
                    .put("enabled", true)
                val saved = TiyaStore(service).saveAutoMessage(item)
                TiyaScheduler.schedule(service, TiyaScheduler.KIND_MESSAGE, saved)
                TiyaBus.emit("data_changed", "auto")
                return "C'est programmé : chaque jour à ${h} h ${"%02d".format(min)}, j'enverrai un message à ${c.name}. " +
                    "Je le reformulerai un peu chaque jour. Tu peux le modifier dans l'onglet Messages."
            }

        // « Rappelle-moi demain à 15h d'appeler le directeur » / « Chaque jour à 7h rappelle-moi de prier »
        Regex("^(chaque jour|tous les jours)?\\s*(a\\s+$time\\s*,?\\s*)?(rappelle[- ]moi|previens[- ]moi|fais[- ]moi penser)\\s+(demain\\s+)?((a|vers)\\s+$time\\s+)?(de |d'|qu'|que |a |pour )?")
            .find(n)?.let { m ->
                val daily = m.groupValues[1].isNotEmpty()
                val h = (m.groupValues[3].ifEmpty { m.groupValues[9] }).toIntOrNull() ?: return null
                val min = (m.groupValues[4].ifEmpty { m.groupValues[10] }).toIntOrNull() ?: 0
                val tomorrow = m.groupValues[6].isNotEmpty()
                val what = bodyAfter(text, m.range.last + 1).trimEnd('.')
                if (h !in 0..23 || min !in 0..59 || what.isEmpty()) return null
                val item = org.json.JSONObject()
                    .put("title", what.replaceFirstChar { it.uppercase() })
                    .put("note", "").put("hour", h).put("minute", min)
                    .put("days", org.json.JSONArray()).put("remindBefore", 0)
                    .put("speak", true).put("enabled", true)
                if (!daily) {
                    val c = java.util.Calendar.getInstance()
                    val passed = c.get(java.util.Calendar.HOUR_OF_DAY) * 60 + c.get(java.util.Calendar.MINUTE) >= h * 60 + min
                    if (tomorrow || passed) c.add(java.util.Calendar.DAY_OF_YEAR, 1)
                    item.put("date", java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.time))
                } else item.put("date", "")
                val saved = TiyaStore(service).saveAgenda(item)
                TiyaScheduler.schedule(service, TiyaScheduler.KIND_AGENDA, saved)
                TiyaBus.emit("data_changed", "agenda")
                val hh = "${h} h ${"%02d".format(min)}"
                return when {
                    daily -> "C'est noté : chaque jour à $hh, je te rappellerai « $what »."
                    item.optString("date") != java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(java.util.Date()) ->
                        "C'est noté : demain à $hh, je te rappellerai « $what »."
                    else -> "C'est noté : à $hh, je te rappellerai « $what »."
                }
            }
        return null
    }

    // ------------------------------------------------------------ actions

    private fun torch(on: Boolean): String {
        return try {
            val cm = service.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val id = cm.cameraIdList.firstOrNull {
                cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: return "Ce téléphone n'a pas de flash."
            cm.setTorchMode(id, on)
            if (on) "Lampe allumée." else "Lampe éteinte."
        } catch (e: Exception) {
            "Je n'ai pas pu utiliser la lampe."
        }
    }

    private fun alarm(h: Int, m: Int): String {
        val i = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, h)
            .putExtra(AlarmClock.EXTRA_MINUTES, m)
            .putExtra(AlarmClock.EXTRA_MESSAGE, "Tiya")
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            service.startActivity(i)
            "Alarme réglée à ${h} h ${"%02d".format(m)}."
        } catch (e: Exception) {
            "Je n'ai pas trouvé d'application d'horloge."
        }
    }

    private fun timer(secs: Int): String {
        val i = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, secs)
            .putExtra(AlarmClock.EXTRA_MESSAGE, "Tiya")
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            service.startActivity(i)
            val txt = when {
                secs % 3600 == 0 -> "${secs / 3600} h"
                secs % 60 == 0 -> "${secs / 60} min"
                else -> "$secs s"
            }
            "Minuteur de $txt lancé."
        } catch (e: Exception) {
            "Je n'ai pas trouvé d'application d'horloge."
        }
    }

    private fun toggleSetting(wifi: Boolean, on: Boolean): String? {
        val action = if (wifi) Settings.ACTION_WIFI_SETTINGS else Settings.ACTION_BLUETOOTH_SETTINGS
        service.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        Thread.sleep(1300)
        val snap = service.readScreen()
        val sw = snap.elements.firstOrNull { it.node.isCheckable } ?: return null
        val label = if (wifi) "Wi-Fi" else "Bluetooth"
        if (sw.node.isChecked != on) {
            service.tapElement(sw, false)
            Thread.sleep(500)
        }
        service.globalBack()
        return if (on) "$label activé." else "$label désactivé."
    }

    private fun call(target: String): String? {
        val digits = target.filter { it.isDigit() || it == '+' }
        val number: String
        val label: String
        var exact = true
        if (digits.count { it.isDigit() } >= 6 && target.count { it.isLetter() } <= 3) {
            number = digits
            label = digits
        } else {
            if (!hasContacts()) return needContacts()
            val c = findContact(target) ?: return "Je ne trouve pas « $target » dans tes contacts."
            number = c.number
            label = c.name
            exact = c.exact
        }
        if (!exact && TiyaSettings(service).confirmSensitive) {
            if (!(agent?.quickConfirm("Appeler $label ($number) ?", "Appeler", "Annuler") ?: true)) return "Appel annulé."
        }
        val canCall = service.checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        val i = Intent(if (canCall) Intent.ACTION_CALL else Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        service.startActivity(i)
        return if (canCall) "J'appelle $label." else "J'ai préparé l'appel vers $label : appuie sur le bouton vert."
    }

    private fun whatsappMessage(text: String, low: String, n: String): String? {
        val patterns = listOf(
            // « écris à Papa sur WhatsApp : je suis en route »
            Regex("^(ecris|envoie|envoyer|dis|ecrire|message)\\s+(un message\\s+)?(a|au)\\s+(.+?)\\s+(sur|par|via|dans)\\s+whatsapp(\\s+business)?\\s*[:,]?\\s*(que\\s+|qu')?"),
            // « sur WhatsApp, écris à Papa : je suis en route »
            Regex("^(sur|dans|via)\\s+whatsapp(\\s+business)?\\s*,?\\s*(ecris|envoie|dis)\\s+(a|au)\\s+(.+?)\\s*[:,]\\s*(que\\s+|qu')?"),
            // « WhatsApp Papa : je suis en route »
            Regex("^whatsapp(\\s+business)?\\s+(a\\s+|au\\s+)?(.+?)\\s*:\\s*"),
        )
        for ((idx, re) in patterns.withIndex()) {
            val m = re.find(n) ?: continue
            val who = when (idx) {
                0 -> m.groupValues[4]
                1 -> m.groupValues[5]
                else -> m.groupValues[3]
            }.trim()
            val business = when (idx) {
                0 -> m.groupValues[6].isNotEmpty()
                1 -> m.groupValues[2].isNotEmpty()
                else -> m.groupValues[1].isNotEmpty()
            }
            // Le message garde sa casse et ses accents d'origine.
            val body = bodyAfter(text, m.range.last + 1)
            if (body.isEmpty() || who.isEmpty()) return null
            return whatsappSend(who, body, business)
        }
        return null
    }

    private fun whatsappPackage(business: Boolean): String? {
        val pm = service.packageManager
        fun installed(p: String) = try { pm.getPackageInfo(p, 0); true } catch (_: Exception) { false }
        return when {
            business && installed("com.whatsapp.w4b") -> "com.whatsapp.w4b"
            installed("com.whatsapp") -> "com.whatsapp"
            installed("com.whatsapp.w4b") -> "com.whatsapp.w4b"
            else -> null
        }
    }

    private fun openWhatsappChat(c: Contact, body: String?, business: Boolean): Boolean {
        val pkg = whatsappPackage(business) ?: return false
        var url = "https://api.whatsapp.com/send?phone=" + intlNumber(c.number)
        if (body != null) url += "&text=" + URLEncoder.encode(body, "UTF-8")
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(pkg)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return try {
            service.startActivity(i); true
        } catch (_: Exception) {
            false
        }
    }

    private fun whatsappSend(who: String, body: String, business: Boolean): String? {
        if (!hasContacts()) return needContacts()
        val c = findContact(who) ?: return "Je ne trouve pas « $who » dans tes contacts."
        if (whatsappPackage(business) == null) return "WhatsApp n'est pas installé."
        if (!c.exact && TiyaSettings(service).confirmSensitive) {
            if (!(agent?.quickConfirm("Envoyer à ${c.name} sur WhatsApp :\n« $body » ?", "Envoyer", "Annuler") ?: true))
                return "Message annulé."
        }
        return sendWhatsappDirect(c, body, business)
    }

    /** Ouvre la conversation avec le texte prêt, puis touche « Envoyer ». Sans confirmation. */
    fun sendWhatsappDirect(c: Contact, body: String, business: Boolean): String? {
        if (!openWhatsappChat(c, body, business)) return null
        // On attend que la conversation s'ouvre, puis on touche « Envoyer ».
        for (i in 0 until 12) {
            Thread.sleep(500)
            val snap = service.readScreen()
            if (!snap.packageName.startsWith("com.whatsapp")) continue
            val send = snap.elements.firstOrNull {
                val d = (it.node.contentDescription?.toString() ?: "").lowercase(Locale.ROOT)
                d == "envoyer" || d == "send" || d.startsWith("envoyer") || d.startsWith("send")
            }
            if (send != null) {
                service.tapElement(send, false)
                return "Message envoyé à ${c.name} sur WhatsApp."
            }
        }
        return "J'ai écrit le message à ${c.name} : appuie sur Envoyer."
    }

    private fun whatsappVoice(who: String, business: Boolean): String? {
        if (!hasContacts()) return needContacts()
        val c = findContact(who) ?: return "Je ne trouve pas « $who » dans tes contacts."
        if (whatsappPackage(business) == null) return "WhatsApp n'est pas installé."
        if (!openWhatsappChat(c, null, business)) return null
        for (i in 0 until 12) {
            Thread.sleep(500)
            val snap = service.readScreen()
            if (!snap.packageName.startsWith("com.whatsapp")) continue
            val mic = snap.elements.firstOrNull {
                val d = (it.node.contentDescription?.toString() ?: "").lowercase(Locale.ROOT)
                d.contains("vocal") || d.contains("voice") || d.contains("enregistr") || d.contains("micro")
            }
            if (mic != null && agent != null) return agent.quickVoiceNote(mic, c.name)
        }
        return null   // l'IA prendra le relais sur l'écran ouvert
    }

    private fun sms(who: String, body: String): String? {
        val number: String
        val name: String
        val digits = who.filter { it.isDigit() || it == '+' }
        if (digits.count { it.isDigit() } >= 6 && who.count { it.isLetter() } <= 3) {
            number = digits; name = digits
        } else {
            if (!hasContacts()) return needContacts()
            val c = findContact(who) ?: return "Je ne trouve pas « $who » dans tes contacts."
            number = c.number; name = c.name
        }
        val i = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(number)))
            .putExtra("sms_body", body)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            service.startActivity(i)
            "J'ai écrit le SMS à $name : vérifie et appuie sur Envoyer."
        } catch (_: Exception) {
            null
        }
    }

    // ------------------------------------------------------------ contacts

    private fun hasContacts() =
        service.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

    private fun needContacts(): String =
        "Pour les raccourcis d'appel et de message, autorise l'accès aux contacts dans Tiya › Réglages."

    fun findContact(query: String): Contact? {
        val q = norm(query).removePrefix("a ").removePrefix("au ").trim()
        if (q.isEmpty()) return null
        // 1) Surnoms enregistrés dans Tiya (« ma femme », « le directeur »…).
        val aliases = TiyaStore(service).aliases()
        val bare = q.replace(Regex("^(ma|mon|mes|la|le|les|l')\\s*"), "").trim()
        for ((k, v) in aliases) {
            val kb = k.replace(Regex("^(ma|mon|mes|la|le|les|l')\\s*"), "").trim()
            if (k == q || kb == bare) return Contact(v.optString("name"), v.optString("number"), true)
        }
        val cur = service.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            ),
            null, null, null
        ) ?: return null
        var best: Contact? = null
        var bestScore = 0
        cur.use {
            while (it.moveToNext()) {
                val name = it.getString(0) ?: continue
                val num = it.getString(1) ?: continue
                val nn = norm(name)
                val score = when {
                    nn == q -> 100
                    nn.startsWith("$q ") || nn.endsWith(" $q") -> 80
                    nn.split(' ').contains(q) -> 75
                    nn.startsWith(q) -> 60
                    nn.contains(q) -> 50
                    q.contains(nn) && nn.length >= 3 -> 40
                    else -> 0
                }
                if (score > bestScore) {
                    bestScore = score
                    best = Contact(name, num, score >= 75)
                }
            }
        }
        return best
    }

    companion object {
        /**
         * Renvoie la fin du texte d'origine (casse et accents conservés) qui suit
         * la position [normEnd] de sa version normalisée.
         */
        fun bodyAfter(original: String, normEnd: Int): String {
            var out = 0
            var prevSpace = false
            for (i in original.indices) {
                if (out >= normEnd) return original.substring(i).trim()
                val c = original[i]
                if (c.isWhitespace()) {
                    if (out == 0 || prevSpace) continue
                    prevSpace = true
                    out++
                } else {
                    val base = Normalizer.normalize(c.toString().lowercase(Locale.FRENCH), Normalizer.Form.NFD)
                        .replace(Regex("\\p{Mn}+"), "")
                    out += base.length
                    prevSpace = false
                }
            }
            return ""
        }

        fun norm(s: String): String {
            val d = Normalizer.normalize(s.lowercase(Locale.FRENCH), Normalizer.Form.NFD)
            return d.replace(Regex("\\p{Mn}+"), "").replace('’', '\'').replace(Regex("\\s+"), " ").trim()
        }

        /** Format international sans « + » (RDC : 0812345678 → 243812345678). */
        fun intlNumber(raw: String): String {
            var d = raw.filter { it.isDigit() }
            if (raw.trim().startsWith("+")) return d
            if (d.startsWith("00")) return d.substring(2)
            if (d.startsWith("0") && d.length == 10) d = "243" + d.substring(1)
            else if (d.length == 9) d = "243$d"
            return d
        }
    }
}
