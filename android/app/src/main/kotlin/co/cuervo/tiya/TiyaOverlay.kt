package co.cuervo.tiya

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/**
 * Petite bulle flottante visible par-dessus toutes les apps :
 * statut de Tiya, micro, bouton stop, et questions / confirmations.
 */
class TiyaOverlay(private val service: TiyaService) {

    private val wm = service.getSystemService(WindowManager::class.java)
    private val root = LinearLayout(service)
    private val bar = LinearLayout(service)
    private val logo = ImageView(service)
    private val status = TextView(service)
    private val stop = TextView(service)
    private val panel = LinearLayout(service)
    private val question = TextView(service)
    private val btnRow = LinearLayout(service)
    private val btnYes = TextView(service)
    private val btnNo = TextView(service)
    private var shown = false
    private var listening = false

    private val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = dp(8)
        y = dp(160)
    }

    private fun dp(v: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), service.resources.displayMetrics
    ).toInt()

    private fun rounded(color: Int, radius: Int): GradientDrawable =
        GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }

    init {
        root.orientation = LinearLayout.VERTICAL

        bar.orientation = LinearLayout.HORIZONTAL
        bar.gravity = Gravity.CENTER_VERTICAL
        bar.background = null
        bar.setPadding(dp(4), dp(4), dp(4), dp(4))

        logo.setImageResource(R.drawable.tiya_bubble)
        logo.scaleType = ImageView.ScaleType.FIT_CENTER
        logo.contentDescription = "Tiya"
        bar.addView(logo, LinearLayout.LayoutParams(dp(52), dp(52)))
        logo.elevation = dp(6).toFloat()
        logo.outlineProvider = android.view.ViewOutlineProvider.BACKGROUND
        logo.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xFF040714.toInt()) }

        status.setTextColor(Color.WHITE)
        status.textSize = 13f
        status.maxLines = 2
        status.maxWidth = dp(200)
        status.setPadding(dp(10), 0, dp(6), 0)
        status.visibility = View.GONE
        bar.addView(status)


        styleCircle(stop, "■", 0xFFDC2626.toInt())
        stop.visibility = View.GONE
        bar.addView(stop, LinearLayout.LayoutParams(dp(36), dp(36)).apply { leftMargin = dp(6) })

        root.addView(bar, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        panel.orientation = LinearLayout.VERTICAL
        panel.background = GradientDrawable().apply { setColor(0xF20A0F24.toInt()); cornerRadius = dp(20).toFloat(); setStroke(dp(1), 0x6660A5FA) }
        panel.setPadding(dp(14), dp(12), dp(14), dp(12))
        panel.visibility = View.GONE
        question.setTextColor(Color.WHITE)
        question.textSize = 14f
        question.maxWidth = dp(280)
        panel.addView(question)

        btnRow.orientation = LinearLayout.HORIZONTAL
        btnRow.setPadding(0, dp(10), 0, 0)
        stylePill(btnYes, "Oui", 0xFF2563EB.toInt())
        stylePill(btnNo, "Non", 0xFF1C2033.toInt())
        btnRow.addView(btnYes)
        btnRow.addView(btnNo, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { leftMargin = dp(10) })
        panel.addView(btnRow)

        root.addView(panel, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(8) })

        stop.setOnClickListener { service.agent.stop() }
        btnYes.setOnClickListener { onYes() }
        btnNo.setOnClickListener { onNo() }
        setupDrag()
    }

    private var panelIsConfirm = false

    private fun onYes() {
        if (panelIsConfirm) service.agent.confirm(true)
        else service.startListening("bubble")   // « Répondre » à voix haute
        if (panelIsConfirm) hidePanel()
    }

    private fun onNo() {
        if (panelIsConfirm) service.agent.confirm(false)
        else service.openTiyaApp()              // « Écrire » dans l'app
        hidePanel()
    }

    private fun styleCircle(v: TextView, text: String, color: Int) {
        v.text = text
        v.gravity = Gravity.CENTER
        v.textSize = 15f
        v.setTextColor(Color.WHITE)
        v.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }
    }

    private fun stylePill(v: TextView, text: String, color: Int) {
        v.text = text
        v.setTextColor(Color.WHITE)
        v.textSize = 14f
        v.typeface = Typeface.DEFAULT_BOLD
        v.setPadding(dp(18), dp(8), dp(18), dp(8))
        v.background = rounded(color, 20)
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupDrag() {
        var startX = 0
        var startY = 0
        var touchX = 0f
        var touchY = 0f
        var moved = false
        var longDone = false
        val longPress = Runnable {
            if (!moved) {
                longDone = true
                hideByUser()
            }
        }
        logo.setOnTouchListener { v, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x; startY = params.y
                    touchX = e.rawX; touchY = e.rawY
                    moved = false
                    longDone = false
                    v.postDelayed(longPress, 700)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - touchX).toInt()
                    val dy = (e.rawY - touchY).toInt()
                    if (abs(dx) > dp(6) || abs(dy) > dp(6)) {
                        if (!moved) v.removeCallbacks(longPress)
                        moved = true
                    }
                    params.x = startX + dx
                    params.y = startY + dy
                    if (shown) runCatching { wm.updateViewLayout(root, params) }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.removeCallbacks(longPress)
                    if (!moved && !longDone && e.action == MotionEvent.ACTION_UP) {
                        // Un toucher = Tiya t'écoute (ou arrête d'écouter).
                        if (listening) service.stopListening() else service.startListening("bubble")
                    }
                    true
                }
                else -> false
            }
        }
    }

    /** Appui long sur la bulle : on la retire (réactivable dans Tiya › Réglages). */
    private fun hideByUser() {
        TiyaSettings(service).bubbleEnabled = false
        hide()
        android.widget.Toast.makeText(
            service,
            "Bulle Tiya masquée. Réactive-la dans Tiya › Réglages.",
            android.widget.Toast.LENGTH_LONG
        ).show()
    }

    private fun refreshBar() {
        val expanded = status.visibility == View.VISIBLE || stop.visibility == View.VISIBLE
        bar.background = if (expanded) GradientDrawable().apply {
            setColor(0xEB0A0C18.toInt()); cornerRadius = dp(32).toFloat(); setStroke(dp(1), 0x593B82F6)
        } else null
    }

    fun show() {
        if (shown) return
        runCatching { wm.addView(root, params); shown = true }
    }

    fun hide() {
        if (!shown) return
        runCatching { wm.removeView(root) }
        shown = false
    }

    fun setHidden(hidden: Boolean) {
        root.visibility = if (hidden) View.INVISIBLE else View.VISIBLE
    }

    fun setStatus(text: String?, running: Boolean) {
        if (text.isNullOrBlank()) {
            status.visibility = View.GONE
        } else {
            status.text = text
            status.visibility = View.VISIBLE
        }
        stop.visibility = if (running) View.VISIBLE else View.GONE
        refreshBar()
    }

    fun setListening(on: Boolean) {
        listening = on
        logo.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(0xFF040714.toInt())
            if (on) setStroke(dp(3), 0xFFF87171.toInt())
        }
        logo.setPadding(if (on) dp(3) else 0, if (on) dp(3) else 0, if (on) dp(3) else 0, if (on) dp(3) else 0)
        logo.animate().scaleX(if (on) 1.12f else 1f).scaleY(if (on) 1.12f else 1f).setDuration(180).start()
        if (on) {
            status.text = "Je t'écoute…"
            status.visibility = View.VISIBLE
        } else if (!service.agent.running) {
            status.visibility = View.GONE
        }
        refreshBar()
    }

    fun showPanel(text: String, confirm: Boolean, yesLabel: String = "Oui", noLabel: String = "Non") {
        panelIsConfirm = confirm
        question.text = text
        btnYes.text = if (confirm) yesLabel else "🎤 Répondre"
        btnNo.text = if (confirm) noLabel else "✍ Écrire"
        panel.visibility = View.VISIBLE
    }

    fun hidePanel() {
        panel.visibility = View.GONE
    }
}
