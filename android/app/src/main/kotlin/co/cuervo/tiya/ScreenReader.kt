package co.cuervo.tiya

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo

/** Un élément visible à l'écran, numéroté pour que l'IA puisse le désigner. */
class ScreenElement(
    val id: Int,
    val node: AccessibilityNodeInfo,
    val bounds: Rect,
    val line: String,
)

class ScreenSnapshot(
    val packageName: String,
    val elements: List<ScreenElement>,
    val text: String,
) {
    fun byId(id: Int): ScreenElement? = elements.firstOrNull { it.id == id }
}

object ScreenReader {
    private const val MAX_ELEMENTS = 220
    private const val MAX_TEXT = 90

    fun read(root: AccessibilityNodeInfo?, screenW: Int, screenH: Int): ScreenSnapshot {
        if (root == null) {
            return ScreenSnapshot("", emptyList(), "(écran illisible — peut-être verrouillé ou une app protégée)")
        }
        val pkg = root.packageName?.toString() ?: ""
        val out = ArrayList<ScreenElement>()
        walk(root, 0, out, screenW, screenH)
        val sb = StringBuilder()
        sb.append("App au premier plan : ").append(pkg).append('\n')
        sb.append("Taille de l'écran : ").append(screenW).append('x').append(screenH).append(" px\n")
        sb.append("Éléments (id, type, texte, actions possibles, centre x,y) :\n")
        if (out.isEmpty()) sb.append("(aucun élément lisible)\n")
        out.forEach { sb.append(it.line).append('\n') }
        if (out.size >= MAX_ELEMENTS) sb.append("… (liste tronquée, faites défiler pour voir plus)\n")
        return ScreenSnapshot(pkg, out, sb.toString())
    }

    private fun walk(
        node: AccessibilityNodeInfo,
        depth: Int,
        out: MutableList<ScreenElement>,
        w: Int,
        h: Int,
    ) {
        if (out.size >= MAX_ELEMENTS || depth > 40) return
        if (!node.isVisibleToUser) return

        val r = Rect()
        node.getBoundsInScreen(r)
        val onScreen = r.width() > 0 && r.height() > 0 && r.right > 0 && r.bottom > 0 && r.left < w && r.top < h

        if (onScreen && isInteresting(node)) {
            val id = out.size + 1
            out.add(ScreenElement(id, node, Rect(r), describe(id, node, r)))
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            walk(child, depth + 1, out, w, h)
        }
    }

    private fun isInteresting(n: AccessibilityNodeInfo): Boolean {
        val hasText = !n.text.isNullOrBlank() || !n.contentDescription.isNullOrBlank()
        return hasText || n.isClickable || n.isLongClickable || n.isEditable ||
            n.isScrollable || n.isCheckable
    }

    private fun shortClass(n: AccessibilityNodeInfo): String {
        val c = n.className?.toString() ?: "View"
        val s = c.substringAfterLast('.')
        return when {
            n.isEditable -> "Champ"
            s.contains("Button", true) -> "Bouton"
            s.contains("Image", true) -> "Image"
            s.contains("CheckBox", true) || s.contains("Switch", true) -> "Case"
            s.contains("TextView", true) -> "Texte"
            s.contains("RecyclerView", true) || s.contains("ListView", true) || s.contains("ScrollView", true) -> "Liste"
            else -> s
        }
    }

    private fun clip(s: CharSequence?): String {
        if (s == null) return ""
        val t = s.toString().replace('\n', ' ').trim()
        return if (t.length > MAX_TEXT) t.substring(0, MAX_TEXT) + "…" else t
    }

    private fun describe(id: Int, n: AccessibilityNodeInfo, r: Rect): String {
        val sb = StringBuilder()
        sb.append('[').append(id).append("] ").append(shortClass(n))
        val text = clip(n.text)
        val desc = clip(n.contentDescription)
        if (n.isPassword) sb.append(" (mot de passe)")
        if (text.isNotEmpty()) sb.append(" \"").append(if (n.isPassword) "•••" else text).append('"')
        if (desc.isNotEmpty() && desc != text) sb.append(" desc=\"").append(desc).append('"')
        val hint = if (android.os.Build.VERSION.SDK_INT >= 26) clip(n.hintText) else ""
        if (hint.isNotEmpty() && hint != text) sb.append(" indice=\"").append(hint).append('"')
        val flags = ArrayList<String>()
        if (n.isClickable) flags.add("clic")
        if (n.isLongClickable) flags.add("appui-long")
        if (n.isEditable) flags.add("écrire")
        if (n.isScrollable) flags.add("défiler")
        if (n.isCheckable) flags.add(if (n.isChecked) "coché" else "non-coché")
        if (n.isSelected) flags.add("sélectionné")
        if (n.isFocused) flags.add("focus")
        if (!n.isEnabled) flags.add("désactivé")
        if (flags.isNotEmpty()) sb.append(" {").append(flags.joinToString(",")).append('}')
        sb.append(" @").append(r.centerX()).append(',').append(r.centerY())
        return sb.toString()
    }
}
