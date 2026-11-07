package co.cuervo.tiya

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.util.DisplayMetrics
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class Screenshot(val base64: String, val width: Int, val height: Int, val scale: Double)

/**
 * Service d'accessibilité : c'est lui qui « voit » l'écran et agit sur le téléphone.
 */
class TiyaService : AccessibilityService() {

    companion object {
        @Volatile var instance: TiyaService? = null
            private set
    }

    lateinit var agent: TiyaAgent
        private set
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var overlay: TiyaOverlay? = null
    private var recognizer: SpeechRecognizer? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        agent = TiyaAgent(this)
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.FRENCH
                ttsReady = true
            }
        }
        overlay = TiyaOverlay(this)
        if (TiyaSettings(this).bubbleEnabled) overlay?.show()
        TiyaBus.emit("status", "connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        cleanup()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        cleanup()
        super.onDestroy()
    }

    private fun cleanup() {
        if (instance === this) instance = null
        if (::agent.isInitialized) agent.stop()
        overlay?.hide()
        overlay = null
        recognizer?.destroy()
        recognizer = null
        tts?.shutdown()
        tts = null
        TiyaBus.emit("status", "disconnected")
    }

    // ---------------------------------------------------------------- écran

    fun screenSize(): Pair<Int, Int> {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= 30) {
            val b = wm.currentWindowMetrics.bounds
            Pair(b.width(), b.height())
        } else {
            val dm = DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(dm)
            Pair(dm.widthPixels, dm.heightPixels)
        }
    }

    fun readScreen(): ScreenSnapshot {
        val (w, h) = screenSize()
        var root = rootInActiveWindow
        if (root == null || root.packageName == packageName) {
            // Cherche la fenêtre d'application visible la plus haute qui n'est pas Tiya.
            val alt = windows
                .filter { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION }
                .mapNotNull { it.root }
                .firstOrNull { it.packageName != packageName }
            if (alt != null) root = alt
        }
        return ScreenReader.read(root, w, h)
    }

    fun screenshotJpegBase64(): Screenshot? {
        if (Build.VERSION.SDK_INT < 30) return null
        val latch = CountDownLatch(1)
        var bmp: Bitmap? = null
        main.post { overlay?.setHidden(true) }
        Thread.sleep(120)
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(result: ScreenshotResult) {
                    try {
                        val hw = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        bmp = hw?.copy(Bitmap.Config.ARGB_8888, false)
                        hw?.recycle()
                        result.hardwareBuffer.close()
                    } catch (_: Exception) {
                    }
                    latch.countDown()
                }

                override fun onFailure(errorCode: Int) {
                    latch.countDown()
                }
            })
            latch.await(4, TimeUnit.SECONDS)
        } finally {
            main.post { overlay?.setHidden(false) }
        }
        val full = bmp ?: return null
        val targetW = 600
        val scale = if (full.width > targetW) targetW.toDouble() / full.width else 1.0
        val scaled = if (scale < 1.0) {
            Bitmap.createScaledBitmap(full, targetW, (full.height * scale).toInt(), true)
        } else full
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 55, out)
        val shot = Screenshot(
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP),
            scaled.width, scaled.height, scale
        )
        if (scaled !== full) scaled.recycle()
        full.recycle()
        return shot
    }

    // ---------------------------------------------------------------- applis

    private fun launchableApps(): List<Pair<String, String>> {
        val pm = packageManager
        val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        @Suppress("DEPRECATION")
        val list = pm.queryIntentActivities(i, 0)
        return list.map { Pair(it.loadLabel(pm).toString(), it.activityInfo.packageName) }
            .distinctBy { it.second }
    }

    fun appLabel(nameOrPkg: String): String? {
        return try {
            val info = packageManager.getApplicationInfo(nameOrPkg, 0)
            packageManager.getApplicationLabel(info).toString()
        } catch (_: PackageManager.NameNotFoundException) {
            null
        } catch (_: Exception) {
            null
        }
    }

    fun openApp(name: String): String {
        val q = name.trim().lowercase(Locale.ROOT)
        if (q.isEmpty()) return "ÉCHEC : nom d'application vide."
        val apps = launchableApps()
        val match = apps.firstOrNull { it.second.equals(q, true) }
            ?: apps.firstOrNull { it.first.equals(q, true) }
            ?: apps.firstOrNull { it.first.lowercase(Locale.ROOT).startsWith(q) }
            ?: apps.firstOrNull { it.first.lowercase(Locale.ROOT).contains(q) }
            ?: apps.firstOrNull { q.contains(it.first.lowercase(Locale.ROOT)) && it.first.length > 3 }
            ?: apps.firstOrNull { it.second.lowercase(Locale.ROOT).contains(q.replace(" ", "")) }
        if (match == null) {
            val names = apps.map { it.first }.sorted().take(80).joinToString(", ")
            return "ÉCHEC : aucune app nommée « $name ». Apps installées : $names"
        }
        val intent = packageManager.getLaunchIntentForPackage(match.second)
            ?: return "ÉCHEC : impossible de lancer ${match.first}."
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return try {
            startActivity(intent)
            Thread.sleep(1200)
            "OK : ${match.first} ouvert."
        } catch (e: Exception) {
            "ÉCHEC : ${e.message}"
        }
    }

    fun openTiyaApp() {
        val i = packageManager.getLaunchIntentForPackage(packageName) ?: return
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        runCatching { startActivity(i) }
    }

    // ---------------------------------------------------------------- actions

    fun tapElement(el: ScreenElement, long: Boolean): String {
        val action = if (long) AccessibilityNodeInfo.ACTION_LONG_CLICK else AccessibilityNodeInfo.ACTION_CLICK
        var n: AccessibilityNodeInfo? = el.node
        var depth = 0
        while (n != null && depth < 6) {
            val can = if (long) n.isLongClickable else n.isClickable
            if (can && n.isEnabled) {
                if (n.performAction(action)) return "OK"
                break
            }
            n = n.parent
            depth++
        }
        // Repli : geste au centre de l'élément.
        return tapPoint(el.bounds.exactCenterX(), el.bounds.exactCenterY(), long)
    }

    fun tapPoint(x: Float, y: Float, long: Boolean): String {
        val (w, h) = screenSize()
        if (x < 0 || y < 0 || x > w || y > h) return "ÉCHEC : point ($x,$y) hors de l'écran."
        val path = Path().apply { moveTo(x, y) }
        return if (gesture(path, if (long) 800L else 60L)) "OK" else "ÉCHEC : le geste n'a pas abouti."
    }

    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, ms: Long): String {
        val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        return if (gesture(path, ms.coerceIn(100, 3000))) "OK" else "ÉCHEC : le glissement n'a pas abouti."
    }

    /** Appui maintenu puis glissement vers le haut (verrouillage d'un vocal). */
    fun holdAndSlideUp(x: Float, y: Float): Boolean {
        val dist = resources.displayMetrics.density * 170f
        val endY = (y - dist).coerceAtLeast(10f)
        val hold = Path().apply { moveTo(x, y); lineTo(x, y - 1f) }
        val first = GestureDescription.StrokeDescription(hold, 0, 650, true)
        if (!dispatchAndWait(GestureDescription.Builder().addStroke(first).build(), 650)) return false
        val slide = Path().apply { moveTo(x, y - 1f); lineTo(x, endY) }
        val second = first.continueStroke(slide, 0, 700, false)
        return dispatchAndWait(GestureDescription.Builder().addStroke(second).build(), 700)
    }

    private fun dispatchAndWait(g: GestureDescription, duration: Long): Boolean {
        val latch = CountDownLatch(1)
        var ok = false
        main.post {
            val sent = dispatchGesture(g, object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    ok = true; latch.countDown()
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    latch.countDown()
                }
            }, null)
            if (!sent) latch.countDown()
        }
        latch.await(duration + 3000, TimeUnit.MILLISECONDS)
        return ok
    }

    private fun gesture(path: Path, duration: Long): Boolean {
        val g = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()
        val latch = CountDownLatch(1)
        var ok = false
        main.post {
            val sent = dispatchGesture(g, object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    ok = true; latch.countDown()
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    latch.countDown()
                }
            }, null)
            if (!sent) latch.countDown()
        }
        latch.await(duration + 3000, TimeUnit.MILLISECONDS)
        return ok
    }

    fun typeText(el: ScreenElement?, text: String, submit: Boolean): String {
        var target: AccessibilityNodeInfo? = el?.node
        if (target != null && !target.isEditable) {
            // L'IA a peut-être désigné un conteneur : on cherche un champ à l'intérieur.
            target = findEditable(target) ?: target
        }
        if (target == null) target = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (target == null) target = rootInActiveWindow?.let { findEditable(it) }
        if (target == null) return "ÉCHEC : aucun champ de saisie trouvé. Touche d'abord le champ."
        if (target.isPassword) return "REFUSÉ : c'est un champ de mot de passe. Demande à l'utilisateur de le remplir lui-même."

        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        target.performAction(AccessibilityNodeInfo.ACTION_CLICK)

        val args = Bundle()
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        var ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (!ok) {
            // Repli : copier-coller.
            val latch = CountDownLatch(1)
            main.post {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("tiya", text))
                latch.countDown()
            }
            latch.await(2, TimeUnit.SECONDS)
            ok = target.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        }
        if (!ok) return "ÉCHEC : impossible d'écrire dans ce champ."
        if (submit) {
            Thread.sleep(250)
            if (Build.VERSION.SDK_INT >= 30) {
                val enter = AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id
                if (!target.performAction(enter)) return "OK (texte écrit, mais Entrée n'a pas marché : touche le bouton de validation)"
            } else {
                return "OK (texte écrit ; touche le bouton de validation)"
            }
        }
        return "OK"
    }

    private fun findEditable(n: AccessibilityNodeInfo, depth: Int = 0): AccessibilityNodeInfo? {
        if (depth > 30) return null
        if (n.isEditable && n.isVisibleToUser) return n
        for (i in 0 until n.childCount) {
            val c = n.getChild(i) ?: continue
            val f = findEditable(c, depth + 1)
            if (f != null) return f
        }
        return null
    }

    fun scroll(direction: String, el: ScreenElement?): String {
        val d = direction.lowercase(Locale.ROOT)
        if (el != null && el.node.isScrollable) {
            val action = if (d == "up" || d == "left") AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            if (el.node.performAction(action)) return "OK"
        }
        val (w, h) = screenSize()
        val cx = w / 2f
        val cy = h / 2f
        return when (d) {
            "up" -> swipe(cx, h * 0.30f, cx, h * 0.72f, 450)
            "left" -> swipe(w * 0.25f, cy, w * 0.80f, cy, 400)
            "right" -> swipe(w * 0.80f, cy, w * 0.25f, cy, 400)
            else -> swipe(cx, h * 0.72f, cx, h * 0.30f, 450)
        }
    }

    fun globalBack(): String = if (performGlobalAction(GLOBAL_ACTION_BACK)) "OK" else "ÉCHEC"
    fun goHome(): String = if (performGlobalAction(GLOBAL_ACTION_HOME)) "OK" else "ÉCHEC"
    fun recents(): String = if (performGlobalAction(GLOBAL_ACTION_RECENTS)) "OK" else "ÉCHEC"
    fun notifications(): String = if (performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)) "OK" else "ÉCHEC"

    // ---------------------------------------------------------------- voix

    fun speak(text: String) {
        if (!TiyaSettings(this).speak || !ttsReady || text.isBlank()) return
        main.post {
            applyVoice()
            tts?.speak(text.take(400), TextToSpeech.QUEUE_FLUSH, null, "tiya")
        }
    }

    /** Applique la voix, la vitesse et la tonalité choisies dans les réglages. */
    private fun applyVoice(name: String? = null, rate: Float? = null, pitch: Float? = null) {
        val t = tts ?: return
        val s = TiyaSettings(this)
        val wanted = name ?: s.ttsVoice
        val v = if (wanted.isNotEmpty()) runCatching { t.voices?.firstOrNull { it.name == wanted } }.getOrNull() else null
        if (v != null) t.voice = v else t.language = Locale.FRENCH
        t.setSpeechRate(rate ?: s.ttsRate)
        t.setPitch(pitch ?: s.ttsPitch)
    }

    /** Voix françaises disponibles sur le téléphone. */
    fun listVoices(): List<Map<String, Any>> {
        val t = tts ?: return emptyList()
        val voices = runCatching { t.voices?.toList() }.getOrNull() ?: return emptyList()
        return voices
            .filter { it.locale.language == "fr" && !it.features.contains("notInstalled") }
            .sortedWith(compareBy({ it.isNetworkConnectionRequired }, { it.locale.country != "FR" }, { it.name }))
            .map {
                mapOf(
                    "name" to it.name,
                    "country" to it.locale.country,
                    "network" to it.isNetworkConnectionRequired,
                    "quality" to it.quality,
                )
            }
    }

    fun previewVoice(name: String, rate: Float, pitch: Float) {
        if (!ttsReady) return
        main.post {
            applyVoice(name, rate, pitch)
            tts?.speak("Bonjour, je suis Tiya. Que puis-je faire pour toi ?", TextToSpeech.QUEUE_FLUSH, null, "preview")
        }
    }

    fun setBubbleEnabled(on: Boolean) {
        main.post { if (on) overlay?.show() else overlay?.hide() }
    }

    /** Parle et attend la fin de la phrase (avant d'utiliser le micro pour autre chose). */
    fun speakAndWait(text: String) {
        if (!TiyaSettings(this).speak || !ttsReady || text.isBlank()) return
        val done = CountDownLatch(1)
        main.post {
            val t = tts
            if (t == null) { done.countDown(); return@post }
            t.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) { done.countDown() }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) { done.countDown() }
            })
            applyVoice()
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tiya_wait")
        }
        done.await(8, TimeUnit.SECONDS)
    }

    /** source = "app" (le texte revient à l'interface) ou "bubble" (Tiya agit directement). */
    fun startListening(source: String) {
        main.post {
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                TiyaBus.emit("error", "Autorise le micro dans l'app Tiya pour utiliser la voix.")
                if (source == "bubble") openTiyaApp()
                return@post
            }
            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                TiyaBus.emit("error", "La reconnaissance vocale n'est pas disponible sur ce téléphone (installe ou mets à jour l'app Google).")
                return@post
            }
            tts?.stop()
            recognizer?.destroy()
            val r = SpeechRecognizer.createSpeechRecognizer(this)
            recognizer = r
            overlay?.setListening(true)
            r.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(eventType: Int, params: Bundle?) {}

                override fun onPartialResults(partialResults: Bundle?) {
                    val t = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    if (!t.isNullOrBlank()) TiyaBus.emit("partial_speech", t)
                }

                override fun onResults(results: Bundle?) {
                    overlay?.setListening(false)
                    val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    if (t.isNullOrBlank()) {
                        TiyaBus.emit("speech_end", "")
                        return
                    }
                    if (source == "app") {
                        TiyaBus.emit("speech", t)
                    } else {
                        handleVoiceCommand(t)
                    }
                }

                override fun onError(error: Int) {
                    overlay?.setListening(false)
                    TiyaBus.emit("speech_end", "")
                    if (error != SpeechRecognizer.ERROR_NO_MATCH && error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                        TiyaBus.emit("error", "Micro : erreur de reconnaissance ($error).")
                    }
                }
            })
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            r.startListening(i)
        }
    }

    fun stopListening() {
        main.post {
            recognizer?.stopListening()
            overlay?.setListening(false)
        }
    }

    private fun handleVoiceCommand(text: String) {
        val t = text.trim()
        when {
            agent.waitingFor != null -> agent.reply(t)
            Regex("^(stop|arrête|arrete|stoppe)", RegexOption.IGNORE_CASE).containsMatchIn(t) -> agent.stop()
            agent.running -> TiyaBus.emit("error", "Je suis déjà occupée. Dis « stop » pour arrêter.")
            else -> agent.start(t, fromApp = false)
        }
    }

    // ---------------------------------------------------------------- bulle

    fun setStatus(text: String?) {
        main.post { overlay?.setStatus(text, agent.running) }
    }

    fun showQuestion(q: String) = main.post { overlay?.showPanel(q, confirm = false) }
    fun showConfirm(q: String, yesLabel: String = "Oui", noLabel: String = "Non") =
        main.post { overlay?.showPanel(q, confirm = true, yesLabel = yesLabel, noLabel = noLabel) }
    fun hideQuestion() = main.post { overlay?.hidePanel() }
}
