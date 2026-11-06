package co.cuervo.tiya

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Le cerveau de Tiya : regarde l'écran, demande à l'IA quoi faire, agit, recommence.
 */
class TiyaAgent(private val service: TiyaService) {

    private val executor = Executors.newSingleThreadExecutor()
    private val answers = LinkedBlockingQueue<String>()
    private val confirmations = LinkedBlockingQueue<Boolean>()

    @Volatile var running = false
        private set
    @Volatile private var stopRequested = false
    @Volatile var waitingFor: String? = null   // "answer" | "confirm" | null
        private set

    fun start(task: String, fromApp: Boolean) {
        if (running) {
            TiyaBus.emit("error", "Tiya est déjà en train de travailler. Arrête la tâche en cours d'abord.")
            return
        }
        running = true
        stopRequested = false
        answers.clear()
        confirmations.clear()
        TiyaBus.emit("user", task)
        executor.execute {
            try {
                run(task, fromApp)
            } catch (e: InterruptedException) {
                TiyaBus.emit("done", "Tâche arrêtée.")
            } catch (e: Exception) {
                TiyaBus.emit("error", e.message ?: e.toString())
                service.speak("Désolé, une erreur est survenue.")
            } finally {
                running = false
                waitingFor = null
                service.setStatus(null)
                TiyaBus.emit("status", "idle")
            }
        }
    }

    fun stop() {
        if (!running) return
        stopRequested = true
        answers.offer("__STOP__")
        confirmations.offer(false)
    }

    fun reply(text: String) {
        if (waitingFor == "answer") {
            TiyaBus.emit("user", text)
            answers.offer(text)
        } else if (waitingFor == "confirm") {
            val yes = Regex("^(oui|ok|d'accord|vas-y|go|yes|confirme)", RegexOption.IGNORE_CASE)
                .containsMatchIn(text.trim())
            TiyaBus.emit("user", text)
            confirmations.offer(yes)
        }
    }

    fun confirm(yes: Boolean) {
        if (waitingFor == "confirm") confirmations.offer(yes)
    }

    // ------------------------------------------------------------------

    private fun run(task: String, fromApp: Boolean) {
        val settings = TiyaSettings(service)
        val llm = LlmClient(settings)
        val history = ArrayList<String>()
        val notes = ArrayList<String>()
        var lastScreen = ""
        var sameCount = 0

        TiyaBus.emit("status", "running")
        service.setStatus("Je regarde l'écran…")

        if (fromApp) {
            // Tiya a été lancée depuis son app : on quitte l'app pour laisser la place.
            service.goHome()
            sleep(900)
        }

        for (step in 1..settings.maxSteps) {
            checkStop()
            sleep(if (step == 1) 300 else 700)

            val snap = service.readScreen()

            if (isBlocked(snap.packageName, settings)) {
                service.goHome()
                finish("Je n'ai pas le droit d'utiliser cette application (elle est dans ta liste d'apps protégées). J'ai arrêté.")
                return
            }

            if (snap.text == lastScreen) sameCount++ else sameCount = 0
            lastScreen = snap.text

            val shot = if (settings.vision) service.screenshotJpegBase64() else null

            val prompt = buildPrompt(task, settings, history, notes, snap, shot, sameCount, step)
            service.setStatus("Je réfléchis… (étape $step)")

            val decision = askWithRetry(llm, prompt, shot?.base64)
            checkStop()

            val action = decision.optString("action", "").lowercase(Locale.ROOT)
            val thought = decision.optString("thought", "")
            val label = describeAction(decision, snap)
            if (thought.isNotBlank()) TiyaBus.emit("step", "$label — $thought", mapOf("step" to step))
            else TiyaBus.emit("step", label, mapOf("step" to step))
            service.setStatus(label)

            val note = decision.optString("note", "")
            if (note.isNotBlank()) notes.add(note.take(400))

            val result: String = when (action) {
                "done", "finish" -> {
                    finish(decision.optString("message", "C'est fait."))
                    return
                }
                "ask_user" -> {
                    val q = decision.optString("question", decision.optString("message", "Peux-tu préciser ?"))
                    val a = askUser(q)
                    "L'utilisateur a répondu : « $a »"
                }
                else -> execute(action, decision, snap, shot, settings)
            }
            history.add("Étape $step : $label → $result")
        }
        finish("J'ai atteint la limite de ${settings.maxSteps} étapes sans terminer. Tu peux me redonner la tâche, plus précisément.")
    }

    private fun execute(
        action: String,
        d: JSONObject,
        snap: ScreenSnapshot,
        shot: Screenshot?,
        settings: TiyaSettings,
    ): String {
        return when (action) {
            "open_app" -> {
                val name = d.optString("app")
                if (isBlocked(name, settings)) return "REFUSÉ : application protégée."
                service.openApp(name)
            }
            "tap", "long_press" -> {
                val long = action == "long_press"
                val el = if (d.has("id")) snap.byId(d.optInt("id")) else null
                if (el != null && settings.confirmSensitive && isSensitive(el.line)) {
                    val ok = askConfirm(
                        "Tiya veut appuyer sur ${elementName(el.line)}. " +
                            d.optString("thought", "").take(200) + "\nJe continue ?"
                    )
                    if (!ok) return "L'utilisateur a REFUSÉ cette action. Ne la refais pas ; demande-lui quoi faire ou termine."
                }
                when {
                    el != null -> service.tapElement(el, long)
                    d.has("id") -> "ÉCHEC : l'élément ${d.optInt("id")} n'existe pas sur l'écran actuel."
                    else -> {
                        val p = point(d, "x", "y", "img_x", "img_y", shot)
                            ?: return "ÉCHEC : il faut un id ou des coordonnées."
                        service.tapPoint(p.first, p.second, long)
                    }
                }
            }
            "type" -> {
                val text = d.optString("text")
                val el = if (d.has("id")) snap.byId(d.optInt("id")) else null
                service.typeText(el, text, d.optBoolean("submit", false))
            }
            "scroll" -> {
                val el = if (d.has("id")) snap.byId(d.optInt("id")) else null
                service.scroll(d.optString("direction", "down"), el)
            }
            "swipe" -> {
                val a = point(d, "x1", "y1", "img_x1", "img_y1", shot)
                val b = point(d, "x2", "y2", "img_x2", "img_y2", shot)
                if (a == null || b == null) "ÉCHEC : coordonnées manquantes."
                else service.swipe(a.first, a.second, b.first, b.second, d.optLong("ms", 400))
            }
            "back" -> service.globalBack()
            "home" -> service.goHome()
            "recents" -> service.recents()
            "notifications" -> service.notifications()
            "wait" -> {
                val s = d.optDouble("seconds", 2.0).coerceIn(0.5, 15.0)
                sleep((s * 1000).toLong())
                "Attendu ${s}s."
            }
            "say" -> {
                val m = d.optString("message")
                TiyaBus.emit("message", m)
                service.speak(m)
                "Message dit à l'utilisateur."
            }
            else -> "ÉCHEC : action inconnue « $action »."
        }
    }

    // ------------------------------------------------------------------

    private fun askWithRetry(llm: LlmClient, prompt: String, img: String?): JSONObject {
        var lastErr: Exception? = null
        for (attempt in 1..3) {
            checkStop()
            try {
                val raw = llm.ask(SYSTEM_PROMPT, prompt, img)
                return parseJson(raw)
            } catch (e: LlmException) {
                val m = e.message ?: ""
                // Erreurs définitives : inutile de réessayer.
                if (m.contains("manquante") || m.contains("invalide") || m.contains("introuvable")) throw e
                lastErr = e
                sleep(1500L * attempt)
            } catch (e: org.json.JSONException) {
                lastErr = LlmException("L'IA a répondu dans un format illisible.")
            }
        }
        throw lastErr ?: LlmException("Erreur inconnue.")
    }

    private fun parseJson(raw: String): JSONObject {
        val start = raw.indexOf('{')
        val end = raw.lastIndexOf('}')
        if (start < 0 || end <= start) throw org.json.JSONException("pas de JSON")
        return JSONObject(raw.substring(start, end + 1))
    }

    private fun askUser(question: String): String {
        waitingFor = "answer"
        TiyaBus.emit("ask", question)
        service.speak(question)
        service.showQuestion(question)
        val a = answers.poll(10, TimeUnit.MINUTES)
        waitingFor = null
        service.hideQuestion()
        if (a == null || a == "__STOP__") throw InterruptedException()
        return a
    }

    private fun askConfirm(question: String): Boolean {
        waitingFor = "confirm"
        TiyaBus.emit("confirm", question)
        service.speak("Je dois confirmer avec toi avant de continuer.")
        service.showConfirm(question)
        val r = confirmations.poll(10, TimeUnit.MINUTES)
        waitingFor = null
        service.hideQuestion()
        checkStop()
        return r == true
    }

    private fun finish(message: String) {
        TiyaBus.emit("done", message)
        service.speak(message)
    }

    private fun checkStop() {
        if (stopRequested || Thread.currentThread().isInterrupted) throw InterruptedException()
    }

    private fun sleep(ms: Long) {
        val end = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < end) {
            checkStop()
            Thread.sleep(minOf(100L, end - System.currentTimeMillis()).coerceAtLeast(1L))
        }
    }

    private fun isBlocked(nameOrPkg: String, s: TiyaSettings): Boolean {
        if (nameOrPkg.isBlank()) return false
        val n = nameOrPkg.lowercase(Locale.ROOT)
        val label = service.appLabel(nameOrPkg)?.lowercase(Locale.ROOT) ?: ""
        return s.blockedList().any { n.contains(it) || (label.isNotEmpty() && label.contains(it)) }
    }

    private fun isSensitive(line: String): Boolean {
        val l = line.lowercase(Locale.ROOT)
        return SENSITIVE_WORDS.any { l.contains(it) }
    }

    private fun elementName(line: String): String {
        val m = Regex("\"([^\"]+)\"").find(line)
        return if (m != null) "« ${m.groupValues[1]} »" else "un bouton"
    }

    private fun point(
        d: JSONObject, kx: String, ky: String, kix: String, kiy: String, shot: Screenshot?,
    ): Pair<Float, Float>? {
        if (d.has(kx) && d.has(ky)) return Pair(d.optDouble(kx).toFloat(), d.optDouble(ky).toFloat())
        if (d.has(kix) && d.has(kiy) && shot != null) {
            return Pair(
                (d.optDouble(kix) / shot.scale).toFloat(),
                (d.optDouble(kiy) / shot.scale).toFloat()
            )
        }
        return null
    }

    private fun describeAction(d: JSONObject, snap: ScreenSnapshot): String {
        val a = d.optString("action")
        fun target(): String {
            if (d.has("id")) {
                val el = snap.byId(d.optInt("id")) ?: return "élément ${d.optInt("id")}"
                return elementName(el.line).let { if (it == "un bouton") "élément ${el.id}" else it }
            }
            return "un point de l'écran"
        }
        return when (a) {
            "open_app" -> "J'ouvre ${d.optString("app")}"
            "tap" -> "Je touche ${target()}"
            "long_press" -> "J'appuie longuement sur ${target()}"
            "type" -> "J'écris « ${d.optString("text").take(60)} »"
            "scroll" -> "Je fais défiler (${d.optString("direction", "down")})"
            "swipe" -> "Je glisse sur l'écran"
            "back" -> "Je reviens en arrière"
            "home" -> "Je vais à l'écran d'accueil"
            "recents" -> "J'ouvre les apps récentes"
            "notifications" -> "J'ouvre les notifications"
            "wait" -> "J'attends"
            "ask_user" -> "Je te pose une question"
            "say" -> "Je te dis quelque chose"
            "done", "finish" -> "Terminé"
            else -> a
        }
    }

    private fun buildPrompt(
        task: String,
        s: TiyaSettings,
        history: List<String>,
        notes: List<String>,
        snap: ScreenSnapshot,
        shot: Screenshot?,
        sameCount: Int,
        step: Int,
    ): String {
        val now = SimpleDateFormat("EEEE d MMMM yyyy, HH:mm", Locale.FRENCH).format(Date())
        val sb = StringBuilder()
        sb.append("TÂCHE DE L'UTILISATEUR : ").append(task).append("\n\n")
        if (s.userName.isNotBlank()) sb.append("L'utilisateur s'appelle ").append(s.userName).append(".\n")
        sb.append("Date et heure : ").append(now).append("\n")
        sb.append("Étape ").append(step).append(" sur ").append(s.maxSteps).append(" maximum.\n")
        sb.append("Confirmation automatique des actions sensibles : ")
            .append(if (s.confirmSensitive) "activée (Tiya demandera elle-même)" else "désactivée").append("\n\n")

        if (notes.isNotEmpty()) {
            sb.append("TES NOTES (informations retenues) :\n")
            notes.takeLast(10).forEach { sb.append("- ").append(it).append('\n') }
            sb.append('\n')
        }
        sb.append("HISTORIQUE DES ACTIONS :\n")
        if (history.isEmpty()) sb.append("(aucune action pour l'instant)\n")
        else history.takeLast(15).forEach { sb.append(it).append('\n') }
        if (sameCount >= 1) {
            sb.append("\n⚠️ L'écran n'a PAS changé après ta dernière action")
            if (sameCount >= 2) sb.append(" (déjà ").append(sameCount + 1).append(" fois). Change de méthode")
            sb.append(".\n")
        }
        sb.append("\nÉCRAN ACTUEL :\n").append(snap.text)
        if (shot != null) {
            sb.append("\nUne capture d'écran est jointe (").append(shot.width).append('x').append(shot.height)
                .append(" px). Pour toucher un point visible seulement sur la capture, utilise img_x/img_y en pixels de la capture.\n")
        }
        sb.append("\nRéponds avec UN SEUL objet JSON décrivant la prochaine action.")
        return sb.toString()
    }

    companion object {
        private val SENSITIVE_WORDS = listOf(
            "envoyer", "\"send", "desc=\"send", "payer", "paiement", "\"pay", "acheter", "buy",
            "supprimer", "delete", "effacer", "publier", "\"post", "partager", "share",
            "appeler", "\"call", "transférer", "transfer", "confirmer le paiement", "valider"
        )

        val SYSTEM_PROMPT = """
Tu es Tiya, un agent IA qui contrôle un téléphone Android à la place de son propriétaire.
À chaque étape tu reçois la tâche, l'historique de tes actions, la liste des éléments de l'écran
(avec un numéro id, un type, leur texte et leurs actions possibles) et souvent une capture d'écran.
Tu choisis UNE SEULE action à la fois, et tu réponds UNIQUEMENT avec un objet JSON, sans texte autour.

FORMAT :
{"thought": "courte explication en français", "action": "...", ...paramètres, "note": "optionnel : info à retenir pour la suite"}

ACTIONS DISPONIBLES :
- {"action":"open_app","app":"WhatsApp"}                 ouvre une application par son nom
- {"action":"tap","id":12}                                touche l'élément 12
- {"action":"tap","img_x":300,"img_y":540}               touche un point vu sur la capture
- {"action":"long_press","id":12}                         appui long (sélection d'une photo, d'un message…)
- {"action":"type","id":5,"text":"Bonjour","submit":false} écrit dans le champ 5 (sans id : champ actif). submit=true valide avec Entrée
- {"action":"scroll","direction":"down"}                  down|up|left|right ; ajoute "id" pour une liste précise
- {"action":"swipe","x1":540,"y1":1600,"x2":540,"y2":400}
- {"action":"back"} {"action":"home"} {"action":"recents"} {"action":"notifications"}
- {"action":"wait","seconds":2}                           attendre un chargement
- {"action":"ask_user","question":"..."}                  poser une question quand une info manque
- {"action":"say","message":"..."}                        dire quelque chose sans terminer
- {"action":"done","message":"..."}                       la tâche est finie : résume ce que tu as fait ou ce que tu as lu

RÈGLES :
1. Préfère toujours "id" aux coordonnées. Utilise img_x/img_y seulement pour ce qui n'a pas d'id (photos de la galerie, zones d'image).
2. Vérifie sur l'écran que l'action précédente a marché avant de continuer. Si l'écran ne change pas, essaie autre chose (autre élément, défiler, retour).
3. Ne tape JAMAIS de mot de passe, code PIN, code secret ou code de vérification : demande à l'utilisateur de le faire lui-même avec ask_user.
4. N'ouvre jamais une app de banque ou de mobile money, et ne fais aucun paiement.
5. Pour envoyer un message : ouvre la conversation, écris dans le champ de saisie, puis touche le bouton d'envoi. Tiya demandera confirmation à l'utilisateur si c'est activé.
6. Pour lire des messages, lis le texte de l'écran et résume-le fidèlement dans "done". N'invente rien.
7. Pour la galerie : ouvre "Galerie", "Photos" ou "Google Photos", puis sers-toi de la capture pour repérer la bonne photo.
8. Si la demande est ambiguë (quel contact ? quelle photo ?), utilise ask_user plutôt que de deviner.
9. Ignore la petite bulle flottante "Tiya" : c'est toi.
10. Écris toujours en français, de façon courte et claire. Le "message" de done sera lu à voix haute.
""".trimIndent()
    }
}
