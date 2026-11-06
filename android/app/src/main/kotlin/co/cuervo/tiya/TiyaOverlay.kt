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
    private val mic = TextView(service)
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
        bar.background = GradientDrawable().apply { setColor(0xEB0A0C18.toInt()); cornerRadius = dp(30).toFloat(); setStroke(dp(1), 0x593B82F6) }
        bar.setPadding(dp(6), dp(6), dp(6), dp(6))
        bar.elevation = dp(6).toFloat()

        logo.setImageResource(R.drawable.tiya_bubble)
        logo.scaleType = ImageView.ScaleType.FIT_CENTER
        logo.contentDescription = "Tiya"
        bar.addView(logo, LinearLayout.LayoutParams(dp(44), dp(44)))

        status.setTextColor(Color.WHITE)
        status.textSize = 13f
        status.maxLines = 2
        status.maxWidth = dp(200)
        status.setPadding(dp(10), 0, dp(6), 0)
        status.visibility = View.GONE
        bar.addView(status)

        styleCircle(mic, "🎤", 0xFF1C2033.toInt())
        bar.addView(mic, LinearLayout.LayoutParams(dp(36), dp(36)).apply { leftMargin = dp(6) })

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

        mic.setOnClickListener {
            if (listening) service.stopListening() else service.startListening("bubble")
        }
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
        logo.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x; startY = params.y
                    touchX = e.rawX; touchY = e.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - touchX).toInt()
                    val dy = (e.rawY - touchY).toInt()
                    if (abs(dx) > dp(4) || abs(dy) > dp(4)) moved = true
                    params.x = startX + dx
                    params.y = startY + dy
                    if (shown) runCatching { wm.updateViewLayout(root, params) }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) service.openTiyaApp()
                    true
                }
                else -> false
            }
        }
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
    }

    fun setListening(on: Boolean) {
        listening = on
        styleCircle(mic, if (on) "●" else "🎤", if (on) 0xFFDC2626.toInt() else 0xFF1C2033.toInt())
        if (on) {
            status.text = "Je t'écoute…"
            status.visibility = View.VISIBLE
        } else if (!service.agent.running) {
            status.visibility = View.GONE
        }
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
