import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'agent_api.dart';
import 'brand.dart';
import 'native.dart';
import 'ui.dart';

/// Onglet « Agent IA » : l'assistant WhatsApp qui répond aux clients à partir de ta base.
class AgentPage extends StatefulWidget {
  const AgentPage({super.key});

  @override
  State<AgentPage> createState() => _AgentPageState();
}

class _AgentPageState extends State<AgentPage> {
  bool _loading = true;
  bool _registered = false;
  Map<String, dynamic>? _space;
  Map<String, dynamic> _stats = {};
  int _section = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final reg = await AgentApi.isRegistered();
    setState(() => _registered = reg);
    if (reg) await _refresh();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _refresh() async {
    try {
      final r = await AgentApi.getSpace();
      if (!mounted) return;
      setState(() {
        _space = Map<String, dynamic>.from(r['space'] as Map);
        _stats = Map<String, dynamic>.from((r['stats'] ?? {}) as Map);
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: const BoxDecoration(gradient: kPageGradient),
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : !_registered
                  ? _Setup(onDone: () {
                      setState(() { _registered = true; _loading = true; });
                      _init();
                    })
                  : _dashboard(),
        ),
      ),
    );
  }

  Widget _dashboard() {
    final s = _space;
    final waOk = s != null && (s['wa_phone_number_id'] ?? '').toString().isNotEmpty && s['has_wa_token'] == true;
    final unread = (_stats['unread'] ?? 0) as num;
    return Column(children: [
      PageHeader(
        title: 'Agent IA',
        subtitle: s == null ? null : '${s['name']} · +${s['phone']}',
        trailing: RoundButton(
          icon: Icons.tune_rounded,
          tooltip: "Réglages de l'agent",
          size: 42,
          borderColor: TiyaColors.glassBorder,
          onTap: s == null
              ? null
              : () async {
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => AgentSettingsPage(space: s)));
                  _refresh();
                },
        ),
      ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: InfoBanner(icon: Icons.wifi_off_rounded, text: _error!, action: 'Réessayer', onAction: _refresh),
        ),
      if (s != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 4, 18, 8),
          child: Glass(
            radius: 20,
            padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
            child: Row(children: [
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: !waOk ? const Color(0xFFFBBF24) : (s['agent_enabled'] == true ? TiyaColors.green : const Color(0xFF8B93AD)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  !waOk
                      ? 'WhatsApp pas encore connecté'
                      : (s['agent_enabled'] == true ? "L'agent répond à tes clients" : 'Agent en pause'),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              if (!waOk)
                TextButton(
                  onPressed: () async {
                    await Navigator.push(context, MaterialPageRoute(builder: (_) => AgentSettingsPage(space: s, openWhatsapp: true)));
                    _refresh();
                  },
                  child: const Text('Connecter'),
                )
              else
                Switch(
                  value: s['agent_enabled'] == true,
                  activeTrackColor: TiyaColors.blue,
                  onChanged: (v) async {
                    await AgentApi.updateSpace({'agent_enabled': v});
                    _refresh();
                  },
                ),
            ]),
          ),
        ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18),
        child: SegmentedButton<int>(
          showSelectedIcon: false,
          segments: [
            ButtonSegment(value: 0, label: Text(unread > 0 ? 'Discussions ($unread)' : 'Discussions')),
            const ButtonSegment(value: 1, label: Text('Base')),
            const ButtonSegment(value: 2, label: Text('Clients')),
            const ButtonSegment(value: 3, label: Text('Campagnes')),
          ],
          selected: {_section},
          onSelectionChanged: (v) => setState(() => _section = v.first),
        ),
      ),
      const SizedBox(height: 6),
      Expanded(
        child: IndexedStack(index: _section, children: [
          _Conversations(onChanged: _refresh),
          _Knowledge(onChanged: _refresh),
          const _Clients(),
          const _Campaigns(),
        ]),
      ),
    ]);
  }
}

// ======================================================================= inscription

class _Setup extends StatefulWidget {
  final VoidCallback onDone;
  const _Setup({required this.onDone});

  @override
  State<_Setup> createState() => _SetupState();
}

class _SetupState extends State<_Setup> {
  final _phone = TextEditingController();
  final _name = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _go() async {
    if (_phone.text.replaceAll(RegExp(r'\D'), '').length < 9) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Entre ton numéro WhatsApp complet.')));
      return;
    }
    setState(() => _busy = true);
    try {
      await AgentApi.register(
        phone: _phone.text.trim(),
        name: _name.text.trim().isEmpty ? 'Mon activité' : _name.text.trim(),
      );
      widget.onDone();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.fromLTRB(22, 40, 22, 30), children: [
      const Center(child: TiyaOrb(size: 110)),
      const SizedBox(height: 34),
      const Text('Ton agent IA WhatsApp', textAlign: TextAlign.center,
          style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
      const SizedBox(height: 10),
      const Text(
        "Il répond à tes clients 24 h/24 à partir de tes informations, et envoie tes campagnes "
        'avec un message rédigé pour chaque client.',
        textAlign: TextAlign.center,
        style: TextStyle(color: TiyaColors.muted, height: 1.45),
      ),
      const SizedBox(height: 30),
      TextField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        decoration: fieldDecoration('Ton numéro WhatsApp', hint: 'Ex. 0812345678').copyWith(
          prefixIcon: const Icon(Icons.phone_rounded),
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _name,
        decoration: fieldDecoration("Nom de ton activité (optionnel)", hint: 'Ex. PolePole Beach'),
      ),
      const SizedBox(height: 20),
      FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF0B1640),
          minimumSize: const Size.fromHeight(54),
        ),
        onPressed: _busy ? null : _go,
        child: _busy
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : const Text('Activer mon agent', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
      ),
    ]);
  }
}

// ======================================================================= discussions

class _Conversations extends StatefulWidget {
  final VoidCallback onChanged;
  const _Conversations({required this.onChanged});

  @override
  State<_Conversations> createState() => _ConversationsState();
}

class _ConversationsState extends State<_Conversations> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final items = await AgentApi.conversations();
      if (mounted) setState(() { _items = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 6, 12, 30), children: [
        if (_items.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 50),
            child: Text(
              "Aucune discussion pour l'instant.\nDès qu'un client écrit sur ton WhatsApp, elle apparaît ici.",
              textAlign: TextAlign.center,
              style: TextStyle(color: TiyaColors.muted, height: 1.45),
            ),
          ),
        for (final c in _items)
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            leading: CircleAvatar(
              backgroundColor: const Color(0x332563EB),
              foregroundColor: TiyaColors.ice,
              child: Text(_initial(c)),
            ),
            title: Text(_title(c), style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text((c['last_text'] ?? '').toString(),
                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: TiyaColors.muted)),
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              _ModeChip(human: c['mode'] == 'human'),
              if (((c['unread'] ?? 0) as num) > 0)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: TiyaColors.blue, borderRadius: BorderRadius.circular(10)),
                  child: Text('${c['unread']}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                ),
            ]),
            onTap: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => ConversationScreen(conv: c)));
              _load();
              widget.onChanged();
            },
          ),
      ]),
    );
  }
}

String _title(Map<String, dynamic> c) {
  final n = (c['client_name'] ?? '').toString();
  return n.isEmpty ? '+${c['client_phone']}' : n;
}

String _initial(Map<String, dynamic> c) {
  final t = _title(c).replaceAll('+', '');
  return t.isEmpty ? '?' : t.characters.first.toUpperCase();
}

class _ModeChip extends StatelessWidget {
  final bool human;
  const _ModeChip({required this.human});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: human ? const Color(0xFFFBBF24) : TiyaColors.blueLight),
      ),
      child: Text(human ? 'Toi' : 'IA',
          style: TextStyle(fontSize: 11, color: human ? const Color(0xFFFDE68A) : TiyaColors.ice)),
    );
  }
}

/// Une discussion avec un client.
class ConversationScreen extends StatefulWidget {
  final Map<String, dynamic> conv;
  const ConversationScreen({super.key, required this.conv});

  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  List<Map<String, dynamic>> _msgs = [];
  late String _mode;
  final _input = TextEditingController();
  final _scroll = ScrollController();
  Timer? _timer;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _mode = (widget.conv['mode'] ?? 'ai').toString();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await AgentApi.messages(widget.conv['id'].toString());
      if (!mounted) return;
      final before = _msgs.length;
      setState(() {
        _msgs = ((r['items'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _mode = ((r['conversation'] as Map?)?['mode'] ?? _mode).toString();
      });
      if (_msgs.length != before) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
        });
      }
    } catch (_) {}
  }

  Future<void> _send() async {
    final t = _input.text.trim();
    if (t.isEmpty) return;
    setState(() => _sending = true);
    try {
      final r = await AgentApi.send(widget.conv['id'].toString(), t);
      if (r['ok'] != true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Non envoyé : ${r['error'] ?? ''}')));
      }
      _input.clear();
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final human = _mode == 'human';
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: const Color(0xFF050814),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_title(widget.conv), style: const TextStyle(fontSize: 17)),
          Text('+${widget.conv['client_phone']}', style: const TextStyle(fontSize: 12, color: TiyaColors.muted)),
        ]),
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: kPageGradient),
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
            child: Glass(
              radius: 18,
              padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
              child: Row(children: [
                Icon(human ? Icons.person_rounded : Icons.auto_awesome,
                    color: human ? const Color(0xFFFDE68A) : TiyaColors.ice, size: 18),
                const SizedBox(width: 10),
                Expanded(child: Text(human ? 'Tu réponds toi-même' : "L'IA répond à ce client")),
                Switch(
                  value: !human,
                  activeTrackColor: TiyaColors.blue,
                  onChanged: (v) async {
                    await AgentApi.setMode(widget.conv['id'].toString(), v ? 'ai' : 'human');
                    setState(() => _mode = v ? 'ai' : 'human');
                  },
                ),
              ]),
            ),
          ),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              itemCount: _msgs.length,
              itemBuilder: (ctx, i) => _Bubble(m: _msgs[i]),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 4,
                    decoration: fieldDecoration('Répondre toi-même…'),
                  ),
                ),
                const SizedBox(width: 8),
                RoundButton(
                  icon: Icons.send_rounded,
                  tooltip: 'Envoyer',
                  size: 50,
                  background: Colors.white,
                  foreground: const Color(0xFF0B1640),
                  onTap: _sending ? null : _send,
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final Map<String, dynamic> m;
  const _Bubble({required this.m});

  @override
  Widget build(BuildContext context) {
    final inbound = m['direction'] == 'in';
    final author = (m['author'] ?? '').toString();
    final status = (m['status'] ?? 'ok').toString();
    final label = inbound ? null : (author == 'ai' ? 'IA' : author == 'campaign' ? 'Campagne' : 'Toi');
    final color = inbound
        ? const Color(0x14FFFFFF)
        : author == 'human'
            ? const Color(0x33FBBF24)
            : const Color(0x332563EB);
    final d = DateTime.tryParse((m['created_at'] ?? '').toString())?.toLocal();
    return Align(
      alignment: inbound ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: EdgeInsets.only(top: 4, bottom: 4, left: inbound ? 0 : 48, right: inbound ? 48 : 0),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SelectableText((m['text'] ?? '').toString(), style: const TextStyle(height: 1.35)),
          const SizedBox(height: 3),
          Text(
            [if (label != null) label, if (d != null) hm(d.hour, d.minute), if (status != 'ok') '⚠ $status'].join(' · '),
            style: TextStyle(fontSize: 10.5, color: status != 'ok' ? const Color(0xFFFCA5A5) : TiyaColors.faint),
          ),
        ]),
      ),
    );
  }
}

// ======================================================================= base de connaissances

class _Knowledge extends StatefulWidget {
  final VoidCallback onChanged;
  const _Knowledge({required this.onChanged});

  @override
  State<_Knowledge> createState() => _KnowledgeState();
}

class _KnowledgeState extends State<_Knowledge> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await AgentApi.kbList();
      if (mounted) setState(() { _items = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit([Map<String, dynamic>? it]) async {
    final ok = await showGlassSheet<bool>(context, _KbEditor(item: it));
    if (ok == true) { _load(); widget.onChanged(); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Stack(children: [
      RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(18, 6, 18, 120), children: [
          const InfoBanner(
            icon: Icons.menu_book_rounded,
            text: "C'est la mémoire de ton agent : il ne répond qu'avec ces informations. "
                'Ajoute une fiche par sujet (offres et prix, horaires, adresse, paiement, FAQ…).',
          ),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(46),
              side: const BorderSide(color: TiyaColors.glassBorder),
            ),
            onPressed: () => showGlassSheet(context, const _AgentTester()),
            icon: const Icon(Icons.forum_outlined),
            label: const Text("Tester l'agent"),
          ),
          const SizedBox(height: 10),
          for (final it in _items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => _edit(it),
                  child: Glass(
                    radius: 20,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text((it['title'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
                      const SizedBox(height: 4),
                      Text((it['content'] ?? '').toString(), maxLines: 4, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: TiyaColors.muted, height: 1.35)),
                    ]),
                  ),
                ),
              ),
            ),
        ]),
      ),
      Positioned(right: 16, bottom: 16, child: AddButton(label: 'Ajouter une fiche', onTap: () => _edit())),
    ]);
  }
}

class _KbEditor extends StatefulWidget {
  final Map<String, dynamic>? item;
  const _KbEditor({this.item});

  @override
  State<_KbEditor> createState() => _KbEditorState();
}

class _KbEditorState extends State<_KbEditor> {
  late final _title = TextEditingController(text: (widget.item?['title'] ?? '').toString());
  late final _content = TextEditingController(text: (widget.item?['content'] ?? '').toString());

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetBody(title: widget.item == null ? 'Nouvelle fiche' : 'Modifier la fiche', children: [
      TextField(controller: _title, decoration: fieldDecoration('Sujet', hint: 'Ex. Nos offres et prix')),
      const SizedBox(height: 12),
      TextField(
        controller: _content,
        minLines: 6,
        maxLines: 14,
        decoration: fieldDecoration('Informations',
            hint: 'Écris tout ce que l\'agent doit savoir sur ce sujet : prix, conditions, détails…'),
      ),
      const SizedBox(height: 16),
      _PrimaryButton(label: 'Enregistrer', onTap: () async {
        if (_title.text.trim().isEmpty || _content.text.trim().isEmpty) return;
        await AgentApi.kbSave({
          if (widget.item?['id'] != null) 'id': widget.item!['id'],
          'title': _title.text.trim(),
          'content': _content.text.trim(),
        });
        if (context.mounted) Navigator.pop(context, true);
      }),
      if (widget.item != null)
        _DeleteButton(onTap: () async {
          await AgentApi.kbDelete(widget.item!['id'].toString());
          if (context.mounted) Navigator.pop(context, true);
        }),
    ]);
  }
}

/// Simulateur : poser une question comme un client.
class _AgentTester extends StatefulWidget {
  const _AgentTester();

  @override
  State<_AgentTester> createState() => _AgentTesterState();
}

class _AgentTesterState extends State<_AgentTester> {
  final _q = TextEditingController();
  final List<(String, String)> _log = [];
  bool _busy = false;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    final q = _q.text.trim();
    if (q.isEmpty) return;
    setState(() { _busy = true; _log.add(('client', q)); _q.clear(); });
    try {
      final r = await AgentApi.askTest(q);
      final handoff = r['handoff'] == true ? '\n\n(→ transmis à toi : l\'info manque dans la base)' : '';
      setState(() => _log.add(('agent', '${r['reply']}$handoff')));
    } catch (e) {
      setState(() => _log.add(('agent', 'Erreur : $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.7,
      child: Column(children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 18, 20, 4),
          child: Text("Tester l'agent", style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        ),
        const Text('Écris comme un client. Rien n\'est envoyé sur WhatsApp.',
            style: TextStyle(color: TiyaColors.muted, fontSize: 12.5)),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(14), children: [
            for (final (who, t) in _log)
              Align(
                alignment: who == 'client' ? Alignment.centerLeft : Alignment.centerRight,
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  padding: const EdgeInsets.all(12),
                  constraints: const BoxConstraints(maxWidth: 300),
                  decoration: BoxDecoration(
                    color: who == 'client' ? const Color(0x14FFFFFF) : const Color(0x332563EB),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(t, style: const TextStyle(height: 1.35)),
                ),
              ),
            if (_busy) const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          child: Row(children: [
            Expanded(child: TextField(controller: _q, decoration: fieldDecoration('Question du client'), onSubmitted: (_) => _ask())),
            const SizedBox(width: 8),
            RoundButton(icon: Icons.send_rounded, tooltip: 'Envoyer', size: 50,
                background: Colors.white, foreground: const Color(0xFF0B1640), onTap: _busy ? null : _ask),
          ]),
        ),
      ]),
    );
  }
}

// ======================================================================= clients

class _Clients extends StatefulWidget {
  const _Clients();

  @override
  State<_Clients> createState() => _ClientsState();
}

class _ClientsState extends State<_Clients> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await AgentApi.clients();
      if (mounted) setState(() { _items = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit([Map<String, dynamic>? it]) async {
    final ok = await showGlassSheet<bool>(context, _ClientEditor(item: it));
    if (ok == true) _load();
  }

  Future<void> _import() async {
    final picked = await showGlassSheet<List<Map<String, dynamic>>>(context, const _MultiContactPicker());
    if (picked == null || picked.isEmpty) return;
    final n = await AgentApi.clientsImport(
        picked.map((c) => {'name': c['name'], 'phone': c['number']}).toList());
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$n client(s) importé(s).')));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Stack(children: [
      RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(12, 6, 12, 120), children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(46),
                side: const BorderSide(color: TiyaColors.glassBorder),
              ),
              onPressed: _import,
              icon: const Icon(Icons.contacts_rounded),
              label: const Text('Importer depuis mes contacts'),
            ),
          ),
          const SizedBox(height: 6),
          if (_items.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 40),
              child: Text('Aucun client. Importe-les depuis tes contacts ou ajoute-les.',
                  textAlign: TextAlign.center, style: TextStyle(color: TiyaColors.muted)),
            ),
          for (final c in _items)
            ListTile(
              leading: CircleAvatar(
                backgroundColor: const Color(0x332563EB),
                foregroundColor: TiyaColors.ice,
                child: Text(((c['name'] ?? '?').toString().isEmpty ? '?' : (c['name'] as String).characters.first).toUpperCase()),
              ),
              title: Text((c['name'] ?? '').toString().isEmpty ? '+${c['phone']}' : c['name'].toString()),
              subtitle: Text(
                '+${c['phone']}${(c['notes'] ?? '').toString().isNotEmpty ? ' · ${c['notes']}' : ''}',
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: TiyaColors.muted),
              ),
              onTap: () => _edit(c),
            ),
        ]),
      ),
      Positioned(right: 16, bottom: 16, child: AddButton(label: 'Ajouter', onTap: () => _edit())),
    ]);
  }
}

class _ClientEditor extends StatefulWidget {
  final Map<String, dynamic>? item;
  const _ClientEditor({this.item});

  @override
  State<_ClientEditor> createState() => _ClientEditorState();
}

class _ClientEditorState extends State<_ClientEditor> {
  late final _name = TextEditingController(text: (widget.item?['name'] ?? '').toString());
  late final _phone = TextEditingController(text: widget.item == null ? '' : '+${widget.item!['phone']}');
  late final _notes = TextEditingController(text: (widget.item?['notes'] ?? '').toString());

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetBody(title: widget.item == null ? 'Nouveau client' : 'Modifier le client', children: [
      TextField(controller: _name, decoration: fieldDecoration('Nom')),
      const SizedBox(height: 12),
      TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: fieldDecoration('Numéro WhatsApp', hint: '0812345678')),
      const SizedBox(height: 12),
      TextField(
        controller: _notes,
        minLines: 2,
        maxLines: 4,
        decoration: fieldDecoration('Notes (optionnel)', hint: "Ex. client fidèle, aime l'offre VIP"),
      ),
      const SizedBox(height: 16),
      _PrimaryButton(label: 'Enregistrer', onTap: () async {
        try {
          await AgentApi.clientSave({
            if (widget.item?['id'] != null) 'id': widget.item!['id'],
            'name': _name.text.trim(),
            'phone': _phone.text.trim(),
            'notes': _notes.text.trim(),
          });
          if (context.mounted) Navigator.pop(context, true);
        } catch (e) {
          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
        }
      }),
      if (widget.item != null)
        _DeleteButton(onTap: () async {
          await AgentApi.clientDelete(widget.item!['id'].toString());
          if (context.mounted) Navigator.pop(context, true);
        }),
    ]);
  }
}

class _MultiContactPicker extends StatefulWidget {
  const _MultiContactPicker();

  @override
  State<_MultiContactPicker> createState() => _MultiContactPickerState();
}

class _MultiContactPickerState extends State<_MultiContactPicker> {
  List<Map<String, dynamic>> _all = [];
  final Set<int> _sel = {};
  final _q = TextEditingController();

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
      final list = await Native.contacts();
      if (mounted) setState(() => _all = list);
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
    final idx = [for (var i = 0; i < _all.length; i++) if (q.isEmpty || plain('${_all[i]['name']}').contains(q)) i];
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.8,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
          child: TextField(controller: _q, decoration: fieldDecoration('Chercher').copyWith(prefixIcon: const Icon(Icons.search_rounded))),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: idx.length,
            itemBuilder: (ctx, k) {
              final i = idx[k];
              final c = _all[i];
              return CheckboxListTile(
                value: _sel.contains(i),
                onChanged: (v) => setState(() => v == true ? _sel.add(i) : _sel.remove(i)),
                title: Text((c['name'] ?? '').toString()),
                subtitle: Text((c['number'] ?? '').toString(), style: const TextStyle(color: TiyaColors.muted)),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: _PrimaryButton(
            label: 'Importer (${_sel.length})',
            onTap: () => Navigator.pop(context, [for (final i in _sel) _all[i]]),
          ),
        ),
      ]),
    );
  }
}

// ======================================================================= campagnes

class _Campaigns extends StatefulWidget {
  const _Campaigns();

  @override
  State<_Campaigns> createState() => _CampaignsState();
}

class _CampaignsState extends State<_Campaigns> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_items.any((c) => c['status'] == 'running')) _load();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final items = await AgentApi.campaigns();
      if (mounted) setState(() { _items = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Stack(children: [
      RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(18, 6, 18, 120), children: [
          const InfoBanner(
            icon: Icons.campaign_outlined,
            text: "Tu donnes l'objectif, l'IA rédige un message différent pour chaque client, "
                'envoyé avec un délai (20 s minimum) entre deux clients.',
          ),
          for (final c in _items) _CampaignCard(c: c, onChanged: _load),
        ]),
      ),
      Positioned(
        right: 16,
        bottom: 16,
        child: AddButton(label: 'Nouvelle campagne', onTap: () async {
          final ok = await showGlassSheet<bool>(context, const _CampaignEditor());
          if (ok == true) _load();
        }),
      ),
    ]);
  }
}

class _CampaignCard extends StatelessWidget {
  final Map<String, dynamic> c;
  final VoidCallback onChanged;
  const _CampaignCard({required this.c, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final total = ((c['total'] ?? 0) as num).toInt();
    final sent = ((c['sent'] ?? 0) as num).toInt();
    final failed = ((c['failed'] ?? 0) as num).toInt();
    final status = (c['status'] ?? '').toString();
    final label = status == 'running' ? 'En cours' : status == 'done' ? 'Terminée' : 'Annulée';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: () => showGlassSheet(context, _CampaignDetail(c: c, onChanged: onChanged)),
          child: Glass(
            radius: 22,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text((c['title'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5))),
                Text(label, style: TextStyle(color: status == 'running' ? TiyaColors.blueLight : TiyaColors.muted, fontSize: 12.5)),
              ]),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: total == 0 ? 0 : (sent + failed) / total,
                  minHeight: 5,
                  backgroundColor: const Color(0x22FFFFFF),
                  color: TiyaColors.blueLight,
                ),
              ),
              const SizedBox(height: 6),
              Text('$sent envoyé(s) sur $total${failed > 0 ? ' · $failed échec(s)' : ''} · toutes les ${c['delay_seconds']} s',
                  style: const TextStyle(fontSize: 12, color: TiyaColors.muted)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _CampaignDetail extends StatefulWidget {
  final Map<String, dynamic> c;
  final VoidCallback onChanged;
  const _CampaignDetail({required this.c, required this.onChanged});

  @override
  State<_CampaignDetail> createState() => _CampaignDetailState();
}

class _CampaignDetailState extends State<_CampaignDetail> {
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    AgentApi.campaignItems(widget.c['id'].toString()).then((v) {
      if (mounted) setState(() => _items = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
          child: Text((widget.c['title'] ?? '').toString(), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text('Objectif : ${widget.c['goal']}', style: const TextStyle(color: TiyaColors.muted)),
        ),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(14), children: [
            for (final it in _items)
              ListTile(
                dense: true,
                leading: Icon(
                  it['status'] == 'sent'
                      ? Icons.check_circle_rounded
                      : it['status'] == 'failed'
                          ? Icons.error_rounded
                          : Icons.schedule_rounded,
                  color: it['status'] == 'sent'
                      ? TiyaColors.green
                      : it['status'] == 'failed'
                          ? const Color(0xFFF87171)
                          : TiyaColors.muted,
                ),
                title: Text((it['client_name'] ?? '').toString().isEmpty ? '+${it['phone']}' : it['client_name'].toString()),
                subtitle: Text(
                  (it['error'] ?? '').toString().isNotEmpty ? it['error'].toString() : (it['text'] ?? '').toString(),
                  style: const TextStyle(color: TiyaColors.muted),
                ),
              ),
          ]),
        ),
        if (widget.c['status'] == 'running')
          Padding(
            padding: const EdgeInsets.all(16),
            child: _DeleteButton(label: 'Arrêter la campagne', onTap: () async {
              await AgentApi.campaignCancel(widget.c['id'].toString());
              widget.onChanged();
              if (context.mounted) Navigator.pop(context);
            }),
          ),
      ]),
    );
  }
}

class _CampaignEditor extends StatefulWidget {
  const _CampaignEditor();

  @override
  State<_CampaignEditor> createState() => _CampaignEditorState();
}

class _CampaignEditorState extends State<_CampaignEditor> {
  final _title = TextEditingController();
  final _goal = TextEditingController();
  final _template = TextEditingController();
  double _delay = 20;
  bool _all = true;
  List<Map<String, dynamic>> _clients = [];
  final Set<String> _sel = {};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    AgentApi.clients().then((v) {
      if (mounted) setState(() => _clients = v);
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _goal.dispose();
    _template.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = _all ? _clients.length : _sel.length;
    final minutes = (count * _delay / 60).ceil();
    return _SheetBody(title: 'Nouvelle campagne', children: [
      TextField(controller: _title, decoration: fieldDecoration('Nom de la campagne', hint: 'Ex. Promo du week-end')),
      const SizedBox(height: 12),
      TextField(
        controller: _goal,
        minLines: 3,
        maxLines: 6,
        decoration: fieldDecoration("Objectif : que doit dire l'agent ?",
            hint: "Ex. Annoncer la soirée de samedi à PolePole, entrée gratuite avant 22 h, inviter à réserver"),
      ),
      const SectionLabel('Clients'),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _all,
        activeTrackColor: TiyaColors.blue,
        onChanged: (v) => setState(() => _all = v),
        title: Text('Tous mes clients (${_clients.length})'),
      ),
      if (!_all)
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 220),
          child: ListView(shrinkWrap: true, children: [
            for (final c in _clients)
              CheckboxListTile(
                dense: true,
                value: _sel.contains(c['id']),
                onChanged: (v) => setState(() => v == true ? _sel.add(c['id'].toString()) : _sel.remove(c['id'])),
                title: Text((c['name'] ?? '').toString().isEmpty ? '+${c['phone']}' : c['name'].toString()),
              ),
          ]),
        ),
      const SectionLabel('Délai entre deux clients'),
      Row(children: [
        Expanded(
          child: Slider(
            value: _delay,
            min: 20,
            max: 120,
            divisions: 10,
            activeColor: TiyaColors.blueLight,
            label: '${_delay.round()} s',
            onChanged: (v) => setState(() => _delay = v),
          ),
        ),
        Text('${_delay.round()} s', style: const TextStyle(fontWeight: FontWeight.w700)),
      ]),
      Text('$count message(s) · environ $minutes min', style: const TextStyle(color: TiyaColors.muted, fontSize: 12.5)),
      const SectionLabel('Modèle WhatsApp (pour les nouveaux contacts)'),
      TextField(controller: _template, decoration: fieldDecoration('Nom du modèle approuvé (optionnel)', hint: 'Ex. tiya_message')),
      const Padding(
        padding: EdgeInsets.only(top: 6),
        child: Text(
          "WhatsApp n'autorise un message libre qu'aux clients qui t'ont écrit dans les dernières 24 h. "
          'Pour les autres, crée dans Meta un modèle dont le texte est : « Bonjour {{1}}, {{2}} » '
          "({{1}} = prénom, {{2}} = message de l'IA), puis écris son nom ici.",
          style: TextStyle(color: TiyaColors.faint, fontSize: 12, height: 1.35),
        ),
      ),
      const SizedBox(height: 16),
      _PrimaryButton(
        label: _busy ? 'Lancement…' : 'Lancer la campagne',
        onTap: _busy
            ? null
            : () async {
                if (_goal.text.trim().isEmpty || count == 0) return;
                setState(() => _busy = true);
                try {
                  await AgentApi.campaignCreate({
                    'title': _title.text.trim(),
                    'goal': _goal.text.trim(),
                    'delay_seconds': _delay.round(),
                    'template_name': _template.text.trim(),
                    'template_lang': 'fr',
                    'client_ids': _all ? <String>[] : _sel.toList(),
                  });
                  if (context.mounted) Navigator.pop(context, true);
                } catch (e) {
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                } finally {
                  if (mounted) setState(() => _busy = false);
                }
              },
      ),
    ]);
  }
}

// ======================================================================= réglages de l'agent

class AgentSettingsPage extends StatefulWidget {
  final Map<String, dynamic> space;
  final bool openWhatsapp;
  const AgentSettingsPage({super.key, required this.space, this.openWhatsapp = false});

  @override
  State<AgentSettingsPage> createState() => _AgentSettingsPageState();
}

class _AgentSettingsPageState extends State<AgentSettingsPage> {
  late final _name = TextEditingController(text: (widget.space['name'] ?? '').toString());
  late final _phone = TextEditingController(text: '+${widget.space['phone']}');
  late final _business = TextEditingController(text: (widget.space['business'] ?? '').toString());
  late final _tone = TextEditingController(text: (widget.space['tone'] ?? '').toString());
  late final _phoneId = TextEditingController(text: (widget.space['wa_phone_number_id'] ?? '').toString());
  final _token = TextEditingController();
  final _secret = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _phone, _business, _tone, _phoneId, _token, _secret]) {
      c.dispose();
    }
    super.dispose();
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _save({bool test = false}) async {
    setState(() => _busy = true);
    try {
      await AgentApi.updateSpace({
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'business': _business.text.trim(),
        'tone': _tone.text.trim(),
        'wa_phone_number_id': _phoneId.text.trim(),
        'wa_token': _token.text.trim(),
        'wa_app_secret': _secret.text.trim(),
      });
      await AgentApi.syncAiKey();
      if (test) {
        final r = await AgentApi.testWhatsapp();
        _snack((r['message'] ?? '').toString());
      } else {
        _snack('Enregistré');
      }
    } catch (e) {
      _snack('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _copy(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Glass(
          radius: 16,
          padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 11.5, color: TiyaColors.faint)),
                Text(value, style: const TextStyle(fontSize: 13)),
              ]),
            ),
            IconButton(
              tooltip: 'Copier',
              icon: const Icon(Icons.copy_rounded, size: 20),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: value));
                _snack('Copié');
              },
            ),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = widget.space;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: const Color(0xFF050814), title: const Text("Réglages de l'agent")),
      body: Container(
        decoration: const BoxDecoration(gradient: kPageGradient),
        child: ListView(padding: const EdgeInsets.fromLTRB(18, 8, 18, 40), children: [
          const SectionLabel('Ton activité'),
          TextField(controller: _name, decoration: fieldDecoration("Nom de l'activité")),
          const SizedBox(height: 10),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: fieldDecoration('Ton numéro WhatsApp')),
          const SizedBox(height: 10),
          TextField(
            controller: _business,
            minLines: 3,
            maxLines: 6,
            decoration: fieldDecoration('Présentation courte', hint: 'Ex. Resto-bar en bord de fleuve à Kinshasa, ouvert tous les jours…'),
          ),
          const SizedBox(height: 10),
          TextField(controller: _tone, decoration: fieldDecoration("Ton de l'agent", hint: 'Ex. chaleureux, professionnel et concis')),
          const SectionLabel('Connexion WhatsApp (une seule fois)'),
          Glass(
            child: const Text(
              "1. Va sur developers.facebook.com › Mes applications › Créer une application › type « Entreprise ».\n"
              "2. Ajoute le produit « WhatsApp ». Meta te donne un numéro de test gratuit, puis tu peux ajouter ton vrai numéro.\n"
              "3. Dans WhatsApp › Configuration de l'API : copie l'« Identifiant du numéro de téléphone » et un jeton d'accès (de préférence un jeton permanent d'utilisateur système).\n"
              "4. Dans WhatsApp › Configuration › Webhook : colle l'URL et le jeton de vérification ci-dessous, puis abonne-toi au champ « messages ».",
              style: TextStyle(fontSize: 12.5, height: 1.45, color: TiyaColors.muted),
            ),
          ),
          const SizedBox(height: 12),
          _copy('URL du webhook', (s['webhook_url'] ?? '').toString()),
          _copy('Jeton de vérification', (s['verify_token'] ?? '').toString()),
          TextField(controller: _phoneId, keyboardType: TextInputType.number, decoration: fieldDecoration('Identifiant du numéro de téléphone')),
          const SizedBox(height: 10),
          TextField(
            controller: _token,
            obscureText: true,
            decoration: fieldDecoration(s['has_wa_token'] == true ? "Jeton d'accès (déjà enregistré)" : "Jeton d'accès",
                hint: s['has_wa_token'] == true ? 'Laisse vide pour garder le jeton actuel' : 'EAAG…'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _secret,
            obscureText: true,
            decoration: fieldDecoration(s['has_app_secret'] == true ? "Clé secrète de l'app (enregistrée)" : "Clé secrète de l'app (recommandé)",
                hint: 'Paramètres › Général › Clé secrète'),
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(50),
                  side: const BorderSide(color: TiyaColors.glassBorder),
                ),
                onPressed: _busy ? null : () => _save(test: true),
                child: const Text('Tester WhatsApp'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(child: _PrimaryButton(label: 'Enregistrer', onTap: _busy ? null : () => _save())),
          ]),
          const SizedBox(height: 10),
          const Text(
            "Le cerveau de l'agent utilise la même clé IA que Tiya (Réglages › Cerveau de Tiya).",
            style: TextStyle(fontSize: 12, color: TiyaColors.faint),
          ),
          const SizedBox(height: 26),
          _DeleteButton(
            label: 'Déconnecter cet appareil',
            onTap: () async {
              await AgentApi.forget();
              if (context.mounted) Navigator.pop(context);
              tiyaTabRequest.value = 0;
            },
          ),
        ]),
      ),
    );
  }
}

// ======================================================================= petits composants

class _SheetBody extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _SheetBody({required this.title, required this.children});

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
        Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        ...children,
      ]),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const _PrimaryButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF0B1640),
          minimumSize: const Size.fromHeight(50),
        ),
        onPressed: onTap,
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
      );
}

class _DeleteButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _DeleteButton({this.label = 'Supprimer', required this.onTap});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: TextButton.icon(
          style: TextButton.styleFrom(foregroundColor: const Color(0xFFF87171)),
          onPressed: onTap,
          icon: const Icon(Icons.delete_outline_rounded),
          label: Text(label),
        ),
      );
}
