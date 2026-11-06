package co.cuervo.tiya

import android.content.Context
import android.content.SharedPreferences

/** Réglages de Tiya, stockés sur le téléphone uniquement. */
class TiyaSettings(context: Context) {
    private val p: SharedPreferences =
        context.getSharedPreferences("tiya_settings", Context.MODE_PRIVATE)

    var provider: String
        get() = p.getString("provider", "gemini") ?: "gemini"
        set(v) = p.edit().putString("provider", v).apply()

    var geminiKey: String
        get() = p.getString("geminiKey", "") ?: ""
        set(v) = p.edit().putString("geminiKey", v.trim()).apply()

    var geminiModel: String
        get() = p.getString("geminiModel", DEFAULT_GEMINI_MODEL) ?: DEFAULT_GEMINI_MODEL
        set(v) = p.edit().putString("geminiModel", v.trim().ifEmpty { DEFAULT_GEMINI_MODEL }).apply()

    var claudeKey: String
        get() = p.getString("claudeKey", "") ?: ""
        set(v) = p.edit().putString("claudeKey", v.trim()).apply()

    var claudeModel: String
        get() = p.getString("claudeModel", DEFAULT_CLAUDE_MODEL) ?: DEFAULT_CLAUDE_MODEL
        set(v) = p.edit().putString("claudeModel", v.trim().ifEmpty { DEFAULT_CLAUDE_MODEL }).apply()

    /** Envoyer une capture d'écran à l'IA (nécessaire pour voir les photos). */
    var vision: Boolean
        get() = p.getBoolean("vision", true)
        set(v) = p.edit().putBoolean("vision", v).apply()

    /** Demander confirmation avant d'envoyer un message, payer, supprimer… */
    var confirmSensitive: Boolean
        get() = p.getBoolean("confirmSensitive", true)
        set(v) = p.edit().putBoolean("confirmSensitive", v).apply()

    /** Tiya lit ses réponses à voix haute. */
    var speak: Boolean
        get() = p.getBoolean("speak", true)
        set(v) = p.edit().putBoolean("speak", v).apply()

    var maxSteps: Int
        get() = p.getInt("maxSteps", 30)
        set(v) = p.edit().putInt("maxSteps", v.coerceIn(5, 100)).apply()

    /** Applications que Tiya n'a jamais le droit de toucher (une par ligne). */
    var blockedApps: String
        get() = p.getString("blockedApps", DEFAULT_BLOCKED) ?: DEFAULT_BLOCKED
        set(v) = p.edit().putString("blockedApps", v).apply()

    var userName: String
        get() = p.getString("userName", "") ?: ""
        set(v) = p.edit().putString("userName", v.trim()).apply()

    fun blockedList(): List<String> =
        blockedApps.lines().map { it.trim().lowercase() }.filter { it.isNotEmpty() }

    fun toMap(): Map<String, Any> = mapOf(
        "provider" to provider,
        "geminiKey" to geminiKey,
        "geminiModel" to geminiModel,
        "claudeKey" to claudeKey,
        "claudeModel" to claudeModel,
        "vision" to vision,
        "confirmSensitive" to confirmSensitive,
        "speak" to speak,
        "maxSteps" to maxSteps,
        "blockedApps" to blockedApps,
        "userName" to userName,
    )

    fun fromMap(m: Map<*, *>) {
        (m["provider"] as? String)?.let { provider = it }
        (m["geminiKey"] as? String)?.let { geminiKey = it }
        (m["geminiModel"] as? String)?.let { geminiModel = it }
        (m["claudeKey"] as? String)?.let { claudeKey = it }
        (m["claudeModel"] as? String)?.let { claudeModel = it }
        (m["vision"] as? Boolean)?.let { vision = it }
        (m["confirmSensitive"] as? Boolean)?.let { confirmSensitive = it }
        (m["speak"] as? Boolean)?.let { speak = it }
        (m["maxSteps"] as? Number)?.let { maxSteps = it.toInt() }
        (m["blockedApps"] as? String)?.let { blockedApps = it }
        (m["userName"] as? String)?.let { userName = it }
    }

    companion object {
        const val DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
        const val DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5"
        // Mots-clés : toute app dont le nom ou le package contient un de ces mots est bloquée.
        const val DEFAULT_BLOCKED = "banque\nbank\nm-pesa\nmpesa\norange money\nairtel money\nafrimoney\nillicocash"
    }
}
