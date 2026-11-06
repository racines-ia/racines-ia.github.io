import 'dart:async';

import 'package:flutter/material.dart';

import 'native.dart';
import 'settings_page.dart';

void main() => runApp(const TiyaApp());

const kViolet = Color(0xFF7C4DFF);
const kTeal = Color(0xFF00BFA5);
const kBg = Color(0xFF0E0E16);
const kCard = Color(0xFF1A1A27);
const kCard2 = Color(0xFF24243A);

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
        scaffoldBackgroundColor: kBg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: kViolet,
          brightness: Brightness.dark,
          surface: kBg,
        ),
      ),
      home: const HomePage(),
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _sub = Native.events().listen(_onEvent);
    _loadHistory();
    _refresh();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    _poll?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refresh();
      _loadHistory();
    }
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
      });
    } catch (_) {}
  }

  void _onEvent(Map<String, dynamic> e) {
    final type = e['type'];
    if (type == 'partial_speech') {
      _input.text = e['text'] ?? '';
      return;
    }
    if (type == 'speech') {
      setState(() => _listening = false);
      _input.text = e['text'] ?? '';
      _send();
      return;
    }
    if (type == 'speech_end') {
      setState(() => _listening = false);
      return;
    }
    if (type == 'status') {
      _refresh();
      return;
    }
    setState(() {
      _events.add(e);
      if (type == 'ask') _waitingFor = 'answer';
      if (type == 'confirm') _waitingFor = 'confirm';
      if (type == 'done' || type == 'error') {
        _waitingFor = null;
      }
    });
    _toBottom();
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent + 200,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    if (!_service) {
      _snack("Active d'abord Tiya dans les réglages d'accessibilité.");
      return;
    }
    _input.clear();
    FocusScope.of(context).unfocus();
    if (_waitingFor != null) {
      await Native.reply(text);
    } else if (_running) {
      _snack('Tiya travaille déjà. Appuie sur Stop pour arrêter.');
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
      await Future.delayed(const Duration(milliseconds: 600));
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
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    final setupNeeded = !_service || !_hasKey || !_mic;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: kBg,
        titleSpacing: 16,
        title: Row(
          children: [
            const _Logo(size: 34),
            const SizedBox(width: 10),
            const Text('Tiya', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
            const SizedBox(width: 10),
            _StatusDot(on: _service, running: _running),
          ],
        ),
        actions: [
          IconButton(
            tooltip: "Effacer l'historique",
            icon: const Icon(Icons.delete_sweep_outlined),
            onPressed: () async {
              await Native.clearHistory();
              setState(() => _events.clear());
            },
          ),
          IconButton(
            tooltip: 'Réglages',
            icon: const Icon(Icons.tune),
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsPage()),
              );
              _refresh();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 16),
              children: [
                if (setupNeeded)
                  _SetupCard(
                    service: _service,
                    hasKey: _hasKey,
                    mic: _mic,
                    onRefresh: _refresh,
                  ),
                if (_events.isEmpty) _EmptyState(onPick: (t) {
                  _input.text = t;
                }),
                ..._events.map((e) => _EventTile(e)),
              ],
            ),
          ),
          if (_waitingFor == 'confirm') _ConfirmBar(onAnswer: (yes) async {
            await Native.confirm(yes);
            setState(() => _waitingFor = null);
          }),
          _InputBar(
            controller: _input,
            running: _running,
            listening: _listening,
            waiting: _waitingFor == 'answer',
            onSend: _send,
            onMic: _toggleMic,
            onStop: () async {
              await Native.stopTask();
              _refresh();
            },
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------ widgets

class _Logo extends StatelessWidget {
  final double size;
  const _Logo({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(colors: [kViolet, kTeal]),
      ),
      child: Text('T',
          style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              fontSize: size * 0.5)),
    );
  }
}

class _StatusDot extends StatelessWidget {
  final bool on;
  final bool running;
  const _StatusDot({required this.on, required this.running});

  @override
  Widget build(BuildContext context) {
    final color = !on ? Colors.redAccent : (running ? Colors.amber : kTeal);
    final label = !on ? 'désactivée' : (running ? 'au travail' : 'prête');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: kCard2,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.white70)),
      ]),
    );
  }
}

class _SetupCard extends StatelessWidget {
  final bool service;
  final bool hasKey;
  final bool mic;
  final VoidCallback onRefresh;
  const _SetupCard({
    required this.service,
    required this.hasKey,
    required this.mic,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: kViolet, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Configuration de Tiya',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('3 étapes avant de pouvoir lui donner des tâches.',
              style: TextStyle(color: Colors.white60, fontSize: 13)),
          const SizedBox(height: 12),
          _SetupStep(
            n: 1,
            done: hasKey,
            title: "Ajouter une clé API (Gemini ou Claude)",
            button: 'Réglages',
            onTap: () async {
              await Navigator.push(context,
                  MaterialPageRoute(builder: (_) => const SettingsPage()));
              onRefresh();
            },
          ),
          _SetupStep(
            n: 2,
            done: service,
            title: "Activer Tiya dans l'accessibilité",
            subtitle:
                "Réglages › Accessibilité › Applications installées › Tiya › Activer. "
                "Si c'est grisé (« paramètre restreint ») : ouvre « Infos de l'app », menu ⋮ en haut à droite › Autoriser les paramètres restreints, puis recommence.",
            button: 'Ouvrir',
            onTap: Native.openAccessibilitySettings,
            secondButton: "Infos de l'app",
            onSecond: Native.openAppSettings,
          ),
          _SetupStep(
            n: 3,
            done: mic,
            title: 'Autoriser le micro (commande vocale)',
            button: 'Autoriser',
            onTap: () async {
              await Native.requestMic();
              await Future.delayed(const Duration(seconds: 1));
              onRefresh();
            },
          ),
        ],
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
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 13,
            backgroundColor: done ? kTeal : kCard2,
            child: done
                ? const Icon(Icons.check, size: 16, color: Colors.white)
                : Text('$n', style: const TextStyle(fontSize: 12, color: Colors.white)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: done ? Colors.white54 : Colors.white,
                        decoration: done ? TextDecoration.lineThrough : null)),
                if (subtitle != null && !done)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(subtitle!,
                        style: const TextStyle(fontSize: 12, color: Colors.white60)),
                  ),
                if (!done)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Wrap(spacing: 8, children: [
                      FilledButton.tonal(onPressed: onTap, child: Text(button)),
                      if (secondButton != null)
                        OutlinedButton(onPressed: onSecond, child: Text(secondButton!)),
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

class _EmptyState extends StatelessWidget {
  final void Function(String) onPick;
  const _EmptyState({required this.onPick});

  static const ideas = [
    'Ouvre WhatsApp et lis-moi mes derniers messages',
    'Ouvre la galerie et envoie ma dernière photo à Papa sur WhatsApp',
    "Mets une alarme demain à 6h",
    'Cherche « météo Kinshasa » sur Google',
    'Ouvre TikTok et va sur mon profil',
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 30),
      child: Column(
        children: [
          const _Logo(size: 72),
          const SizedBox(height: 14),
          const Text('Que dois-je faire pour toi ?',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          const Text(
            "Écris ou parle. Tiya prend la main sur ton téléphone, et la bulle flottante te montre ce qu'elle fait.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white60),
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: ideas
                .map((t) => ActionChip(
                      label: Text(t, style: const TextStyle(fontSize: 12)),
                      backgroundColor: kCard,
                      onPressed: () => onPick(t),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  final Map<String, dynamic> e;
  const _EventTile(this.e);

  @override
  Widget build(BuildContext context) {
    final type = e['type'] as String? ?? '';
    final text = (e['text'] ?? '').toString();
    switch (type) {
      case 'user':
        return Align(
          alignment: Alignment.centerRight,
          child: Container(
            margin: const EdgeInsets.only(top: 10, bottom: 4, left: 50),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [kViolet, Color(0xFF5E35B1)]),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Text(text, style: const TextStyle(color: Colors.white)),
          ),
        );
      case 'step':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(Icons.bolt, size: 15, color: kTeal),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(text,
                    style: const TextStyle(fontSize: 12.5, color: Colors.white60)),
              ),
            ],
          ),
        );
      case 'ask':
      case 'confirm':
        return _TiyaBubble(
          text: text,
          color: const Color(0xFF3A2E00),
          icon: type == 'ask' ? Icons.help_outline : Icons.verified_user_outlined,
        );
      case 'error':
        return _TiyaBubble(
          text: text,
          color: const Color(0xFF3A1414),
          icon: Icons.error_outline,
        );
      default: // message, done
        return _TiyaBubble(text: text, color: kCard2, icon: Icons.auto_awesome);
    }
  }
}

class _TiyaBubble extends StatelessWidget {
  final String text;
  final Color color;
  final IconData icon;
  const _TiyaBubble({required this.text, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 6, bottom: 6, right: 40),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(18)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 17, color: kTeal),
            const SizedBox(width: 8),
            Flexible(child: SelectableText(text)),
          ],
        ),
      ),
    );
  }
}

class _ConfirmBar extends StatelessWidget {
  final void Function(bool) onAnswer;
  const _ConfirmBar({required this.onAnswer});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: kCard,
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
      child: Row(children: [
        const Expanded(child: Text('Tiya attend ta confirmation')),
        OutlinedButton(onPressed: () => onAnswer(false), child: const Text('Non')),
        const SizedBox(width: 8),
        FilledButton(onPressed: () => onAnswer(true), child: const Text('Oui')),
      ]),
    );
  }
}

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final bool running;
  final bool listening;
  final bool waiting;
  final VoidCallback onSend;
  final VoidCallback onMic;
  final VoidCallback onStop;

  const _InputBar({
    required this.controller,
    required this.running,
    required this.listening,
    required this.waiting,
    required this.onSend,
    required this.onMic,
    required this.onStop,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
        color: kBg,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSend(),
                decoration: InputDecoration(
                  hintText: listening
                      ? 'Je t\'écoute…'
                      : waiting
                          ? 'Réponds à Tiya…'
                          : 'Donne une tâche à Tiya…',
                  filled: true,
                  fillColor: kCard,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(26),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _RoundButton(
              icon: listening ? Icons.graphic_eq : Icons.mic,
              color: listening ? Colors.redAccent : kCard2,
              onTap: onMic,
            ),
            const SizedBox(width: 6),
            if (running && !waiting)
              _RoundButton(icon: Icons.stop, color: Colors.redAccent, onTap: onStop)
            else
              _RoundButton(icon: Icons.arrow_upward, color: kViolet, onTap: onSend),
          ],
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _RoundButton({required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Icon(icon, color: Colors.white),
        ),
      ),
    );
  }
}
