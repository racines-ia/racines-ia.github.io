import 'package:flutter/material.dart';

import 'brand.dart';

/// Fond commun des pages secondaires.
const kPageGradient = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [Colors.black, TiyaColors.night, Color(0xFF071232)],
);

/// Notification partagée : texte à placer dans la saisie de Tiya (depuis une autre page).
final ValueNotifier<String?> tiyaPrefill = ValueNotifier<String?>(null);

/// Changement d'onglet demandé par une page.
final ValueNotifier<int?> tiyaTabRequest = ValueNotifier<int?>(null);

String two(int v) => v.toString().padLeft(2, '0');
String hm(int h, int m) => '${two(h)}:${two(m)}';

const kDayLetters = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const kDayNames = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const kMonths = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

String frDate(DateTime d) => '${kDayNames[d.weekday - 1]} ${d.day} ${kMonths[d.month - 1]}';

String isoDate(DateTime d) => '${d.year}-${two(d.month)}-${two(d.day)}';

DateTime? parseIso(String s) {
  final p = s.split('-');
  if (p.length != 3) return null;
  final y = int.tryParse(p[0]), m = int.tryParse(p[1]), d = int.tryParse(p[2]);
  if (y == null || m == null || d == null) return null;
  return DateTime(y, m, d);
}

List<int> intList(dynamic v) => ((v as List?) ?? []).map((e) => (e as num).toInt()).toList();

/// Libellé de répétition : « Chaque jour », « Lun, Mer, Ven », « Une fois · samedi 7 novembre ».
String repeatLabel(Map<String, dynamic> item) {
  final date = (item['date'] ?? '').toString();
  if (date.isNotEmpty) {
    final d = parseIso(date);
    return d == null ? 'Une fois' : 'Une fois · ${frDate(d)}';
  }
  final days = intList(item['days'])..sort();
  if (days.isEmpty || days.length == 7) return 'Chaque jour';
  if (days.length == 5 && !days.contains(6) && !days.contains(7)) return 'Du lundi au vendredi';
  if (days.length == 2 && days.contains(6) && days.contains(7)) return 'Le week-end';
  return days.map((d) => kDayNames[d - 1].substring(0, 3)).join(', ');
}

/// Sans accents, en minuscules (pour la recherche).
String plain(String s) {
  const from = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ';
  const to = 'aaaaaaceeeeiiiinooooouuuuyyoa';
  final b = StringBuffer();
  for (final ch in s.toLowerCase().split('')) {
    final i = from.indexOf(ch);
    b.write(i >= 0 ? to[i] : ch);
  }
  return b.toString();
}

class PageHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  const PageHeader({super.key, required this.title, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(subtitle!, style: const TextStyle(fontSize: 13.5, color: TiyaColors.muted)),
                ),
            ]),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  final String text;
  const SectionLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
        child: Text(text.toUpperCase(),
            style: const TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.6, color: TiyaColors.faint)),
      );
}

/// Bandeau d'information / d'autorisation.
class InfoBanner extends StatelessWidget {
  final IconData icon;
  final String text;
  final String? action;
  final VoidCallback? onAction;
  const InfoBanner({super.key, required this.icon, required this.text, this.action, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Glass(
        radius: 18,
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        color: const Color(0x1F2563EB),
        border: const Color(0x5960A5FA),
        child: Row(children: [
          Icon(icon, color: TiyaColors.ice, size: 20),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, height: 1.35))),
          if (action != null) ...[
            const SizedBox(width: 8),
            TextButton(onPressed: onAction, child: Text(action!)),
          ],
        ]),
      ),
    );
  }
}

/// Bouton principal blanc (« + Ajouter »).
class AddButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const AddButton({super.key, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      heroTag: label,
      backgroundColor: Colors.white,
      foregroundColor: const Color(0xFF0B1640),
      onPressed: onTap,
      icon: const Icon(Icons.add_rounded),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
    );
  }
}

/// Sélecteur des jours (L M M J V S D).
class DayChips extends StatelessWidget {
  final Set<int> selected;
  final ValueChanged<Set<int>> onChanged;
  const DayChips({super.key, required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        for (var i = 1; i <= 7; i++)
          Semantics(
            button: true,
            selected: selected.contains(i),
            label: kDayNames[i - 1],
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () {
                final s = {...selected};
                s.contains(i) ? s.remove(i) : s.add(i);
                onChanged(s);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected.contains(i) ? TiyaColors.blue : const Color(0x14FFFFFF),
                  border: Border.all(color: selected.contains(i) ? TiyaColors.blueLight : TiyaColors.glassBorder),
                ),
                child: Text(kDayLetters[i - 1], style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ),
      ],
    );
  }
}

InputDecoration fieldDecoration(String label, {String? hint}) => InputDecoration(
      labelText: label,
      hintText: hint,
      filled: true,
      fillColor: const Color(0x0DFFFFFF),
      labelStyle: const TextStyle(color: TiyaColors.muted),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: TiyaColors.glassBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: TiyaColors.blueLight),
      ),
    );

/// Feuille du bas « verre » pour les formulaires.
Future<T?> showGlassSheet<T>(BuildContext context, Widget child) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: const Color(0xFF070B1C),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: child,
    ),
  );
}

/// Choix de l'heure avec le thème de Tiya.
Future<TimeOfDay?> pickTime(BuildContext context, TimeOfDay initial) {
  return showTimePicker(
    context: context,
    initialTime: initial,
    helpText: "Choisis l'heure",
    builder: (ctx, child) => MediaQuery(
      data: MediaQuery.of(ctx).copyWith(alwaysUse24HourFormat: true),
      child: child!,
    ),
  );
}

class TimeButton extends StatelessWidget {
  final int hour;
  final int minute;
  final VoidCallback onTap;
  const TimeButton({super.key, required this.hour, required this.minute, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0x0DFFFFFF),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: TiyaColors.glassBorder),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            const Icon(Icons.schedule_rounded, color: TiyaColors.ice),
            const SizedBox(width: 12),
            Text(hm(hour, minute), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
            const Spacer(),
            const Text('Modifier', style: TextStyle(color: TiyaColors.blueLight)),
          ]),
        ),
      ),
    );
  }
}
