import 'dart:async';

import 'package:flutter/material.dart';

import 'brand.dart';
import 'contacts_page.dart';
import 'native.dart';
import 'ui.dart';

/// Demande d'ouverture du formulaire avec un contact déjà choisi (depuis la page Contacts).
final ValueNotifier<Map<String, String>?> autoEditorRequest = ValueNotifier<Map<String, String>?>(null);

/// « Messages automatiques » : envoyés chaque jour à heure fixe, reformulés par l'IA si souhaité.
class AutoMessagesPage extends StatefulWidget {
  const AutoMessagesPage({super.key});

  @override
  State<AutoMessagesPage> createState() => _AutoMessagesPageState();
}

class _AutoMessagesPageState extends State<AutoMessagesPage> {
  List<Map<String, dynamic>> _items = [];
  bool _notif = true;
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    _load();
    _sub = Native.events().listen((e) {
      if (e['type'] == 'data_changed' || (e['text'] ?? '').toString().startsWith('📨')) _load();
    });
    autoEditorRequest.addListener(_onRequest);
  }

  @override
  void dispose() {
    _sub?.cancel();
    autoEditorRequest.removeListener(_onRequest);
    super.dispose();
  }

  void _onRequest() {
    final c = autoEditorRequest.value;
    if (c == null) return;
    autoEditorRequest.value = null;
    _edit(preset: c);
  }

  Future<void> _load() async {
    try {
      final items = await Native.autoList();
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

  Future<void> _edit({Map<String, dynamic>? item, Map<String, String>? preset}) async {
    if (!_notif) await Native.requestNotifications();
    if (!mounted) return;
    final changed = await showGlassSheet<bool>(context, AutoEditor(item: item, preset: preset));
    if (changed == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: AddButton(label: 'Nouveau message', onTap: () => _edit()),
      body: Container(
        decoration: const BoxDecoration(gradient: kPageGradient),
        child: SafeArea(
          child: Column(children: [
            const PageHeader(title: 'Messages auto', subtitle: 'Envoyés tout seuls, à l\'heure choisie'),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 6, 18, 110),
                  children: [
                    if (!_notif)
                      InfoBanner(
                        icon: Icons.notifications_active_outlined,
                        text: 'Autorise les notifications pour savoir quand un message est parti.',
                        action: 'Autoriser',
                        onAction: () async {
                          await Native.requestNotifications();
                          await Future.delayed(const Duration(seconds: 1));
                          _load();
                        },
                      ),
                    const InfoBanner(
                      icon: Icons.lock_open_rounded,
                      text: "WhatsApp : si ton téléphone est verrouillé à l'heure prévue, Tiya envoie le message "
                          'dès que tu le déverrouilles. Les SMS partent même téléphone verrouillé.',
                    ),
                    if (_items.isEmpty)
                      const Padding(
                        padding: EdgeInsets.only(top: 30),
                        child: Column(children: [
                          TiyaOrb(size: 84),
                          SizedBox(height: 24),
                          Text('Aucun message programmé', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                          SizedBox(height: 8),
                          Text(
                            "Exemple : chaque jour à 8 h, un message doux à ta femme, reformulé par l'IA pour qu'il ne soit jamais identique.\n\n"
                            "Ou dis à Tiya :\n« Chaque jour à 8h envoie à ma femme sur WhatsApp : Bonjour mon cœur »",
                            textAlign: TextAlign.center,
                            style: TextStyle(color: TiyaColors.muted, height: 1.45),
                          ),
                        ]),
                      ),
                    for (final it in _items) _AutoCard(item: it, onTap: () => _edit(item: it), onChanged: _load),
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

class _AutoCard extends StatefulWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;
  final VoidCallback onChanged;
  const _AutoCard({required this.item, required this.onTap, required this.onChanged});

  @override
  State<_AutoCard> createState() => _AutoCardState();
}

class _AutoCardState extends State<_AutoCard> {
  bool _sending = false;

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    final enabled = it['enabled'] != false;
    final channel = (it['channel'] ?? 'whatsapp').toString();
    final last = ((it['lastSent'] ?? 0) as num).toInt();
    final lastText = (it['lastText'] ?? '').toString();
    String lastLabel = '';
    if (last > 0) {
      final d = DateTime.fromMillisecondsSinceEpoch(last);
      lastLabel = 'Dernier envoi : ${frDate(d)} à ${hm(d.hour, d.minute)}';
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Opacity(
        opacity: enabled ? 1 : 0.55,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: widget.onTap,
            child: Glass(
              radius: 24,
              padding: const EdgeInsets.fromLTRB(16, 14, 10, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Icon(channel == 'sms' ? Icons.sms_outlined : Icons.chat_rounded, color: TiyaColors.ice, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text((it['name'] ?? '').toString(),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                  Text(hm((it['hour'] as num).toInt(), (it['minute'] as num).toInt()),
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  Switch(
                    value: enabled,
                    activeTrackColor: TiyaColors.blue,
                    onChanged: (v) async {
                      await Native.autoSave(Map<String, dynamic>.from(it)..['enabled'] = v);
                      widget.onChanged();
                    },
                  ),
                ]),
                Text(
                  '${repeatLabel(it)} · ${channel == 'sms' ? 'SMS' : channel == 'whatsapp_business' ? 'WhatsApp Business' : 'WhatsApp'}',
                  style: const TextStyle(fontSize: 12, color: TiyaColors.faint),
                ),
                const SizedBox(height: 10),
                Text('« ${(it['template'] ?? '').toString()} »',
                    maxLines: 3, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14, height: 1.35)),
                if (it['aiVary'] == true)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Row(children: [
                      Icon(Icons.auto_awesome, size: 15, color: TiyaColors.blueLight),
                      SizedBox(width: 6),
                      Text("Reformulé par l'IA chaque jour", style: TextStyle(fontSize: 12, color: TiyaColors.ice)),
                    ]),
                  ),
                if (lastLabel.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      lastText.isEmpty ? lastLabel : '$lastLabel\n« $lastText »',
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: TiyaColors.muted),
                    ),
                  ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: _sending
                        ? null
                        : () async {
                            setState(() => _sending = true);
                            final r = await Native.autoSendNow(it['id'].toString());
                            if (!context.mounted) return;
                            setState(() => _sending = false);
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r)));
                            widget.onChanged();
                          },
                    icon: _sending
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send_rounded, size: 18),
                    label: Text(_sending ? 'Envoi…' : 'Envoyer maintenant'),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Formulaire d'un message automatique.
class AutoEditor extends StatefulWidget {
  final Map<String, dynamic>? item;
  final Map<String, String>? preset;
  const AutoEditor({super.key, this.item, this.preset});

  @override
  State<AutoEditor> createState() => _AutoEditorState();
}

class _AutoEditorState extends State<AutoEditor> {
  final _template = TextEditingController();
  final _tone = TextEditingController(text: 'tendre et chaleureux');
  String _name = '';
  String _number = '';
  String _channel = 'whatsapp';
  int _hour = 8;
  int _minute = 0;
  bool _everyDay = true;
  Set<int> _days = {1, 2, 3, 4, 5};
  bool _aiVary = true;
  String? _preview;
  bool _previewing = false;

  @override
  void initState() {
    super.initState();
    final it = widget.item;
    if (it != null) {
      _name = (it['name'] ?? '').toString();
      _number = (it['number'] ?? '').toString();
      _channel = (it['channel'] ?? 'whatsapp').toString();
      _hour = (it['hour'] as num).toInt();
      _minute = (it['minute'] as num).toInt();
      final d = intList(it['days']);
      _everyDay = d.isEmpty || d.length == 7;
      if (!_everyDay) _days = d.toSet();
      _template.text = (it['template'] ?? '').toString();
      _aiVary = it['aiVary'] == true;
      final t = (it['tone'] ?? '').toString();
      if (t.isNotEmpty) _tone.text = t;
    } else if (widget.preset != null) {
      _name = widget.preset!['name'] ?? '';
      _number = widget.preset!['number'] ?? '';
    }
  }

  @override
  void dispose() {
    _template.dispose();
    _tone.dispose();
    super.dispose();
  }

  Map<String, dynamic> _collect() => {
        if (widget.item?['id'] != null) 'id': widget.item!['id'],
        if (widget.item?['lastSent'] != null) 'lastSent': widget.item!['lastSent'],
        if (widget.item?['lastText'] != null) 'lastText': widget.item!['lastText'],
        'name': _name,
        'number': _number,
        'channel': _channel,
        'hour': _hour,
        'minute': _minute,
        'days': _everyDay ? <int>[] : (_days.toList()..sort()),
        'template': _template.text.trim(),
        'aiVary': _aiVary,
        'tone': _tone.text.trim(),
        'enabled': widget.item?['enabled'] ?? true,
      };

  Future<void> _save() async {
    if (_number.isEmpty) {
      _snack('Choisis le destinataire.');
      return;
    }
    if (_template.text.trim().isEmpty) {
      _snack('Écris le message type.');
      return;
    }
    if (_channel == 'sms') await Native.requestSms();
    await Native.autoSave(_collect());
    if (mounted) Navigator.pop(context, true);
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Center(
          child: Container(
            width: 40, height: 4,
            decoration: BoxDecoration(color: const Color(0x33FFFFFF), borderRadius: BorderRadius.circular(2)),
          ),
        ),
        const SizedBox(height: 14),
        Text(widget.item == null ? 'Nouveau message automatique' : 'Modifier le message',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SectionLabel('Destinataire'),
        Material(
          color: const Color(0x0DFFFFFF),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: TiyaColors.glassBorder),
          ),
          child: ListTile(
            leading: const Icon(Icons.person_rounded, color: TiyaColors.ice),
            title: Text(_name.isEmpty ? 'Choisir un contact' : _name),
            subtitle: _number.isEmpty ? null : Text(_number, style: const TextStyle(color: TiyaColors.muted)),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () async {
              final c = await pickContact(context);
              if (c != null) {
                setState(() {
                  _name = (c['name'] ?? '').toString();
                  _number = (c['number'] ?? '').toString();
                });
              }
            },
          ),
        ),
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'whatsapp', label: Text('WhatsApp')),
            ButtonSegment(value: 'whatsapp_business', label: Text('WA Business')),
            ButtonSegment(value: 'sms', label: Text('SMS')),
          ],
          selected: {_channel},
          onSelectionChanged: (s) => setState(() => _channel = s.first),
        ),
        const SectionLabel('Quand ?'),
        TimeButton(
          hour: _hour,
          minute: _minute,
          onTap: () async {
            final t = await pickTime(context, TimeOfDay(hour: _hour, minute: _minute));
            if (t != null) setState(() { _hour = t.hour; _minute = t.minute; });
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _everyDay,
          activeTrackColor: TiyaColors.blue,
          onChanged: (v) => setState(() => _everyDay = v),
          title: const Text('Tous les jours'),
        ),
        if (!_everyDay) DayChips(selected: _days, onChanged: (s) => setState(() => _days = s)),
        const SectionLabel('Message type'),
        TextField(
          controller: _template,
          minLines: 3,
          maxLines: 6,
          decoration: fieldDecoration('Message', hint: 'Ex. Bonjour mon cœur, passe une belle journée ❤️'),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _aiVary,
          activeTrackColor: TiyaColors.blue,
          onChanged: (v) => setState(() => _aiVary = v),
          title: const Text("L'IA reformule le message chaque jour"),
          subtitle: const Text('Même sens, mots différents : il ne sera jamais identique.',
              style: TextStyle(color: TiyaColors.muted, fontSize: 12.5)),
        ),
        if (_aiVary) ...[
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in const ['tendre et chaleureux', 'romantique', 'amical', 'professionnel', 'drôle'])
              ChoiceChip(
                label: Text(t),
                selected: _tone.text == t,
                onSelected: (_) => setState(() => _tone.text = t),
              ),
          ]),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(46),
              side: const BorderSide(color: TiyaColors.glassBorder),
            ),
            onPressed: _previewing || _template.text.trim().isEmpty
                ? null
                : () async {
                    setState(() => _previewing = true);
                    final p = await Native.autoPreview(_collect());
                    if (mounted) setState(() { _preview = p; _previewing = false; });
                  },
            icon: _previewing
                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.auto_awesome),
            label: const Text("Voir l'exemple du jour"),
          ),
          if (_preview != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Glass(
                radius: 18,
                color: const Color(0x1F2563EB),
                border: const Color(0x5960A5FA),
                child: Text('« $_preview »', style: const TextStyle(height: 1.4)),
              ),
            ),
        ],
        const SizedBox(height: 16),
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
              await Native.autoDelete(widget.item!['id'].toString());
              if (context.mounted) Navigator.pop(context, true);
            },
            icon: const Icon(Icons.delete_outline_rounded),
            label: const Text('Supprimer'),
          ),
        ],
      ]),
    );
  }
}
