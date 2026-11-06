import 'package:flutter/material.dart';

import 'native.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _loading = true;
  bool _testing = false;
  String _provider = 'gemini';
  bool _vision = true;
  bool _confirm = true;
  bool _speak = true;
  double _maxSteps = 30;
  bool _showKeys = false;

  final _geminiKey = TextEditingController();
  final _geminiModel = TextEditingController();
  final _claudeKey = TextEditingController();
  final _claudeModel = TextEditingController();
  final _blocked = TextEditingController();
  final _name = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = await Native.getSettings();
    setState(() {
      _provider = (s['provider'] ?? 'gemini').toString();
      _geminiKey.text = (s['geminiKey'] ?? '').toString();
      _geminiModel.text = (s['geminiModel'] ?? '').toString();
      _claudeKey.text = (s['claudeKey'] ?? '').toString();
      _claudeModel.text = (s['claudeModel'] ?? '').toString();
      _vision = s['vision'] == true;
      _confirm = s['confirmSensitive'] == true;
      _speak = s['speak'] == true;
      _maxSteps = ((s['maxSteps'] ?? 30) as num).toDouble();
      _blocked.text = (s['blockedApps'] ?? '').toString();
      _name.text = (s['userName'] ?? '').toString();
      _loading = false;
    });
  }

  Map<String, dynamic> _collect() => {
        'provider': _provider,
        'geminiKey': _geminiKey.text,
        'geminiModel': _geminiModel.text,
        'claudeKey': _claudeKey.text,
        'claudeModel': _claudeModel.text,
        'vision': _vision,
        'confirmSensitive': _confirm,
        'speak': _speak,
        'maxSteps': _maxSteps.round(),
        'blockedApps': _blocked.text,
        'userName': _name.text,
      };

  Future<void> _save({bool quiet = false}) async {
    await Native.saveSettings(_collect());
    if (!quiet && mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Réglages enregistrés')));
    }
  }

  Future<void> _test() async {
    setState(() => _testing = true);
    await _save(quiet: true);
    final r = await Native.testKey();
    if (!mounted) return;
    setState(() => _testing = false);
    final ok = r['ok'] == true;
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(ok ? '✅ Connexion réussie' : '❌ Échec de connexion'),
        content: Text(ok
            ? "${_provider == 'claude' ? 'Claude' : 'Gemini'} répond correctement. Tiya est prête."
            : (r['message'] ?? '').toString()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK')),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _geminiKey.dispose();
    _geminiModel.dispose();
    _claudeKey.dispose();
    _claudeModel.dispose();
    _blocked.dispose();
    _name.dispose();
    super.dispose();
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 4, 8),
        child: Text(t,
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF00BFA5))),
      );

  InputDecoration _dec(String label, {String? hint, Widget? suffix}) => InputDecoration(
        labelText: label,
        hintText: hint,
        suffixIcon: suffix,
        filled: true,
        fillColor: const Color(0xFF1A1A27),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Réglages de Tiya'),
        actions: [
          TextButton(onPressed: () => _save(), child: const Text('Enregistrer')),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
              children: [
                _section('CERVEAU DE TIYA'),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'gemini', label: Text('Gemini'), icon: Icon(Icons.auto_awesome)),
                    ButtonSegment(value: 'claude', label: Text('Claude'), icon: Icon(Icons.psychology)),
                  ],
                  selected: {_provider},
                  onSelectionChanged: (s) => setState(() => _provider = s.first),
                ),
                const SizedBox(height: 14),
                if (_provider == 'gemini') ...[
                  TextField(
                    controller: _geminiKey,
                    obscureText: !_showKeys,
                    decoration: _dec('Clé API Gemini',
                        hint: 'AIza…',
                        suffix: IconButton(
                          icon: Icon(_showKeys ? Icons.visibility_off : Icons.visibility),
                          onPressed: () => setState(() => _showKeys = !_showKeys),
                        )),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Gratuite sur aistudio.google.com › Get API key.',
                    style: TextStyle(fontSize: 12, color: Colors.white54),
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: _geminiModel, decoration: _dec('Modèle Gemini')),
                ] else ...[
                  TextField(
                    controller: _claudeKey,
                    obscureText: !_showKeys,
                    decoration: _dec('Clé API Claude',
                        hint: 'sk-ant-…',
                        suffix: IconButton(
                          icon: Icon(_showKeys ? Icons.visibility_off : Icons.visibility),
                          onPressed: () => setState(() => _showKeys = !_showKeys),
                        )),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Sur platform.claude.com › API Keys (paiement à l\'usage par carte).',
                    style: TextStyle(fontSize: 12, color: Colors.white54),
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: _claudeModel, decoration: _dec('Modèle Claude')),
                ],
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _testing ? null : _test,
                  icon: _testing
                      ? const SizedBox(
                          width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.wifi_tethering),
                  label: Text(_testing ? 'Test en cours…' : 'Tester la connexion'),
                ),

                _section('TOI'),
                TextField(controller: _name, decoration: _dec('Ton prénom (optionnel)')),

                _section('COMPORTEMENT'),
                SwitchListTile(
                  value: _confirm,
                  onChanged: (v) => setState(() => _confirm = v),
                  title: const Text('Demander avant les actions sensibles'),
                  subtitle: const Text('Envoyer un message, supprimer, partager, appeler…'),
                ),
                SwitchListTile(
                  value: _vision,
                  onChanged: (v) => setState(() => _vision = v),
                  title: const Text("Voir l'écran (captures)"),
                  subtitle: const Text('Indispensable pour les photos. Consomme plus de crédit.'),
                ),
                SwitchListTile(
                  value: _speak,
                  onChanged: (v) => setState(() => _speak = v),
                  title: const Text('Tiya parle à voix haute'),
                ),
                ListTile(
                  title: const Text('Nombre maximum d\'étapes par tâche'),
                  subtitle: Slider(
                    value: _maxSteps,
                    min: 5,
                    max: 100,
                    divisions: 19,
                    label: _maxSteps.round().toString(),
                    onChanged: (v) => setState(() => _maxSteps = v),
                  ),
                  trailing: Text(_maxSteps.round().toString()),
                ),

                _section('APPS PROTÉGÉES'),
                const Text(
                  'Tiya refuse d\'ouvrir toute app dont le nom contient un de ces mots (un par ligne). '
                  'Garde ici tes apps de banque et de mobile money.',
                  style: TextStyle(fontSize: 12, color: Colors.white60),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _blocked,
                  minLines: 4,
                  maxLines: 10,
                  decoration: _dec('Mots-clés bloqués'),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () async {
                    await _save();
                    if (context.mounted) Navigator.pop(context);
                  },
                  child: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Enregistrer'),
                  ),
                ),
              ],
            ),
    );
  }
}
