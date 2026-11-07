package co.cuervo.tiya

import android.content.Context
import android.content.SharedPreferences
import android.provider.ContactsContract
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.UUID

/**
 * Données de la « vie quotidienne » de Tiya, stockées sur le téléphone :
 * surnoms des contacts, messages automatiques, programme (emploi du temps).
 */
class TiyaStore(private val ctx: Context) {
    private val p: SharedPreferences = ctx.getSharedPreferences("tiya_store", Context.MODE_PRIVATE)

    // ------------------------------------------------------------ contacts

    /** Tous les contacts du téléphone (un numéro par nom), triés. */
    fun phoneContacts(): List<Map<String, Any>> {
        if (ctx.checkSelfPermission(android.Manifest.permission.READ_CONTACTS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return emptyList()
        val seen = LinkedHashMap<String, String>()
        ctx.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            ),
            null, null,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE NOCASE ASC"
        )?.use { c ->
            while (c.moveToNext()) {
                val name = c.getString(0) ?: continue
                val num = c.getString(1) ?: continue
                if (!seen.containsKey(name)) seen[name] = num
            }
        }
        val aliases = aliases()
        return seen.map { (name, num) ->
            val a = aliases.entries.filter { it.value.optString("name") == name }.map { it.key }
            mapOf("name" to name, "number" to num, "aliases" to a)
        }
    }

    /** Surnoms : « ma femme » → {name, number}. Clés normalisées. */
    fun aliases(): Map<String, JSONObject> {
        val o = JSONObject(p.getString("aliases", "{}") ?: "{}")
        val out = LinkedHashMap<String, JSONObject>()
        o.keys().forEach { k -> o.optJSONObject(k)?.let { out[k] = it } }
        return out
    }

    fun setAlias(alias: String, name: String, number: String) {
        val key = QuickCommands.norm(alias)
        if (key.isEmpty()) return
        val o = JSONObject(p.getString("aliases", "{}") ?: "{}")
        o.put(key, JSONObject().put("name", name).put("number", number).put("label", alias.trim()))
        p.edit().putString("aliases", o.toString()).apply()
    }

    fun removeAlias(alias: String) {
        val o = JSONObject(p.getString("aliases", "{}") ?: "{}")
        o.remove(QuickCommands.norm(alias))
        p.edit().putString("aliases", o.toString()).apply()
    }

    // ------------------------------------------------------------ listes génériques

    private fun list(key: String): MutableList<JSONObject> {
        val a = JSONArray(p.getString(key, "[]") ?: "[]")
        return MutableList(a.length()) { a.getJSONObject(it) }
    }

    private fun saveList(key: String, items: List<JSONObject>) {
        val a = JSONArray()
        items.forEach { a.put(it) }
        p.edit().putString(key, a.toString()).apply()
    }

    private fun upsert(key: String, item: JSONObject): JSONObject {
        if (item.optString("id").isEmpty()) item.put("id", UUID.randomUUID().toString().take(12))
        val items = list(key)
        val i = items.indexOfFirst { it.optString("id") == item.optString("id") }
        if (i >= 0) items[i] = item else items.add(item)
        saveList(key, items)
        return item
    }

    private fun delete(key: String, id: String) {
        saveList(key, list(key).filter { it.optString("id") != id })
    }

    // Messages automatiques ---------------------------------------
    // {id, name, number, channel: whatsapp|whatsapp_business|sms, hour, minute,
    //  days:[1..7] (vide = tous les jours), template, aiVary, tone, enabled, lastSent, lastText}
    fun autoMessages() = list("auto")
    fun autoMessage(id: String) = autoMessages().firstOrNull { it.optString("id") == id }
    fun saveAutoMessage(item: JSONObject) = upsert("auto", item)
    fun deleteAutoMessage(id: String) = delete("auto", id)

    // Programme ----------------------------------------------------
    // {id, title, note, hour, minute, date: "yyyy-MM-dd" (une fois) ou "",
    //  days:[1..7] (vide = tous les jours), remindBefore (min), speak, enabled}
    fun agenda() = list("agenda")
    fun agendaItem(id: String) = agenda().firstOrNull { it.optString("id") == id }
    fun saveAgenda(item: JSONObject) = upsert("agenda", item)
    fun deleteAgenda(id: String) = delete("agenda", id)

    // File d'attente : messages WhatsApp à envoyer dès que le téléphone est déverrouillé.
    fun pending(): MutableList<String> {
        val a = JSONArray(p.getString("pending", "[]") ?: "[]")
        return MutableList(a.length()) { a.getString(it) }
    }

    fun setPending(ids: List<String>) {
        p.edit().putString("pending", JSONArray(ids).toString()).apply()
    }

    companion object {
        /** Jour de la semaine : lundi = 1 … dimanche = 7. */
        fun isoDay(c: Calendar): Int = ((c.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1

        fun days(o: JSONObject): Set<Int> {
            val a = o.optJSONArray("days") ?: return emptySet()
            return (0 until a.length()).map { a.optInt(it) }.toSet()
        }

        /**
         * Prochain déclenchement (en ms) à partir de maintenant, ou null s'il n'y en a plus.
         * [offsetMin] : minutes à retirer (rappel avant l'heure).
         */
        fun nextTrigger(o: JSONObject, offsetMin: Int = 0, now: Long = System.currentTimeMillis()): Long? {
            val h = o.optInt("hour")
            val m = o.optInt("minute")
            val date = o.optString("date", "")
            if (date.isNotEmpty()) {
                val parts = date.split("-").mapNotNull { it.toIntOrNull() }
                if (parts.size != 3) return null
                val c = Calendar.getInstance().apply {
                    set(parts[0], parts[1] - 1, parts[2], h, m, 0)
                    set(Calendar.MILLISECOND, 0)
                    add(Calendar.MINUTE, -offsetMin)
                }
                return if (c.timeInMillis > now) c.timeInMillis else null
            }
            val ds = days(o)
            val c = Calendar.getInstance().apply {
                timeInMillis = now
                set(Calendar.HOUR_OF_DAY, h)
                set(Calendar.MINUTE, m)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
                add(Calendar.MINUTE, -offsetMin)
            }
            for (i in 0..8) {
                // Le jour vérifié est celui de l'événement, pas celui du rappel.
                val event = Calendar.getInstance().apply {
                    timeInMillis = c.timeInMillis
                    add(Calendar.MINUTE, offsetMin)
                }
                if (c.timeInMillis > now && (ds.isEmpty() || ds.contains(isoDay(event)))) return c.timeInMillis
                c.add(Calendar.DAY_OF_YEAR, 1)
            }
            return null
        }
    }
}
