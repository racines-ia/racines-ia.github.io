import 'package:flutter/material.dart';

import 'auto_messages_page.dart';
import 'brand.dart';
import 'native.dart';
import 'ui.dart';

/// Contacts du téléphone, connus de Tiya, avec leurs surnoms (« ma femme »…).
class ContactsPage extends StatefulWidget {
  const ContactsPage({super.key});

  @override
  State<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends State<ContactsPage> {
  List<Map<String, dynamic>> _all = [];
  bool _loading = true;
  bool _allowed = true;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final st = await Native.status();
      final allowed = st['contacts'] == true;
      final list = allowed ? await Native.contacts() : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _allowed = allowed;
        _all = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    final q = plain(_search.text.trim());
    if (q.isEmpty) return _all;
    return _all.where((c) {
      final aliases = ((c['aliases'] as List?) ?? []).join(' ');
      return plain('${c['name']} ${c['number']} $aliases').contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final list = _filtered;
    final withAlias = _all.where((c) => ((c['aliases'] as List?) ?? []).isNotEmpty).toList();
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: const BoxDecoration(gradient: kPageGradient),
        child: SafeArea(
          child: Column(children: [
            PageHeader(
              title: 'Contacts',
              subtitle: _allowed ? '${_all.length} contacts connus de Tiya' : 'Accès aux contacts non autorisé',
            ),
            if (_allowed)
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 6, 18, 6),
                child: TextField(
                  controller: _search,
                  decoration: fieldDecoration('Rechercher un nom, un numéro, un surnom').copyWith(
                    prefixIcon: const Icon(Icons.search_rounded),
                  ),
                ),
              ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : !_allowed
                      ? ListView(padding: const EdgeInsets.all(18), children: [
                          InfoBanner(
                            icon: Icons.contacts_rounded,
                            text: 'Autorise Tiya à lire tes contacts : elle reconnaîtra chaque nom que tu cites.',
                            action: 'Autoriser',
                            onAction: () async {
                              await Native.requestContacts();
                              await Future.delayed(const Duration(milliseconds: 1500));
                              _load();
                            },
                          ),
                        ])
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 30),
                            itemCount: list.length + 1,
                            itemBuilder: (ctx, i) {
                              if (i == 0) {
                                if (_search.text.isNotEmpty || withAlias.isNotEmpty) return const SizedBox.shrink();
                                return const Padding(
                                  padding: EdgeInsets.fromLTRB(6, 4, 6, 10),
                                  child: InfoBanner(
                                    icon: Icons.favorite_border_rounded,
                                    text: 'Astuce : touche un contact pour lui donner un surnom, comme « ma femme ». '
                                        'Dis ensuite à Tiya : « Écris à ma femme sur WhatsApp : … »',
                                  ),
                                );
                              }
                              final c = list[i - 1];
                              return _ContactTile(contact: c, onChanged: _load);
                            },
                          ),
                        ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  final Map<String, dynamic> contact;
  final VoidCallback onChanged;
  const _ContactTile({required this.contact, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final name = (contact['name'] ?? '').toString();
    final aliases = ((contact['aliases'] as List?) ?? []).map((e) => e.toString()).toList();
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      leading: CircleAvatar(
        backgroundColor: const Color(0x332563EB),
        foregroundColor: TiyaColors.ice,
        child: Text(initial, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text((contact['number'] ?? '').toString(), style: const TextStyle(color: TiyaColors.muted)),
      trailing: aliases.isEmpty
          ? null
          : Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: TiyaColors.blueLight),
              ),
              child: Text(aliases.first, style: const TextStyle(fontSize: 12, color: TiyaColors.ice)),
            ),
      onTap: () async {
        final changed = await showGlassSheet<bool>(context, ContactSheet(contact: contact));
        if (changed == true) onChanged();
      },
    );
  }
}

/// Fiche d'un contact : surnom + actions rapides.
class ContactSheet extends StatefulWidget {
  final Map<String, dynamic> contact;
  const ContactSheet({super.key, required this.contact});

  @override
  State<ContactSheet> createState() => _ContactSheetState();
}

class _ContactSheetState extends State<ContactSheet> {
  final _alias = TextEditingController();
  String? _old;

  @override
  void initState() {
    super.initState();
    final a = ((widget.contact['aliases'] as List?) ?? []);
    if (a.isNotEmpty) {
      _old = a.first.toString();
      _alias.text = _old!;
    }
  }

  @override
  void dispose() {
    _alias.dispose();
    super.dispose();
  }

  String get _name => (widget.contact['name'] ?? '').toString();
  String get _number => (widget.contact['number'] ?? '').toString();

  void _toTiya(String text) {
    Navigator.pop(context, false);
    tiyaPrefill.value = text;
    tiyaTabRequest.value = 0;
  }

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
        const SizedBox(height: 16),
        Text(_name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        Text(_number, style: const TextStyle(color: TiyaColors.muted)),
        const SectionLabel('Surnom pour Tiya'),
        TextField(
          controller: _alias,
          decoration: fieldDecoration('Surnom', hint: 'Ex. ma femme, mon amour, le directeur'),
        ),
        const SizedBox(height: 10),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: const Color(0xFF0B1640),
            minimumSize: const Size.fromHeight(50),
          ),
          onPressed: () async {
            await Native.setAlias(name: _name, number: _number, alias: _alias.text.trim(), old: _old);
            if (context.mounted) Navigator.pop(context, true);
          },
          child: const Text('Enregistrer le surnom', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        const SectionLabel('Actions rapides'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          ActionChip(
            avatar: const Icon(Icons.call_rounded, size: 18),
            label: const Text('Appeler'),
            onPressed: () {
              Navigator.pop(context, false);
              Native.startTask('Appelle $_name');
            },
          ),
          ActionChip(
            avatar: const Icon(Icons.chat_rounded, size: 18),
            label: const Text('Écrire sur WhatsApp'),
            onPressed: () => _toTiya('Écris à $_name sur WhatsApp : '),
          ),
          ActionChip(
            avatar: const Icon(Icons.mic_rounded, size: 18),
            label: const Text('Vocal WhatsApp'),
            onPressed: () {
              Navigator.pop(context, false);
              Native.startTask('Envoie un vocal à $_name sur WhatsApp');
            },
          ),
          ActionChip(
            avatar: const Icon(Icons.schedule_send_rounded, size: 18),
            label: const Text('Message automatique'),
            onPressed: () async {
              final nav = Navigator.of(context);
              nav.pop(false);
              tiyaTabRequest.value = 2;
              await Future.delayed(const Duration(milliseconds: 300));
              autoEditorRequest.value = {'name': _name, 'number': _number};
            },
          ),
        ]),
      ]),
    );
  }
}

/// Choisir un contact (pour un message automatique).
Future<Map<String, dynamic>?> pickContact(BuildContext context) {
  return showGlassSheet<Map<String, dynamic>>(context, const _ContactPicker());
}

class _ContactPicker extends StatefulWidget {
  const _ContactPicker();

  @override
  State<_ContactPicker> createState() => _ContactPickerState();
}

class _ContactPickerState extends State<_ContactPicker> {
  List<Map<String, dynamic>> _all = [];
  final _q = TextEditingController();
  bool _allowed = true;

  @override
  void initState() {
    super.initState();
    _q.addListener(() => setState(() {}));
    () async {
      final st = await Native.status();
      if (st['contacts'] != true) {
        await Native.requestContacts();
        await Future.delayed(const Duration(milliseconds: 1500));
      }
      final st2 = await Native.status();
      final list = st2['contacts'] == true ? await Native.contacts() : <Map<String, dynamic>>[];
      if (mounted) setState(() { _all = list; _allowed = st2['contacts'] == true; });
    }();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = plain(_q.text.trim());
    final list = q.isEmpty
        ? _all
        : _all.where((c) => plain('${c['name']} ${((c['aliases'] as List?) ?? []).join(' ')}').contains(q)).toList();
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
          child: TextField(
            controller: _q,
            autofocus: true,
            decoration: fieldDecoration('Chercher un contact').copyWith(prefixIcon: const Icon(Icons.search_rounded)),
          ),
        ),
        if (!_allowed)
          const Padding(
            padding: EdgeInsets.all(18),
            child: Text("Autorise l'accès aux contacts pour choisir un destinataire."),
          ),
        Expanded(
          child: ListView.builder(
            itemCount: list.length,
            itemBuilder: (ctx, i) {
              final c = list[i];
              final aliases = ((c['aliases'] as List?) ?? []);
              return ListTile(
                title: Text((c['name'] ?? '').toString()),
                subtitle: Text(
                  '${c['number']}${aliases.isNotEmpty ? ' · ${aliases.first}' : ''}',
                  style: const TextStyle(color: TiyaColors.muted),
                ),
                onTap: () => Navigator.pop(context, c),
              );
            },
          ),
        ),
      ]),
    );
  }
}
