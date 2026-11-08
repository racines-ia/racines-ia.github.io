import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'native.dart';

/// Client de l'API « Agent IA » (serveur Supabase de Tiya).
class AgentApi {
  static const _url = 'https://eebqtggnmuzfrwgunpsa.supabase.co/functions/v1/agent-api';
  static String? _space;
  static String? _key;

  static Future<bool> isRegistered() async {
    _space ??= await Native.kvGet('agent_space');
    _key ??= await Native.kvGet('agent_key');
    return (_space ?? '').isNotEmpty && (_key ?? '').isNotEmpty;
  }

  static String _newKey() {
    final r = Random.secure();
    return List.generate(32, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }

  static Future<Map<String, dynamic>> _call(String action, [Map<String, dynamic> body = const {}]) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 20);
    try {
      final req = await client.postUrl(Uri.parse(_url));
      req.headers.contentType = ContentType.json;
      if (_space != null) req.headers.set('x-tiya-space', _space!);
      if (_key != null) req.headers.set('x-tiya-key', _key!);
      req.add(utf8.encode(jsonEncode({...body, 'action': action})));
      final res = await req.close().timeout(const Duration(seconds: 60));
      final text = await res.transform(utf8.decoder).join();
      final data = text.isEmpty ? <String, dynamic>{} : Map<String, dynamic>.from(jsonDecode(text) as Map);
      if (res.statusCode >= 400 || data['error'] != null) {
        throw AgentError((data['error'] ?? 'Erreur ${res.statusCode}').toString());
      }
      return data;
    } on SocketException {
      throw AgentError('Pas de connexion Internet.');
    } finally {
      client.close();
    }
  }

  static List<Map<String, dynamic>> _items(Map<String, dynamic> r) =>
      ((r['items'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  // ------------------------------------------------------------ espace
  static Future<void> register({required String phone, required String name, String business = ''}) async {
    final key = _newKey();
    final r = await _call('register', {'phone': phone, 'name': name, 'business': business, 'key': key});
    final id = (r['space'] as Map)['id'].toString();
    _space = id;
    _key = key;
    await Native.kvSet('agent_space', id);
    await Native.kvSet('agent_key', key);
    await syncAiKey();
  }

  /// Reprend la clé IA (Gemini ou Claude) déjà enregistrée dans les réglages de Tiya.
  static Future<void> syncAiKey() async {
    final s = await Native.getSettings();
    final provider = (s['provider'] ?? 'gemini').toString();
    await updateSpace({
      'ai_provider': provider,
      'ai_key': provider == 'claude' ? s['claudeKey'] : s['geminiKey'],
      'ai_model': provider == 'claude' ? s['claudeModel'] : s['geminiModel'],
    });
  }

  static Future<void> forget() async {
    _space = null;
    _key = null;
    await Native.kvSet('agent_space', null);
    await Native.kvSet('agent_key', null);
  }

  static Future<Map<String, dynamic>> getSpace() => _call('space_get');
  static Future<Map<String, dynamic>> updateSpace(Map<String, dynamic> f) => _call('space_update', f);
  static Future<Map<String, dynamic>> testWhatsapp() => _call('wa_test');
  static Future<Map<String, dynamic>> askTest(String q) => _call('ask_test', {'question': q});

  // ------------------------------------------------------------ connaissances
  static Future<List<Map<String, dynamic>>> kbList() async => _items(await _call('kb_list'));
  static Future<void> kbSave(Map<String, dynamic> item) => _call('kb_save', item);
  static Future<void> kbDelete(String id) => _call('kb_delete', {'id': id});

  // ------------------------------------------------------------ clients
  static Future<List<Map<String, dynamic>>> clients() async => _items(await _call('clients_list'));
  static Future<void> clientSave(Map<String, dynamic> c) => _call('clients_save', c);
  static Future<void> clientDelete(String id) => _call('clients_delete', {'id': id});
  static Future<int> clientsImport(List<Map<String, dynamic>> items) async =>
      ((await _call('clients_import', {'items': items}))['imported'] as num? ?? 0).toInt();

  // ------------------------------------------------------------ campagnes
  static Future<List<Map<String, dynamic>>> campaigns() async => _items(await _call('campaign_list'));
  static Future<void> campaignCreate(Map<String, dynamic> c) => _call('campaign_create', c);
  static Future<void> campaignCancel(String id) => _call('campaign_cancel', {'id': id});
  static Future<List<Map<String, dynamic>>> campaignItems(String id) async =>
      _items(await _call('campaign_items', {'id': id}));

  // ------------------------------------------------------------ conversations
  static Future<List<Map<String, dynamic>>> conversations() async => _items(await _call('conv_list'));
  static Future<Map<String, dynamic>> messages(String id) => _call('conv_messages', {'id': id});
  static Future<Map<String, dynamic>> send(String id, String text) => _call('conv_send', {'id': id, 'text': text});
  static Future<void> setMode(String id, String mode) => _call('conv_mode', {'id': id, 'mode': mode});
}

class AgentError implements Exception {
  final String message;
  AgentError(this.message);
  @override
  String toString() => message;
}
