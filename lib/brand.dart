import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'logo_path.dart';

// ------------------------------------------------------------------ couleurs
class TiyaColors {
  static const black = Color(0xFF000000);
  static const night = Color(0xFF02040D);
  static const deep = Color(0xFF0A1E5C);
  static const blue = Color(0xFF2563EB);
  static const blueLight = Color(0xFF60A5FA);
  static const ice = Color(0xFFBFDBFE);
  static const text = Color(0xFFFFFFFF);
  static const muted = Color(0xFFA3ADC2);
  static const faint = Color(0xFF8B93AD);
  static const glass = Color(0x0DFFFFFF); // 5 %
  static const glassBorder = Color(0x1AFFFFFF); // 10 %
  static const green = Color(0xFF34D399);
  static const red = Color(0xFFDC2626);
}

/// Fond principal : noir qui descend vers le bleu.
const kHomeGradient = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [TiyaColors.black, TiyaColors.night, TiyaColors.deep, TiyaColors.blue],
  stops: [0.0, 0.42, 0.80, 1.0],
);

const kWorkGradient = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [TiyaColors.black, TiyaColors.night, Color(0xFF081846), Color(0xFF0F2F8F)],
  stops: [0.0, 0.5, 0.86, 1.0],
);

// ------------------------------------------------------------------ logo
Path? _cached;

/// Convertit le tracé SVG du logo (commandes M, L, C, Z absolues) en Path Flutter.
Path _logoPath() {
  if (_cached != null) return _cached!;
  final p = Path();
  final re = RegExp(r'([MLCZ])|(-?\d+(?:\.\d+)?)');
  String cmd = 'M';
  final nums = <double>[];
  void flush() {
    if (cmd == 'M' && nums.length >= 2) {
      p.moveTo(nums[0], nums[1]);
    } else if (cmd == 'L' && nums.length >= 2) {
      p.lineTo(nums[0], nums[1]);
    } else if (cmd == 'C' && nums.length >= 6) {
      p.cubicTo(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]);
    }
    nums.clear();
  }

  for (final m in re.allMatches(kTiyaLogoPath)) {
    final c = m.group(1);
    if (c != null) {
      flush();
      if (c == 'Z') {
        p.close();
      }
      cmd = c;
    } else {
      nums.add(double.parse(m.group(2)!));
      final need = cmd == 'C' ? 6 : 2;
      if (nums.length == need) flush();
    }
  }
  _cached = p;
  return p;
}

class _LogoPainter extends CustomPainter {
  final Color color;
  final Color? glow;
  final double glowSigma;
  _LogoPainter(this.color, this.glow, this.glowSigma);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide / 320.0;
    canvas.save();
    canvas.translate((size.width - 320 * s) / 2, (size.height - 320 * s) / 2);
    canvas.scale(s);
    canvas.translate(28, 0);
    final path = _logoPath();
    if (glow != null) {
      canvas.drawPath(
        path,
        Paint()
          ..color = glow!
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, glowSigma / s),
      );
    }
    canvas.drawPath(path, Paint()..color = color..isAntiAlias = true);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _LogoPainter old) =>
      old.color != color || old.glow != glow || old.glowSigma != glowSigma;
}

/// Le logo de Tiya (deux étoiles entrelacées).
class TiyaLogo extends StatelessWidget {
  final double size;
  final Color color;
  final Color? glow;
  final double glowSigma;
  const TiyaLogo({
    super.key,
    required this.size,
    this.color = Colors.white,
    this.glow,
    this.glowSigma = 6,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Logo Tiya',
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(painter: _LogoPainter(color, glow, glowSigma)),
      ),
    );
  }
}

// ------------------------------------------------------------------ orbe
/// L'orbe bleue lumineuse, avec le logo au centre. Elle « respire ».
class TiyaOrb extends StatefulWidget {
  final double size;
  final bool active;
  const TiyaOrb({super.key, required this.size, this.active = false});

  @override
  State<TiyaOrb> createState() => _TiyaOrbState();
}

class _TiyaOrbState extends State<TiyaOrb> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 3200))
      ..repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant TiyaOrb oldWidget) {
    super.didUpdateWidget(oldWidget);
    _c.duration = Duration(milliseconds: widget.active ? 1200 : 3200);
    if (_c.isAnimating) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = Curves.easeInOut.transform(_c.value);
        final scale = 1.0 + 0.045 * t;
        final glow = (widget.active ? 0.62 : 0.45) + 0.12 * t;
        return Transform.scale(
          scale: scale,
          child: Container(
            width: s,
            height: s,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const RadialGradient(
                center: Alignment(-0.32, -0.44),
                radius: 0.95,
                colors: [
                  Color(0xD9FFFFFF),
                  Color(0xE693C5FD),
                  Color(0xF23B82F6),
                  Color(0xF21E40AF),
                  Color(0xFF0A1646),
                  Color(0xFF040714),
                ],
                stops: [0.0, 0.09, 0.26, 0.48, 0.70, 1.0],
              ),
              boxShadow: [
                BoxShadow(
                  color: TiyaColors.blue.withValues(alpha: glow),
                  blurRadius: s * 0.47,
                  spreadRadius: s * 0.09,
                ),
              ],
            ),
            child: child,
          ),
        );
      },
      child: Center(
        child: TiyaLogo(
          size: s * 0.42,
          glow: const Color(0xE6DBEAFE),
          glowSigma: s * 0.05,
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ verre
/// Carte « verre » : fond translucide, bord fin, flou d'arrière-plan.
class Glass extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color color;
  final Color border;
  const Glass({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.radius = 24,
    this.color = TiyaColors.glass,
    this.border = TiyaColors.glassBorder,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: border),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Bouton rond.
class RoundButton extends StatelessWidget {
  final IconData icon;
  final Color background;
  final Color foreground;
  final VoidCallback? onTap;
  final double size;
  final String tooltip;
  final Color? borderColor;
  const RoundButton({
    super.key,
    required this.icon,
    required this.onTap,
    required this.tooltip,
    this.background = TiyaColors.glass,
    this.foreground = Colors.white,
    this.size = 46,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: background,
        shape: CircleBorder(
          side: borderColor == null ? BorderSide.none : BorderSide(color: borderColor!),
        ),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(icon, color: foreground, size: size * 0.44),
          ),
        ),
      ),
    );
  }
}
