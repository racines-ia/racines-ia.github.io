import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'agenda_page.dart';
import 'agent_page.dart';
import 'auto_messages_page.dart';
import 'brand.dart';
import 'contacts_page.dart';
import 'native.dart';
import 'settings_page.dart';
import 'ui.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Colors.black,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const TiyaApp());
}

class TiyaApp extends StatelessWidget {
  const TiyaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Tiya',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.black,
        colorScheme: ColorScheme.fromSeed(
          seedColor: TiyaColors.blue,
          brightness: Brightness.dark,
          surface: TiyaColors.night,
          primary: TiyaColors.blueLight,
        ),
        snackBarTheme: const SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: Color(0xFF111A3A),
          contentTextStyle: TextStyle(color: Colors.white),
        ),
      ),
      home: const TiyaShell(),
    );
  }
}

/// Navigation principale : Tiya · Programme · Messages · Contacts.
class TiyaShell extends StatefulWidget {
  const TiyaShell({super.key});

  @override
  State<TiyaShell> createState() => _TiyaShellState();
}

class _TiyaShellState extends State<TiyaShell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    tiyaTabRequest.addListener(_onTab);
  }

  @override
  void dispose() {
    tiyaTabRequest.removeListener(_onTab);
    super.dispose();
  }

  void _onTab() {
    final t = tiyaTabRequest.value;
    if (t == null) return;
    tiyaTabRequest.value = null;
    setState(() => _tab = t);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: IndexedStack(
        index: _tab,
        children: const [HomePage(), AgendaPage(), AutoMessagesPage(), ContactsPage(), AgentPage()],
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: const Color(0xFF050814),
          indicatorColor: const Color(0x332563EB),
          labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
        ),
        child: NavigationBar(
          height: 66,
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(
              icon: TiyaLogo(size: 22, color: Color(0xFFA3ADC2)),
              selectedIcon: TiyaLogo(size: 22, glow: Color(0x9960A5FA), glowSigma: 4),
              label: 'Tiya',
            ),
            NavigationDestination(
              icon: Icon(Icons.event_note_outlined),
              selectedIcon: Icon(Icons.event_note_rounded, color: TiyaColors.ice),
              label: 'Programme',
            ),
            NavigationDestination(
              icon: Icon(Icons.schedule_send_outlined),
              selectedIcon: Icon(Icons.schedule_send_rounded, color: TiyaColors.ice),
              label: 'Messages',
            ),
            NavigationDestination(
              icon: Icon(Icons.contacts_outlined),
              selectedIcon: Icon(Icons.contacts_rounded, color: TiyaColors.ice),
              label: 'Contacts',
            ),
            NavigationDestination(
              icon: Icon(Icons.support_agent_outlined),
              selectedIcon: Icon(Icons.support_agent_rounded, color: TiyaColors.ice),
              label: 'Agent IA',
            ),
          ],
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with WidgetsBindingObserver {
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final List<Map<String, dynamic>> _events = [];
  StreamSubscription? _sub;
  Timer? _poll;

  bool _service = false;
  bool _mic = false;
  bool _running = false;
  String? _waitingFor;
  bool _listening = false;
  bool _hasKey = true;
  String _name = '';
  String _yesLabel = 'Oui';
  String _noLabel = 'Non';

  List<Map<String, dynamic>> _contacts = [];
  List<Map<String, dynamic>> _suggest = [];

  Map<String, dynamic>? _update;
  double? _updateProgress;
  DateTime? _lastUpdateCheck;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _sub = Native.events().listen(_onEvent);
    _input.addListener(_onInputChanged);
    tiyaPrefill.addListener(_onPrefill);
    _loadContacts();
    _loadHistory();
    _refresh();
    _checkUpdate();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    tiyaPrefill.removeListener(_onPrefill);
    _sub?.cancel();
    _poll?.cancel();
    _input.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refresh();
      _loadHistory();
      _checkUpdate();
      _loadContacts();
    }
  }

  // ---------------------------------------------------------------- données

  Future<void> _loadContacts() async {
    try {
      final st = await Native.status();
      if (st['contacts'] != true) return;
      final c = await Native.contacts();
      if (mounted) setState(() => _contacts = c);
    } catch (_) {}
  }

  void _onPrefill() {
    final t = tiyaPrefill.value;
    if (t == null) return;
    tiyaPrefill.value = null;
    _input.text = t;
    _input.selection = TextSelection.collapsed(offset: t.length);
    _focus.requestFocus();
  }

  /// Propose les contacts qui correspondent au nom en cours de saisie.
  void _onInputChanged() {
    final text = _input.text;
    List<Map<String, dynamic>> found = [];
    if (_contacts.isNotEmpty && !text.contains(':')) {
      final m = RegExp(r"(?:^|\s)(?:à|a|au|appelle|pour)\s+([^\s].*)$", caseSensitive: false).firstMatch(text);
      String q = m?.group(1) ?? '';
      q = q.replaceAll(RegExp(r'\s+(sur|par|via)\s+.*$', caseSensitive: false), '').trim();
      if (q.length >= 2) {
        final pq = plain(q);
        final starts = <Map<String, dynamic>>[];
        final contains = <Map<String, dynamic>>[];
        for (final c in _contacts) {
          final name = plain((c['name'] ?? '').toString());
          final aliases = ((c['aliases'] as List?) ?? []).map((e) => plain(e.toString())).toList();
          if (name == pq || aliases.contains(pq)) continue;
          if (name.startsWith(pq) || aliases.any((a) => a.startsWith(pq))) {
            starts.add(c);
          } else if (name.contains(pq)) {
            contains.add(c);
          }
          if (starts.length >= 6) break;
        }
        found = [...starts, ...contains].take(6).toList();
      }
    }
    setState(() => _suggest = found);
  }

  void _applySuggestion(Map<String, dynamic> c) {
    final text = _input.text;
    final m = RegExp(r"((?:^|\s)(?:à|a|au|appelle|pour)\s+)([^\s].*?)(\s+(?:sur|par|via)\s+.*)?$", caseSensitive: false)
        .firstMatch(text);
    if (m == null) return;
    final name = (c['name'] ?? '').toString();
    final rest = m.group(3) ?? '';
    final t = text.substring(0, m.start) + m.group(1)! + name + rest;
    _input.text = t;
    _input.selection = TextSelection.collapsed(offset: t.length);
    setState(() => _suggest = []);
  }

  Future<void> _loadHistory() async {
    try {
      final h = await Native.history();
      if (!mounted) return;
      setState(() {
        _events
          ..clear()
          ..addAll(h);
      });
      _toBottom();
    } catch (_) {}
  }

  Future<void> _refresh() async {
    try {
      final s = await Native.status();
      final st = await Native.getSettings();
      final provider = st['provider'] ?? 'gemini';
      final key = provider == 'claude' ? st['claudeKey'] : st['geminiKey'];
      if (!mounted) return;
      setState(() {
        _service = s['service'] == true;
        _mic = s['mic'] == true;
        _running = s['running'] == true;
        _waitingFor = s['waitingFor'] as String?;
        _hasKey = (key ?? '').toString().isNotEmpty;
        _name = (st['userName'] ?? '').toString();
      });
    } catch (_) {}
  }

  Future<void> _checkUpdate() async {
    final now = DateTime.now();
    if (_lastUpdateCheck != null && now.difference(_lastUpdateCheck!).inMinutes < 30) return;
    _lastUpdateCheck = now;
    try {
      final r = await Native.checkUpdate();
      if (!mounted) return;
      setState(() => _update = r);
    } catch (_) {}
  }

  Future<void> _installUpdate() async {
    final u = _update;
    if (u == null || u['url'] == null) return;
    final r = await Native.downloadUpdate(u['url'].toString(), (u['latest'] ?? 'maj').toString());
    if (r == 'permission') {
      _snack("Autorise Tiya à installer des applications, puis appuie à nouveau sur Installer.");
    } else {
      setState(() => _updateProgress = 0);
    }
  }

  void _onEvent(Map<String, dynamic> e) {
    final type = e['type'];
    switch (type) {
      case 'partial_speech':
        _input.text = e['text'] ?? '';
        return;
      case 'speech':
        setState(() => _listening = false);
        _input.text = e['text'] ?? '';
        _send();
        return;
      case 'speech_end':
        setState(() => _listening = false);
        return;
      case 'status':
        _refresh();
        return;
      case 'update_progress':
        setState(() => _updateProgress = (e['progress'] as num?)?.toDouble());
        return;
      case 'data_changed':
        _loadContacts();
        return;
      case 'update_installing':
        setState(() => _updateProgress = 1.0);
        return;
      case 'update_ready':
        setState(() => _updateProgress = null);
        return;
      case 'update_error':
        setState(() => _updateProgress = null);
        _snack((e['text'] ?? '').toString());
        return;
    }
    setState(() {
      _events.add(e);
      if (type == 'ask') _waitingFor = 'answer';
      if (type == 'confirm') {
        _waitingFor = e['voice'] == true ? 'voice' : 'confirm';
        _yesLabel = (e['yesLabel'] ?? 'Oui').toString();
        _noLabel = (e['noLabel'] ?? 'Non').toString();
      }
      if (type == 'done' || type == 'error') _waitingFor = null;
    });
    _toBottom();
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent + 300,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // ---------------------------------------------------------------- actions

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    if (!_service) {
      _snack("Active d'abord Tiya dans l'accessibilité (étape 2).");
      return;
    }
    _input.clear();
    FocusScope.of(context).unfocus();
    if (_waitingFor != null) {
      await Native.reply(text);
    } else if (_running) {
      _snack('Tiya travaille déjà. Appuie sur « Arrêter » pour annuler.');
    } else {
      try {
        await Native.startTask(text);
        setState(() => _running = true);
      } catch (e) {
        _snack('$e');
      }
    }
  }

  Future<void> _toggleMic() async {
    if (!_mic) {
      await Native.requestMic();
      await Future.delayed(const Duration(milliseconds: 700));
      _refresh();
      return;
    }
    if (_listening) {
      await Native.stopListening();
      setState(() => _listening = false);
    } else {
      final ok = await Native.listen();
      if (!ok) {
        _snack("Active d'abord Tiya dans l'accessibilité pour utiliser la voix.");
        return;
      }
      setState(() => _listening = true);
    }
  }

  void _snack(String m) {
    if (!mounted || m.isEmpty) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _openSettings() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsPage()));
    _refresh();
  }

  void _useSuggestion(String t) {
    _input.text = t;
    _input.selection = TextSelection.collapsed(offset: t.length);
    _focus.requestFocus();
  }

  // ---------------------------------------------------------------- interface

  @override
  Widget build(BuildContext context) {
    final setupNeeded = !_service || !_hasKey || !_mic;
    final showConversation = _events.isNotEmpty;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: Colors.black,
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 600),
        decoration: BoxDecoration(gradient: _running ? kWorkGradient : kHomeGradient),
        child: SafeArea(
          child: Column(
            children: [
              _TopBar(
                running: _running,
                service: _service,
                onSettings: _openSettings,
                onClear: showConversation
                    ? () async {
                        await Native.clearHistory();
                        setState(() => _events.clear());
                      }
                    : null,
              ),
              if (_update?['available'] == true)
                _UpdateBanner(
                  version: (_update?['latest'] ?? '').toString(),
                  progress: _updateProgress,
                  onInstall: _installUpdate,
                ),
              Expanded(
                child: ListView(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(18, 8, 18, 20),
                  children: [
                    if (!showConversation || bottomInset == 0)
                      _Hero(
                        compact: showConversation,
                        running: _running,
                        name: _name,
                      ),
                    if (setupNeeded)
                      _SetupCard(
                        service: _service,
                        hasKey: _hasKey,
                        mic: _mic,
                        onSettings: _openSettings,
                        onRefresh: _refresh,
                      ),
                    if (!showConversation && !setupNeeded) _Suggestions(onPick: _useSuggestion),
                    ..._buildEvents(),
                  ],
                ),
              ),
              if (_waitingFor == 'confirm' || _waitingFor == 'voice')
                _ConfirmBar(
                  voice: _waitingFor == 'voice',
                  yes: _yesLabel,
                  no: _noLabel,
                  onAnswer: (yes) async {
                    await Native.confirm(yes);
                    setState(() => _waitingFor = null);
                  },
                ),
              if (_running && _waitingFor == null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _StopButton(onTap: () async {
                    await Native.stopTask();
                    _refresh();
                  }),
                ),
              if (_suggest.isNotEmpty)
                SizedBox(
                  height: 46,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    children: [
                      for (final c in _suggest)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ActionChip(
                            avatar: const Icon(Icons.person_rounded, size: 16),
                            label: Text((c['name'] ?? '').toString()),
                            backgroundColor: const Color(0x262563EB),
                            side: const BorderSide(color: Color(0x5960A5FA)),
                            onPressed: () => _applySuggestion(c),
                          ),
                        ),
                    ],
                  ),
                ),
              _InputBar(
                controller: _input,
                focus: _focus,
                listening: _listening,
                waiting: _waitingFor == 'answer',
                onSend: _send,
                onMic: _toggleMic,
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildEvents() {
    final out = <Widget>[];
    int lastStep = -1;
    for (var i = 0; i < _events.length; i++) {
      if (_events[i]['type'] == 'step') lastStep = i;
    }
    for (var i = 0; i < _events.length; i++) {
      final e = _events[i];
      out.add(_EventTile(e, activeStep: _running && i == lastStep));
    }
    return out;
  }
}

// ------------------------------------------------------------------ widgets

class _TopBar extends StatelessWidget {
  final bool running;
  final bool service;
  final VoidCallback onSettings;
  final VoidCallback? onClear;
  const _TopBar({
    required this.running,
    required this.service,
    required this.onSettings,
    this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final Color dot;
    final String label;
    if (!service) {
      dot = const Color(0xFFF87171);
      label = 'Désactivée';
    } else if (running) {
      dot = TiyaColors.blueLight;
      label = 'Au travail';
    } else {
      dot = TiyaColors.green;
      label = 'Prête';
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 16, 6),
      child: Row(
        children: [
          const TiyaLogo(size: 26),
          const SizedBox(width: 10),
          const Text('Tiya',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: 0.3)),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: running ? const Color(0x2E3B82F6) : const Color(0x0FFFFFFF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 7, height: 7, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(fontSize: 11.5, color: Color(0xFFD1D5DB))),
            ]),
          ),
          const Spacer(),
          if (onClear != null) ...[
            RoundButton(
              icon: Icons.delete_sweep_outlined,
              tooltip: "Effacer l'historique",
              onTap: onClear,
              size: 42,
              borderColor: TiyaColors.glassBorder,
            ),
            const SizedBox(width: 8),
          ],
          RoundButton(
            icon: Icons.tune_rounded,
            tooltip: 'Réglages',
            onTap: onSettings,
            size: 42,
            borderColor: TiyaColors.glassBorder,
          ),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  final bool compact;
  final bool running;
  final String name;
  const _Hero({required this.compact, required this.running, required this.name});

  @override
  Widget build(BuildContext context) {
    final h = DateTime.now().hour;
    final hello = (h >= 18 || h < 4) ? 'Bonsoir' : 'Bonjour';
    final who = name.isEmpty ? '' : ' $name';
    if (compact) {
      return Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 22),
        child: Column(
          children: [
            TiyaOrb(size: 88, active: running),
            const SizedBox(height: 20),
            Text(
              running ? "Je m'en occupe…" : 'Autre chose ?',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: 56, bottom: 30),
      child: Column(
        children: [
          TiyaOrb(size: 150, active: running),
          const SizedBox(height: 34),
          Text('$hello$who',
              style: const TextStyle(fontSize: 15, color: TiyaColors.muted)),
          const SizedBox(height: 10),
          Text(
            h >= 18 || h < 4 ? "Comment puis-je t'aider ce soir ?" : "Comment puis-je t'aider aujourd'hui ?",
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 30, height: 1.18, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _Suggestions extends StatelessWidget {
  final void Function(String) onPick;
  const _Suggestions({required this.onPick});

  static const _items = [
    (Icons.chat_bubble_outline_rounded, 'Lis mes messages WhatsApp', 'Ouvre WhatsApp et lis-moi mes derniers messages'),
    (Icons.mic_none_rounded, 'Envoie un vocal', 'Envoie un vocal sur WhatsApp à '),
    (Icons.bluetooth_rounded, 'Active le Bluetooth', 'Active le Bluetooth'),
    (Icons.call_outlined, 'Appelle quelqu\'un', 'Appelle '),
    (Icons.photo_outlined, 'Envoie une photo', 'Ouvre la galerie et envoie ma dernière photo à '),
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      alignment: WrapAlignment.center,
      children: [
        for (final it in _items)
          Material(
            color: TiyaColors.glass,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: const BorderSide(color: Color(0x1FFFFFFF)),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => onPick(it.$3),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(it.$1, size: 17, color: const Color(0xFFE5E7EB)),
                  const SizedBox(width: 8),
                  Text(it.$2, style: const TextStyle(fontSize: 13.5, color: Color(0xFFE5E7EB))),
                ]),
              ),
            ),
          ),
      ],
    );
  }
}

class _UpdateBanner extends StatelessWidget {
  final String version;
  final double? progress;
  final VoidCallback onInstall;
  const _UpdateBanner({required this.version, required this.progress, required this.onInstall});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 4),
      child: Glass(
        radius: 20,
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        color: const Color(0x262563EB),
        border: const Color(0x6660A5FA),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              const Icon(Icons.system_update_rounded, color: TiyaColors.ice, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Mise à jour disponible',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                  Text('Tiya $version', style: const TextStyle(fontSize: 12.5, color: TiyaColors.muted)),
                ]),
              ),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF0B1640),
                ),
                onPressed: progress == null ? onInstall : null,
                child: Text(progress == null ? 'Installer' : '${(progress! * 100).round()} %'),
              ),
            ]),
            if (progress != null) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: const Color(0x22FFFFFF),
                  color: TiyaColors.blueLight,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SetupCard extends StatelessWidget {
  final bool service;
  final bool hasKey;
  final bool mic;
  final VoidCallback onSettings;
  final VoidCallback onRefresh;
  const _SetupCard({
    required this.service,
    required this.hasKey,
    required this.mic,
    required this.onSettings,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Glass(
        border: const Color(0x5960A5FA),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Configuration',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.6, color: TiyaColors.faint)),
            const SizedBox(height: 4),
            const Text('3 étapes avant de commencer',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            _SetupStep(
              n: 1,
              done: hasKey,
              title: 'Ajouter ta clé API (Gemini ou Claude)',
              button: 'Réglages',
              onTap: onSettings,
            ),
            _SetupStep(
              n: 2,
              done: service,
              title: "Activer Tiya dans l'accessibilité",
              subtitle:
                  "Accessibilité › Applications installées › Tiya › Activer. Si c'est grisé : Infos de l'app › menu ⋮ › Autoriser les paramètres restreints.",
              button: 'Ouvrir',
              onTap: Native.openAccessibilitySettings,
              secondButton: "Infos de l'app",
              onSecond: Native.openAppSettings,
            ),
            _SetupStep(
              n: 3,
              done: mic,
              title: 'Autoriser le micro',
              button: 'Autoriser',
              onTap: () async {
                await Native.requestMic();
                await Future.delayed(const Duration(seconds: 1));
                onRefresh();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SetupStep extends StatelessWidget {
  final int n;
  final bool done;
  final String title;
  final String? subtitle;
  final String button;
  final VoidCallback onTap;
  final String? secondButton;
  final VoidCallback? onSecond;

  const _SetupStep({
    required this.n,
    required this.done,
    required this.title,
    this.subtitle,
    required this.button,
    required this.onTap,
    this.secondButton,
    this.onSecond,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done ? const Color(0x2934D399) : const Color(0x1AFFFFFF),
            ),
            child: done
                ? const Icon(Icons.check_rounded, size: 16, color: TiyaColors.green)
                : Text('$n', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: done ? const Color(0xFF8B93AD) : Colors.white,
                    )),
                if (subtitle != null && !done)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(subtitle!, style: const TextStyle(fontSize: 12, color: TiyaColors.muted)),
                  ),
                if (!done)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Wrap(spacing: 8, runSpacing: 6, children: [
                      FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: const Color(0xFF0B1640),
                        ),
                        onPressed: onTap,
                        child: Text(button),
                      ),
                      if (secondButton != null)
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Color(0x40FFFFFF)),
                          ),
                          onPressed: onSecond,
                          child: Text(secondButton!),
                        ),
                    ]),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  final Map<String, dynamic> e;
  final bool activeStep;
  const _EventTile(this.e, {required this.activeStep});

  @override
  Widget build(BuildContext context) {
    final type = e['type'] as String? ?? '';
    final text = (e['text'] ?? '').toString();
    switch (type) {
      case 'user':
        return Align(
          alignment: Alignment.centerRight,
          child: Container(
            margin: const EdgeInsets.only(top: 14, bottom: 8, left: 56),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
            decoration: BoxDecoration(
              color: const Color(0x332563EB),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0x5960A5FA)),
            ),
            child: Text(text, style: const TextStyle(fontSize: 15, height: 1.35)),
          ),
        );
      case 'step':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _StepMark(active: activeStep),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(
                    text,
                    style: TextStyle(
                      fontSize: 13.5,
                      height: 1.35,
                      color: activeStep ? Colors.white : const Color(0xFFC9CFDB),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      case 'ask':
      case 'confirm':
        return _Card(
          text: text,
          icon: type == 'ask' ? Icons.help_outline_rounded : Icons.verified_user_outlined,
          color: const Color(0x242563EB),
          border: const Color(0x6660A5FA),
        );
      case 'error':
        return _Card(
          text: text,
          icon: Icons.error_outline_rounded,
          color: const Color(0x26DC2626),
          border: const Color(0x66F87171),
          iconColor: const Color(0xFFFCA5A5),
        );
      default: // message, done
        return _Card(text: text, logo: true);
    }
  }
}

class _StepMark extends StatelessWidget {
  final bool active;
  const _StepMark({required this.active});

  @override
  Widget build(BuildContext context) {
    if (active) {
      return Container(
        width: 26,
        height: 26,
        alignment: Alignment.center,
        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x383B82F6)),
        child: const SizedBox(
          width: 12,
          height: 12,
          child: CircularProgressIndicator(strokeWidth: 2, color: TiyaColors.blueLight),
        ),
      );
    }
    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x2934D399)),
      child: const Icon(Icons.check_rounded, size: 15, color: TiyaColors.green),
    );
  }
}

class _Card extends StatelessWidget {
  final String text;
  final IconData? icon;
  final bool logo;
  final Color color;
  final Color border;
  final Color iconColor;
  const _Card({
    required this.text,
    this.icon,
    this.logo = false,
    this.color = TiyaColors.glass,
    this.border = TiyaColors.glassBorder,
    this.iconColor = TiyaColors.ice,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Glass(
        radius: 22,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        color: color,
        border: border,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: logo
                  ? const TiyaLogo(size: 20, glow: Color(0x9960A5FA), glowSigma: 4)
                  : Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(width: 12),
            Expanded(child: SelectableText(text, style: const TextStyle(fontSize: 15, height: 1.4))),
          ],
        ),
      ),
    );
  }
}

class _ConfirmBar extends StatelessWidget {
  final bool voice;
  final String yes;
  final String no;
  final void Function(bool) onAnswer;
  const _ConfirmBar({required this.voice, required this.yes, required this.no, required this.onAnswer});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
      child: Glass(
        radius: 24,
        color: const Color(0x242563EB),
        border: const Color(0x6660A5FA),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Icon(voice ? Icons.mic_rounded : Icons.verified_user_outlined, color: TiyaColors.ice, size: 20),
              const SizedBox(width: 10),
              Text(voice ? 'Enregistrement en cours' : 'Tiya attend ta confirmation',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(48),
                    side: const BorderSide(color: Color(0x40FFFFFF)),
                  ),
                  onPressed: () => onAnswer(false),
                  child: Text(no, style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF0B1640),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: () => onAnswer(true),
                  child: Text(yes, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

class _StopButton extends StatelessWidget {
  final VoidCallback onTap;
  const _StopButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xEBDC2626),
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 24),
      ),
      onPressed: onTap,
      icon: const Icon(Icons.stop_rounded),
      label: const Text('Arrêter Tiya', style: TextStyle(fontWeight: FontWeight.w700)),
    );
  }
}

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focus;
  final bool listening;
  final bool waiting;
  final VoidCallback onSend;
  final VoidCallback onMic;

  const _InputBar({
    required this.controller,
    required this.focus,
    required this.listening,
    required this.waiting,
    required this.onSend,
    required this.onMic,
  });

  @override
  Widget build(BuildContext context) {
    final hasText = controller.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
      child: Glass(
        radius: 32,
        padding: const EdgeInsets.fromLTRB(20, 6, 6, 6),
        color: const Color(0x29BFDBFE),
        border: const Color(0x59DBEAFE),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                focusNode: focus,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSend(),
                style: const TextStyle(fontSize: 16, color: Colors.white),
                cursorColor: TiyaColors.ice,
                decoration: InputDecoration(
                  isCollapsed: true,
                  border: InputBorder.none,
                  hintText: listening
                      ? "Je t'écoute…"
                      : waiting
                          ? 'Réponds à Tiya…'
                          : "Demande n'importe quoi…",
                  hintStyle: const TextStyle(color: Color(0xB3E5E7EB)),
                ),
              ),
            ),
            const SizedBox(width: 8),
            if (hasText) ...[
              RoundButton(
                icon: Icons.mic_none_rounded,
                tooltip: 'Parler',
                onTap: onMic,
                size: 44,
                background: const Color(0x1AFFFFFF),
              ),
              const SizedBox(width: 6),
              RoundButton(
                icon: Icons.arrow_upward_rounded,
                tooltip: 'Envoyer',
                onTap: onSend,
                size: 48,
                background: Colors.white,
                foreground: const Color(0xFF0B1640),
              ),
            ] else
              RoundButton(
                icon: listening ? Icons.stop_rounded : Icons.graphic_eq_rounded,
                tooltip: listening ? "Arrêter l'écoute" : 'Parler à Tiya',
                onTap: onMic,
                size: 48,
                background: listening ? TiyaColors.red : Colors.white,
                foreground: listening ? Colors.white : const Color(0xFF0B1640),
              ),
          ],
        ),
      ),
    );
  }
}
