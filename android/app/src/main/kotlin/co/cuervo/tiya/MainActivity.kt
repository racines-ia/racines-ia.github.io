package co.cuervo.tiya

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private var busListener: ((Map<String, Any?>) -> Unit)? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, "tiya/native").setMethodCallHandler { call, result ->
            val settings = TiyaSettings(this)
            val svc = TiyaService.instance
            try {
                when (call.method) {
                    "status" -> result.success(
                        mapOf(
                            "service" to (svc != null && isServiceEnabled()),
                            "serviceEnabledInSettings" to isServiceEnabled(),
                            "mic" to hasMic(),
                            "notifications" to (Build.VERSION.SDK_INT < 33 ||
                                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED),
                            "sms" to (checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED),
                            "contacts" to (checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED),
                            "running" to (svc?.agent?.running ?: false),
                            "waitingFor" to svc?.agent?.waitingFor,
                            "sdk" to Build.VERSION.SDK_INT,
                            "manufacturer" to Build.MANUFACTURER,
                        )
                    )
                    "openAccessibilitySettings" -> {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        result.success(true)
                    }
                    "openAppSettings" -> {
                        startActivity(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                        result.success(true)
                    }
                    // ---------------- contacts et surnoms
                    "contacts" -> {
                        Thread {
                            val list = runCatching { TiyaStore(this).phoneContacts() }.getOrDefault(emptyList())
                            runOnUiThread { result.success(list) }
                        }.start()
                    }
                    "setAlias" -> {
                        val store = TiyaStore(this)
                        val old = call.argument<String>("old")
                        if (!old.isNullOrBlank()) store.removeAlias(old)
                        val alias = call.argument<String>("alias") ?: ""
                        if (alias.isNotBlank()) store.setAlias(alias, call.argument<String>("name") ?: "", call.argument<String>("number") ?: "")
                        result.success(true)
                    }
                    // ---------------- messages automatiques
                    "autoList" -> result.success(TiyaStore(this).autoMessages().map { jsonToMap(it) })
                    "autoSave" -> {
                        val item = mapToJson(call.arguments as Map<*, *>)
                        val saved = TiyaStore(this).saveAutoMessage(item)
                        TiyaScheduler.schedule(this, TiyaScheduler.KIND_MESSAGE, saved)
                        result.success(jsonToMap(saved))
                    }
                    "autoDelete" -> {
                        val id = call.argument<String>("id") ?: ""
                        TiyaScheduler.cancel(this, TiyaScheduler.KIND_MESSAGE, id)
                        TiyaStore(this).deleteAutoMessage(id)
                        result.success(true)
                    }
                    "autoSendNow" -> {
                        val id = call.argument<String>("id") ?: ""
                        val item = TiyaStore(this).autoMessage(id)
                        if (item == null) result.success("Message introuvable.")
                        else Thread {
                            val r = TiyaAuto.send(this, item, force = true)
                            runOnUiThread { result.success(r) }
                        }.start()
                    }
                    "autoPreview" -> {
                        val item = mapToJson(call.arguments as Map<*, *>)
                        Thread {
                            val r = TiyaAuto.composeText(this, item)
                            runOnUiThread { result.success(r) }
                        }.start()
                    }
                    // ---------------- programme
                    "agendaList" -> result.success(TiyaStore(this).agenda().map { jsonToMap(it) })
                    "agendaSave" -> {
                        val item = mapToJson(call.arguments as Map<*, *>)
                        val saved = TiyaStore(this).saveAgenda(item)
                        TiyaScheduler.schedule(this, TiyaScheduler.KIND_AGENDA, saved)
                        result.success(jsonToMap(saved))
                    }
                    "agendaDelete" -> {
                        val id = call.argument<String>("id") ?: ""
                        TiyaScheduler.cancel(this, TiyaScheduler.KIND_AGENDA, id)
                        TiyaStore(this).deleteAgenda(id)
                        result.success(true)
                    }
                    "requestNotifications" -> {
                        if (Build.VERSION.SDK_INT >= 33 &&
                            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 44)
                        TiyaScheduler.ensureChannels(this)
                        result.success(true)
                    }
                    "requestSms" -> {
                        if (checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED)
                            requestPermissions(arrayOf(Manifest.permission.SEND_SMS), 45)
                        result.success(true)
                    }
                    // ---------------- petit stockage clé/valeur (Agent IA)
                    "kvGet" -> result.success(
                        getSharedPreferences("tiya_kv", MODE_PRIVATE).getString(call.argument<String>("k") ?: "", null)
                    )
                    "kvSet" -> {
                        getSharedPreferences("tiya_kv", MODE_PRIVATE).edit()
                            .putString(call.argument<String>("k") ?: "", call.argument<String>("v")).apply()
                        result.success(true)
                    }
                    "requestContacts" -> {
                        val need = arrayOf(Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE)
                            .filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
                        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 43)
                        result.success(need.isEmpty())
                    }
                    "listVoices" -> result.success(svc?.listVoices() ?: emptyList<Map<String, Any>>())
                    "previewVoice" -> {
                        svc?.previewVoice(
                            call.argument<String>("name") ?: "",
                            (call.argument<Double>("rate") ?: 1.0).toFloat(),
                            (call.argument<Double>("pitch") ?: 1.0).toFloat()
                        )
                        result.success(svc != null)
                    }
                    "requestMic" -> {
                        if (!hasMic()) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 42)
                        result.success(hasMic())
                    }
                    "getSettings" -> result.success(settings.toMap())
                    "saveSettings" -> {
                        (call.arguments as? Map<*, *>)?.let { settings.fromMap(it) }
                        svc?.setBubbleEnabled(settings.bubbleEnabled)
                        result.success(true)
                    }
                    "startTask" -> {
                        val text = call.argument<String>("text") ?: ""
                        if (svc == null) result.error("NO_SERVICE", "Active d'abord Tiya dans l'accessibilité.", null)
                        else {
                            svc.agent.start(text, fromApp = true)
                            result.success(true)
                        }
                    }
                    "stopTask" -> {
                        svc?.agent?.stop(); result.success(true)
                    }
                    "reply" -> {
                        svc?.agent?.reply(call.argument<String>("text") ?: ""); result.success(true)
                    }
                    "confirm" -> {
                        svc?.agent?.confirm(call.argument<Boolean>("yes") ?: false); result.success(true)
                    }
                    "listen" -> {
                        if (svc == null) result.success(false)
                        else { svc.startListening("app"); result.success(true) }
                    }
                    "stopListening" -> {
                        svc?.stopListening(); result.success(true)
                    }
                    "history" -> result.success(TiyaBus.historySnapshot())
                    "clearHistory" -> {
                        TiyaBus.clearHistory(); result.success(true)
                    }
                    "testKey" -> {
                        Thread {
                            var r: Map<String, Any> = mapOf("ok" to false, "message" to "Erreur inconnue")
                            for (attempt in 1..3) {
                                r = try {
                                    val txt = LlmClient(settings).ask(
                                        "Tu es un test de connexion. Réponds uniquement en JSON.",
                                        "Réponds {\"ok\": true, \"message\": \"Bonjour, je suis prête\"}",
                                        null
                                    )
                                    mapOf("ok" to true, "message" to txt.take(200))
                                } catch (e: Exception) {
                                    mapOf("ok" to false, "message" to (e.message ?: e.toString()))
                                }
                                val msg = r["message"].toString()
                                val retry = r["ok"] == false && (msg.contains("surchargé") || msg.contains("(429)") || msg.contains("trop de temps"))
                                if (!retry) break
                                Thread.sleep(2500L * attempt)
                            }
                            val finalR = r
                            runOnUiThread { result.success(finalR) }
                        }.start()
                    }
                    "version" -> {
                        val (name, code) = TiyaUpdater.currentVersion(this)
                        result.success(mapOf("name" to name, "code" to code))
                    }
                    "checkUpdate" -> {
                        Thread {
                            val r = TiyaUpdater.check(this)
                            runOnUiThread { result.success(r) }
                        }.start()
                    }
                    "downloadUpdate" -> {
                        val url = call.argument<String>("url")
                        val version = call.argument<String>("version") ?: "maj"
                        when {
                            url.isNullOrBlank() -> result.error("NO_URL", "Lien de mise à jour manquant.", null)
                            !TiyaUpdater.canInstall(this) -> {
                                TiyaUpdater.openInstallPermission(this)
                                result.success("permission")
                            }
                            else -> {
                                TiyaUpdater.download(this, url, version)
                                result.success("started")
                            }
                        }
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Exception) {
                result.error("ERR", e.message, null)
            }
        }

        EventChannel(messenger, "tiya/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                busListener?.let { TiyaBus.removeListener(it) }
                val l: (Map<String, Any?>) -> Unit = { e -> events?.success(e) }
                busListener = l
                TiyaBus.addListener(l)
            }

            override fun onCancel(arguments: Any?) {
                busListener?.let { TiyaBus.removeListener(it) }
                busListener = null
            }
        })
    }

    override fun onDestroy() {
        busListener?.let { TiyaBus.removeListener(it) }
        busListener = null
        super.onDestroy()
    }

    private fun jsonToMap(o: org.json.JSONObject): Map<String, Any?> {
        val m = HashMap<String, Any?>()
        o.keys().forEach { k ->
            val v = o.opt(k)
            m[k] = when (v) {
                is org.json.JSONArray -> (0 until v.length()).map { v.opt(it) }
                org.json.JSONObject.NULL -> null
                else -> v
            }
        }
        return m
    }

    private fun mapToJson(m: Map<*, *>): org.json.JSONObject {
        val o = org.json.JSONObject()
        m.forEach { (k, v) ->
            o.put(k.toString(), when (v) {
                is List<*> -> org.json.JSONArray(v)
                null -> org.json.JSONObject.NULL
                else -> v
            })
        }
        return o
    }

    private fun hasMic(): Boolean =
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun isServiceEnabled(): Boolean {
        val expected = ComponentName(this, TiyaService::class.java).flattenToString()
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabled)
        while (splitter.hasNext()) {
            if (splitter.next().equals(expected, ignoreCase = true)) return true
        }
        return false
    }
}
