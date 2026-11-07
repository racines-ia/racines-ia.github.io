import 'dart:async';

import 'package:flutter/material.dart';

import 'brand.dart';
import 'native.dart';
import 'ui.dart';

/// « Mon programme » : emploi du temps avec rappels (notification + voix de Tiya).
class AgendaPage extends StatefulWidget {
  const AgendaPage({super.key});

  @override
  State<AgendaPage> createState() => _AgendaPageState();
}

class _AgendaPageState extends State<AgendaPage> {
  List<Map<String, dynamic>> _items = [];
  bool _notif = true;
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    _load();
    _sub = Native.events().listen((e) {
      if (e['type'] == 'data_changed') _load();
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final items = await Native.agendaList();
      final st = await Native.status();
      items.sort((a, b) => ((a['hour'] as num) * 60 + (a['minute'] as num))
          .compareTo((b['hour'] as num) * 60 + (b['minute'] as num)));
      if (!mounted) return;
      setState(() {
        _items = items;
        _notif = st['notifications'] == true;
      });
    } catch (_) {}
  }

  bool _isToday(Map<String, dynamic> it) {
    final now = DateTime.now();
    final date = (it['date'] ?? '').toString();
    if (date.isNotEmpty) return date == isoDate(now);
    final days = intList(it['days']);
    return days.isEmpty || days.contains(now.weekday);
  }

  Future<void> _edit([Map<String, dynamic>? item]) async {
    if (!_notif) await Native.requestNotifications();
    if (!mounted) return;
    final changed = await showGlassSheet<bool>(context, AgendaEditor(item: item));
    if (changed == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = _items.where(_isToday).toList();
    final others = _items.where((e) => !_isToday(e)).toList();
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: AddButton(label: 'Ajouter', onTap: () => _edit()),
      body: Container(
        decoration: const BoxDecoration(gradient: kPageGradient),
        child: SafeArea(
          child: Column(children: [
            PageHeader(title: 'Mon programme', subtitle: 'Aujourd\'hui, ${frDate(now)}'),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 6, 18, 110),
                  children: [
                    if (!_notif)
                      InfoBanner(
                        icon: Icons.notifications_active_outlined,
                        text: 'Autorise les notifications pour recevoir tes rappels.',
                        action: 'Autoriser',
                        onAction: () async {
                          await Native.requestNotifications();
                          await Future.delayed(const Duration(seconds: 1));
                          _load();
                        },
                      ),
                    if (_items.isEmpty) const _Empty(),
                    if (today.isNotEmpty) const SectionLabel("Aujourd'hui"),
                    for (final it in today) _AgendaCard(item: it, today: true, onTap: () => _edit(it), onToggle: _load),
                    if (others.isNotEmpty) const SectionLabel('Autres jours'),
                    for (final it in others) _AgendaCard(item: it, today: false, onTap: () => _edit(it), onToggle: _load),
                  ],
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(top: 50),
      child: Column(children: [
        TiyaOrb(size: 90),
        SizedBox(height: 26),
        Text('Ton programme est vide', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        SizedBox(height: 8),
        Text(
          "Ajoute tes activités : Tiya te prévient à l'heure, par une notification et à voix haute.\n\n"
          "Tu peux aussi dire à Tiya :\n« Rappelle-moi à 15 h d'appeler le directeur »\n« Chaque jour à 6 h rappelle-moi de prier »",
          textAlign: TextAlign.center,
          style: TextStyle(color: TiyaColors.muted, height: 1.45),
        ),
      ]),
    );
  }
}

class _AgendaCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final bool today;
  final VoidCallback onTap;
  final VoidCallback onToggle;
  const _AgendaCard({required this.item, required this.today, required this.onTap, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final h = (item['hour'] as num).toInt();
    final m = (item['minute'] as num).toInt();
    final enabled = item['enabled'] != false;
    final now = TimeOfDay.now();
    final past = today && (h * 60 + m) < (now.hour * 60 + now.minute);
    final before = ((item['remindBefore'] ?? 0) as num).toInt();
    final note = (item['note'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Opacity(
        opacity: enabled && !past ? 1 : 0.5,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: Glass(
              radius: 22,
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
              child: Row(children: [
                SizedBox(
                  width: 62,
                  child: Text(hm(h, m), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                ),
                Container(width: 1, height: 38, color: TiyaColors.glassBorder),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text((item['title'] ?? '').toString(),
                        style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)),
                    if (note.isNotEmpty)
                      Text(note, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12.5, color: TiyaColors.muted)),
                    const SizedBox(height: 3),
                    Text(
                      '${repeatLabel(item)}${before > 0 ? ' · rappel $before min avant' : ''}',
                      style: const TextStyle(fontSize: 12, color: TiyaColors.faint),
                    ),
                  ]),
                ),
                Switch(
                  value: enabled,
                  activeTrackColor: TiyaColors.blue,
                  onChanged: (v) async {
                    final copy = Map<String, dynamic>.from(item)..['enabled'] = v;
                    await Native.agendaSave(copy);
                    onToggle();
                  },
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Formulaire d'ajout / modification d'une activité.
class AgendaEditor extends StatefulWidget {
  final Map<String, dynamic>? item;
  const AgendaEditor({super.key, this.item});

  @override
  State<AgendaEditor> createState() => _AgendaEditorState();
}

class _AgendaEditorState extends State<AgendaEditor> {
  final _title = TextEditingController();
  final _note = TextEditingController();
  int _hour = 8;
  int _minute = 0;
  String _mode = 'daily'; // once | daily | days
  DateTime _date = DateTime.now();
  Set<int> _days = {1, 2, 3, 4, 5};
  int _before = 0;
  bool _speak = true;

  @override
  void initState() {
    super.initState();
    final it = widget.item;
    if (it != null) {
      _title.text = (it['title'] ?? '').toString();
      _note.text = (it['note'] ?? '').toString();
      _hour = (it['hour'] as num).toInt();
      _minute = (it['minute'] as num).toInt();
      _before = ((it['remindBefore'] ?? 0) as num).toInt();
      _speak = it['speak'] != false;
      final date = (it['date'] ?? '').toString();
      final days = intList(it['days']);
      if (date.isNotEmpty) {
        _mode = 'once';
        _date = parseIso(date) ?? DateTime.now();
      } else if (days.isNotEmpty && days.length < 7) {
        _mode = 'days';
        _days = days.toSet();
      }
    } else {
      final n = TimeOfDay.now();
      _hour = (n.hour + 1) % 24;
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Donne un titre à l'activité.")));
      return;
    }
    final item = <String, dynamic>{
      if (widget.item?['id'] != null) 'id': widget.item!['id'],
      'title': _title.text.trim(),
      'note': _note.text.trim(),
      'hour': _hour,
      'minute': _minute,
      'date': _mode == 'once' ? isoDate(_date) : '',
      'days': _mode == 'days' ? (_days.toList()..sort()) : <int>[],
      'remindBefore': _before,
      'speak': _speak,
      'enabled': true,
    };
    await Native.agendaSave(item);
    if (mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: const Color(0x33FFFFFF), borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 14),
          Text(widget.item == null ? 'Nouvelle activité' : "Modifier l'activité",
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          TextField(controller: _title, decoration: fieldDecoration('Quoi ?', hint: 'Ex. Réunion des enseignants')),
          const SizedBox(height: 12),
          TextField(controller: _note, decoration: fieldDecoration('Détail (optionnel)', hint: 'Ex. Salle des profs')),
          const SizedBox(height: 12),
          TimeButton(
            hour: _hour,
            minute: _minute,
            onTap: () async {
              final t = await pickTime(context, TimeOfDay(hour: _hour, minute: _minute));
              if (t != null) setState(() { _hour = t.hour; _minute = t.minute; });
            },
          ),
          const SectionLabel('Répétition'),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'once', label: Text('Une fois')),
              ButtonSegment(value: 'daily', label: Text('Chaque jour')),
              ButtonSegment(value: 'days', label: Text('Certains jours')),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() => _mode = s.first),
          ),
          const SizedBox(height: 12),
          if (_mode == 'once')
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(48),
                side: const BorderSide(color: TiyaColors.glassBorder),
              ),
              onPressed: () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime.now().subtract(const Duration(days: 1)),
                  lastDate: DateTime.now().add(const Duration(days: 730)),
                );
                if (d != null) setState(() => _date = d);
              },
              icon: const Icon(Icons.event_rounded),
              label: Text(frDate(_date)),
            ),
          if (_mode == 'days') DayChips(selected: _days, onChanged: (s) => setState(() => _days = s)),
          const SectionLabel('Me prévenir'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final b in const [0, 5, 10, 15, 30, 60])
              ChoiceChip(
                label: Text(b == 0 ? "À l'heure" : '$b min avant'),
                selected: _before == b,
                onSelected: (_) => setState(() => _before = b),
              ),
          ]),
          const SizedBox(height: 6),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _speak,
            activeTrackColor: TiyaColors.blue,
            onChanged: (v) => setState(() => _speak = v),
            title: const Text('Tiya me le dit à voix haute'),
          ),
          const SizedBox(height: 10),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: const Color(0xFF0B1640),
              minimumSize: const Size.fromHeight(52),
            ),
            onPressed: _save,
            child: const Text('Enregistrer', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
          if (widget.item != null) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: const Color(0xFFF87171)),
              onPressed: () async {
                await Native.agendaDelete(widget.item!['id'].toString());
                if (context.mounted) Navigator.pop(context, true);
              },
              icon: const Icon(Icons.delete_outline_rounded),
              label: const Text('Supprimer'),
            ),
          ],
        ],
      ),
    );
  }
}
