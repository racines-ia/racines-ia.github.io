import 'package:flutter/material.dart';

import 'brand.dart';
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
  String _version = '';
  bool _bubble = true;
  String _voice = '';
  double _rate = 1.05;
  double _pitch = 1.0;
  bool _contacts = false;
  List<Map<String, dynamic>> _voices = [];

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
    String v = '';
    try {
      final r = await Native.version();
      v = (r['name'] ?? '').toString();
    } catch (_) {}
    List<Map<String, dynamic>> voices = [];
    bool contacts = false;
    try {
      voices = await Native.listVoices();
      final st = await Native.status();
      contacts = st['contacts'] == true;
    } catch (_) {}
    if (!mounted) return;
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
      _version = v;
      _bubble = s['bubbleEnabled'] != false;
      _voice = (s['ttsVoice'] ?? '').toString();
      _rate = ((s['ttsRate'] ?? 1.05) as num).toDouble();
      _pitch = ((s['ttsPitch'] ?? 1.0) as num).toDouble();
      _voices = voices;
      _contacts = contacts;
      if (_voice.isNotEmpty && !_voices.any((x) => x['name'] == _voice)) _voice = '';
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
        'bubbleEnabled': _bubble,
        'ttsVoice': _voice,
        'ttsRate': _rate,
        'ttsPitch': _pitch,
      };

  Future<void> _save({bool quiet = false}) async {
    await Native.saveSettings(_collect());
    if (!quiet && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Réglages enregistrés')));
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
        backgroundColor: const Color(0xFF0B1230),
        icon: Icon(ok ? Icons.check_circle_rounded : Icons.error_outline_rounded,
            color: ok ? TiyaColors.green : const Color(0xFFF87171), size: 34),
        title: Text(ok ? 'Connexion réussie' : 'Échec de connexion'),
        content: Text(ok
            ? "${_provider == 'claude' ? 'Claude' : 'Gemini'} répond correctement. Tiya est prête."
            : (r['message'] ?? '').toString()),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
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
        padding: const EdgeInsets.fromLTRB(4, 26, 4, 10),
        child: Text(t,
            style: const TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.6, color: TiyaColors.faint)),
      );

  InputDecoration _dec(String label, {String? hint, Widget? suffix}) => InputDecoration(
        labelText: label,
        hintText: hint,
        suffixIcon: suffix,
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

  Widget _brain(String id, String name, String sub) {
    final sel = _provider == id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: () => setState(() => _provider = id),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            padding: const EdgeInsets.fromLTRB(18, 16, 16, 16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              color: sel ? null : const Color(0x08FFFFFF),
              gradient: sel
                  ? const RadialGradient(
                      center: Alignment(0.85, -1.2),
                      radius: 1.4,
                      colors: [Color(0x553B82F6), Color(0x0F2563EB)],
                    )
                  : null,
              border: Border.all(color: sel ? const Color(0x9960A5FA) : TiyaColors.glassBorder),
              boxShadow: sel
                  ? const [BoxShadow(color: Color(0x332563EB), blurRadius: 26)]
                  : null,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 3),
                    Text(sub, style: const TextStyle(fontSize: 12.5, color: TiyaColors.muted)),
                  ]),
                ),
                if (sel)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: TiyaColors.blueLight),
                    ),
                    child: const Text('Actif', style: TextStyle(fontSize: 11.5, color: TiyaColors.ice)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _countryLabel(String c) {
    switch (c) {
      case 'FR':
        return 'France';
      case 'CA':
        return 'Canada';
      case 'BE':
        return 'Belgique';
      case 'CH':
        return 'Suisse';
      default:
        return c.isEmpty ? 'Français' : c;
    }
  }

  Widget _switch(String title, String? sub, bool v, ValueChanged<bool> onChanged) {
    return SwitchListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      value: v,
      onChanged: onChanged,
      activeTrackColor: TiyaColors.blue,
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: sub == null ? null : Text(sub, style: const TextStyle(color: TiyaColors.muted, fontSize: 12.5)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final eye = IconButton(
      tooltip: _showKeys ? 'Masquer la clé' : 'Afficher la clé',
      icon: Icon(_showKeys ? Icons.visibility_off_outlined : Icons.visibility_outlined),
      onPressed: () => setState(() => _showKeys = !_showKeys),
    );
    return Scaffold(
      backgroundColor: Colors.black,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.black, TiyaColors.night, Color(0xFF071232)],
          ),
        ),
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 16, 4),
                      child: Row(children: [
                        const TiyaLogo(size: 26),
                        const SizedBox(width: 10),
                        const Text('Réglages', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                        const Spacer(),
                        RoundButton(
                          icon: Icons.close_rounded,
                          tooltip: 'Fermer',
                          size: 42,
                          borderColor: TiyaColors.glassBorder,
                          onTap: () async {
                            await _save(quiet: true);
                            if (context.mounted) Navigator.pop(context);
                          },
                        ),
                      ]),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(18, 0, 18, 30),
                        children: [
                          _section('CERVEAU DE TIYA'),
                          _brain('gemini', 'Gemini', 'Gratuit pour commencer · Google'),
                          _brain('claude', 'Claude', "Payant à l'usage · plus précis · Anthropic"),
                          const SizedBox(height: 8),
                          if (_provider == 'gemini') ...[
                            TextField(
                              controller: _geminiKey,
                              obscureText: !_showKeys,
                              decoration: _dec('Clé API Gemini', hint: 'AIza…', suffix: eye),
                            ),
                            const Padding(
                              padding: EdgeInsets.fromLTRB(6, 6, 6, 12),
                              child: Text('Gratuite sur aistudio.google.com › Get API key.',
                                  style: TextStyle(fontSize: 12, color: TiyaColors.faint)),
                            ),
                            TextField(controller: _geminiModel, decoration: _dec('Modèle Gemini')),
                          ] else ...[
                            TextField(
                              controller: _claudeKey,
                              obscureText: !_showKeys,
                              decoration: _dec('Clé API Claude', hint: 'sk-ant-…', suffix: eye),
                            ),
                            const Padding(
                              padding: EdgeInsets.fromLTRB(6, 6, 6, 12),
                              child: Text("platform.claude.com › API Keys (crédit nécessaire).",
                                  style: TextStyle(fontSize: 12, color: TiyaColors.faint)),
                            ),
                            TextField(controller: _claudeModel, decoration: _dec('Modèle Claude')),
                          ],
                          const SizedBox(height: 14),
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: const Color(0xFF0B1640),
                              minimumSize: const Size.fromHeight(52),
                            ),
                            onPressed: _testing ? null : _test,
                            icon: _testing
                                ? const SizedBox(
                                    width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.wifi_tethering_rounded),
                            label: Text(_testing ? 'Test en cours…' : 'Tester la connexion',
                                style: const TextStyle(fontWeight: FontWeight.w700)),
                          ),
                          _section('TOI'),
                          TextField(controller: _name, decoration: _dec('Ton prénom (optionnel)')),
                          _section('COMPORTEMENT'),
                          Glass(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            child: Column(children: [
                              _switch('Confirmer avant les actions sensibles',
                                  'Envoyer, supprimer, partager, appeler…', _confirm, (v) => setState(() => _confirm = v)),
                              _switch("Voir l'écran (captures)", 'Indispensable pour les photos. Consomme plus de crédit.',
                                  _vision, (v) => setState(() => _vision = v)),
                              _switch('Tiya parle à voix haute', null, _speak, (v) => setState(() => _speak = v)),
                              ListTile(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                                title: const Text("Étapes maximum par tâche",
                                    style: TextStyle(fontWeight: FontWeight.w600)),
                                trailing: Text(_maxSteps.round().toString(),
                                    style: const TextStyle(fontWeight: FontWeight.w700)),
                                subtitle: Slider(
                                  value: _maxSteps,
                                  min: 5,
                                  max: 100,
                                  divisions: 19,
                                  activeColor: TiyaColors.blueLight,
                                  label: _maxSteps.round().toString(),
                                  onChanged: (v) => setState(() => _maxSteps = v),
                                ),
                              ),
                            ]),
                          ),
                          _section('BULLE FLOTTANTE'),
                          Glass(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            child: _switch(
                              'Afficher la bulle Tiya',
                              'Touche le logo pour parler. Appui long pour la masquer.',
                              _bubble,
                              (v) => setState(() => _bubble = v),
                            ),
                          ),
                          _section('VOIX DE TIYA'),
                          Glass(
                            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                DropdownButtonFormField<String>(
                                  initialValue: _voice,
                                  isExpanded: true,
                                  dropdownColor: const Color(0xFF0B1230),
                                  decoration: _dec('Voix'),
                                  items: [
                                    const DropdownMenuItem(value: '', child: Text('Voix par défaut du téléphone')),
                                    for (var i = 0; i < _voices.length; i++)
                                      DropdownMenuItem(
                                        value: _voices[i]['name'].toString(),
                                        child: Text(
                                          'Voix ${i + 1} · ${_countryLabel(_voices[i]['country'].toString())}'
                                          '${_voices[i]['network'] == true ? ' · en ligne' : ''}',
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                  ],
                                  onChanged: (v) {
                                    setState(() => _voice = v ?? '');
                                    Native.previewVoice(_voice, _rate, _pitch);
                                  },
                                ),
                                if (_voices.isEmpty)
                                  const Padding(
                                    padding: EdgeInsets.only(top: 8),
                                    child: Text(
                                      "Aucune autre voix trouvée. Paramètres du téléphone › Synthèse vocale › Google › Installer les données vocales › Français.",
                                      style: TextStyle(fontSize: 12, color: TiyaColors.faint),
                                    ),
                                  ),
                                const SizedBox(height: 10),
                                Row(children: [
                                  const SizedBox(width: 80, child: Text('Vitesse')),
                                  Expanded(
                                    child: Slider(
                                      value: _rate,
                                      min: 0.6,
                                      max: 1.8,
                                      divisions: 12,
                                      activeColor: TiyaColors.blueLight,
                                      label: '${_rate.toStringAsFixed(1)}×',
                                      onChanged: (v) => setState(() => _rate = v),
                                    ),
                                  ),
                                ]),
                                Row(children: [
                                  const SizedBox(width: 80, child: Text('Tonalité')),
                                  Expanded(
                                    child: Slider(
                                      value: _pitch,
                                      min: 0.6,
                                      max: 1.6,
                                      divisions: 10,
                                      activeColor: TiyaColors.blueLight,
                                      label: _pitch.toStringAsFixed(1),
                                      onChanged: (v) => setState(() => _pitch = v),
                                    ),
                                  ),
                                ]),
                                OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: Colors.white,
                                    side: const BorderSide(color: Color(0x40FFFFFF)),
                                    minimumSize: const Size.fromHeight(46),
                                  ),
                                  onPressed: () => Native.previewVoice(_voice, _rate, _pitch),
                                  icon: const Icon(Icons.volume_up_rounded),
                                  label: const Text('Écouter'),
                                ),
                              ],
                            ),
                          ),
                          _section('RACCOURCIS RAPIDES (SANS IA)'),
                          Glass(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Exécutés instantanément, sans attendre l\'IA :',
                                  style: TextStyle(fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 10),
                                for (final ex in const [
                                  '« Ouvre WhatsApp »',
                                  '« Appelle Maman »',
                                  '« Écris à Papa sur WhatsApp : j\'arrive »',
                                  '« Envoie un vocal à Mon amour sur WhatsApp »',
                                  '« Envoie un SMS à Patrick : je te rappelle »',
                                  '« Mets une alarme à 6 h 30 »  ·  « Minuteur de 10 minutes »',
                                  '« Allume la lampe »  ·  « Active le Bluetooth »',
                                ])
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 6),
                                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      const Padding(
                                        padding: EdgeInsets.only(top: 2),
                                        child: Icon(Icons.bolt_rounded, size: 16, color: TiyaColors.blueLight),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(ex, style: const TextStyle(fontSize: 13, color: TiyaColors.muted)),
                                      ),
                                    ]),
                                  ),
                                const SizedBox(height: 8),
                                if (_contacts)
                                  const Row(children: [
                                    Icon(Icons.check_circle_rounded, color: TiyaColors.green, size: 18),
                                    SizedBox(width: 8),
                                    Text('Contacts et appels autorisés'),
                                  ])
                                else
                                  FilledButton.icon(
                                    style: FilledButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: const Color(0xFF0B1640),
                                      minimumSize: const Size.fromHeight(46),
                                    ),
                                    onPressed: () async {
                                      await Native.requestContacts();
                                      await Future.delayed(const Duration(milliseconds: 1500));
                                      final st = await Native.status();
                                      if (mounted) setState(() => _contacts = st['contacts'] == true);
                                    },
                                    icon: const Icon(Icons.contacts_rounded),
                                    label: const Text('Autoriser contacts et appels'),
                                  ),
                              ],
                            ),
                          ),
                          _section('APPS PROTÉGÉES'),
                          const Padding(
                            padding: EdgeInsets.fromLTRB(4, 0, 4, 10),
                            child: Text(
                              "Tiya refuse d'ouvrir toute app dont le nom contient un de ces mots (un par ligne). Garde ici tes apps de banque et de mobile money.",
                              style: TextStyle(fontSize: 12.5, color: TiyaColors.muted),
                            ),
                          ),
                          TextField(
                            controller: _blocked,
                            minLines: 4,
                            maxLines: 10,
                            decoration: _dec('Mots-clés bloqués'),
                          ),
                          const SizedBox(height: 24),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: TiyaColors.blue,
                              foregroundColor: Colors.white,
                              minimumSize: const Size.fromHeight(52),
                            ),
                            onPressed: () async {
                              await _save();
                              if (context.mounted) Navigator.pop(context);
                            },
                            child: const Text('Enregistrer', style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(height: 16),
                          OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              minimumSize: const Size.fromHeight(48),
                              side: const BorderSide(color: TiyaColors.glassBorder),
                            ),
                            onPressed: () async {
                              final messenger = ScaffoldMessenger.of(context);
                              final r = await Native.checkUpdate();
                              if (r['available'] == true) {
                                final res = await Native.downloadUpdate(r['url'].toString(), r['latest'].toString());
                                messenger.showSnackBar(SnackBar(
                                    content: Text(res == 'permission'
                                        ? 'Autorise Tiya à installer des applications, puis réessaie.'
                                        : 'Téléchargement de Tiya ${r['latest']}…')));
                              } else {
                                messenger.showSnackBar(SnackBar(
                                    content: Text(r['error'] != null
                                        ? 'Vérification impossible : ${r['error']}'
                                        : 'Tiya est à jour (${r['current'] ?? _version}).')));
                              }
                            },
                            icon: const Icon(Icons.system_update_rounded),
                            label: const Text('Rechercher une mise à jour'),
                          ),
                          const SizedBox(height: 26),
                          Center(
                            child: Column(children: [
                              const TiyaLogo(size: 22, color: Color(0xFF8B93AD)),
                              const SizedBox(height: 8),
                              Text('Tiya $_version · cuervo.co',
                                  style: const TextStyle(fontSize: 12, color: TiyaColors.faint)),
                            ]),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
