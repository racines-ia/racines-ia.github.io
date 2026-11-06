package co.cuervo.tiya

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class LlmException(message: String) : Exception(message)

/** Appelle Gemini ou Claude et renvoie la réponse texte brute du modèle. */
class LlmClient(private val settings: TiyaSettings) {

    fun ask(system: String, userText: String, imageJpegBase64: String?): String {
        return if (settings.provider == "claude") askClaude(system, userText, imageJpegBase64)
        else askGemini(system, userText, imageJpegBase64)
    }

    private fun askGemini(system: String, userText: String, img: String?): String {
        val key = settings.geminiKey
        if (key.isBlank()) throw LlmException("Clé API Gemini manquante. Ajoute-la dans les réglages de Tiya.")
        val model = settings.geminiModel

        val parts = JSONArray()
        parts.put(JSONObject().put("text", userText))
        if (img != null) {
            parts.put(
                JSONObject().put(
                    "inlineData",
                    JSONObject().put("mimeType", "image/jpeg").put("data", img)
                )
            )
        }
        val body = JSONObject()
            .put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", system))))
            .put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts", parts)))
            .put(
                "generationConfig",
                JSONObject().put("temperature", 0.2).put("responseMimeType", "application/json")
            )

        val url = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent"
        val res = post(url, body.toString(), mapOf("x-goog-api-key" to key))
        val json = JSONObject(res)
        val cands = json.optJSONArray("candidates")
        if (cands == null || cands.length() == 0) {
            val block = json.optJSONObject("promptFeedback")?.optString("blockReason") ?: ""
            throw LlmException("Gemini n'a renvoyé aucune réponse. $block")
        }
        val outParts = cands.getJSONObject(0).optJSONObject("content")?.optJSONArray("parts")
            ?: throw LlmException("Réponse Gemini vide.")
        val sb = StringBuilder()
        for (i in 0 until outParts.length()) {
            val p = outParts.getJSONObject(i)
            if (p.optBoolean("thought", false)) continue
            sb.append(p.optString("text", ""))
        }
        return sb.toString()
    }

    private fun askClaude(system: String, userText: String, img: String?): String {
        val key = settings.claudeKey
        if (key.isBlank()) throw LlmException("Clé API Claude manquante. Ajoute-la dans les réglages de Tiya.")

        val content = JSONArray()
        if (img != null) {
            content.put(
                JSONObject().put("type", "image").put(
                    "source",
                    JSONObject().put("type", "base64").put("media_type", "image/jpeg").put("data", img)
                )
            )
        }
        content.put(JSONObject().put("type", "text").put("text", userText))

        val body = JSONObject()
            .put("model", settings.claudeModel)
            .put("max_tokens", 1024)
            .put("system", system)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", content)))

        val res = post(
            "https://api.anthropic.com/v1/messages",
            body.toString(),
            mapOf("x-api-key" to key, "anthropic-version" to "2023-06-01")
        )
        val json = JSONObject(res)
        val arr = json.optJSONArray("content") ?: throw LlmException("Réponse Claude vide.")
        val sb = StringBuilder()
        for (i in 0 until arr.length()) {
            val c = arr.getJSONObject(i)
            if (c.optString("type") == "text") sb.append(c.optString("text"))
        }
        return sb.toString()
    }

    private fun post(url: String, body: String, headers: Map<String, String>): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 30_000
            conn.readTimeout = 90_000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.let { s ->
                BufferedReader(InputStreamReader(s, Charsets.UTF_8)).use { it.readText() }
            } ?: ""
            if (code !in 200..299) {
                val msg = runCatching {
                    JSONObject(text).optJSONObject("error")?.optString("message")
                }.getOrNull()
                throw LlmException(friendlyError(code, msg ?: text.take(300)))
            }
            return text
        } catch (e: LlmException) {
            throw e
        } catch (e: java.net.UnknownHostException) {
            throw LlmException("Pas de connexion Internet.")
        } catch (e: java.net.SocketTimeoutException) {
            throw LlmException("Le serveur de l'IA met trop de temps à répondre. Réessaie.")
        } finally {
            conn.disconnect()
        }
    }

    private fun friendlyError(code: Int, msg: String): String = when (code) {
        400 -> "Requête refusée (400) : $msg"
        401, 403 -> "Clé API invalide ou sans autorisation ($code) : $msg"
        404 -> "Modèle introuvable (404). Vérifie le nom du modèle dans les réglages. $msg"
        429 -> "Trop de demandes ou crédit épuisé (429). Attends un peu. $msg"
        529, 503 -> "Le service d'IA est surchargé ($code). Réessaie dans un instant."
        else -> "Erreur $code : $msg"
    }
}
