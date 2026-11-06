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
                    "requestMic" -> {
                        if (!hasMic()) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 42)
                        result.success(hasMic())
                    }
                    "getSettings" -> result.success(settings.toMap())
                    "saveSettings" -> {
                        (call.arguments as? Map<*, *>)?.let { settings.fromMap(it) }
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
                            val r = try {
                                val txt = LlmClient(settings).ask(
                                    "Tu es un test de connexion. Réponds uniquement en JSON.",
                                    "Réponds {\"ok\": true, \"message\": \"Bonjour, je suis prête\"}",
                                    null
                                )
                                mapOf("ok" to true, "message" to txt.take(200))
                            } catch (e: Exception) {
                                mapOf("ok" to false, "message" to (e.message ?: e.toString()))
                            }
                            runOnUiThread { result.success(r) }
                        }.start()
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
