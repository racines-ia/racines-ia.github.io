import 'package:flutter/services.dart';

/// Pont vers le code Kotlin (service d'accessibilité + agent).
class Native {
  static const _m = MethodChannel('tiya/native');
  static const _e = EventChannel('tiya/events');

  // Un seul flux partagé : le canal natif n'accepte qu'un abonné à la fois.
  static final Stream<Map<String, dynamic>> _events = _e
      .receiveBroadcastStream()
      .map((e) => Map<String, dynamic>.from(e as Map))
      .asBroadcastStream();

  static Stream<Map<String, dynamic>> events() => _events;

  static List<Map<String, dynamic>> _list(dynamic r) =>
      ((r as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  // ---------------- contacts
  static Future<List<Map<String, dynamic>>> contacts() async => _list(await _m.invokeMethod('contacts'));
  static Future<void> setAlias({required String name, required String number, required String alias, String? old}) =>
      _m.invokeMethod('setAlias', {'name': name, 'number': number, 'alias': alias, 'old': old});

  // ---------------- messages automatiques
  static Future<List<Map<String, dynamic>>> autoList() async => _list(await _m.invokeMethod('autoList'));
  static Future<Map<String, dynamic>> autoSave(Map<String, dynamic> item) async =>
      Map<String, dynamic>.from(await _m.invokeMethod('autoSave', item) as Map);
  static Future<void> autoDelete(String id) => _m.invokeMethod('autoDelete', {'id': id});
  static Future<String> autoSendNow(String id) async =>
      ((await _m.invokeMethod('autoSendNow', {'id': id})) ?? '').toString();
  static Future<String> autoPreview(Map<String, dynamic> item) async =>
      ((await _m.invokeMethod('autoPreview', item)) ?? '').toString();

  // ---------------- programme
  static Future<List<Map<String, dynamic>>> agendaList() async => _list(await _m.invokeMethod('agendaList'));
  static Future<Map<String, dynamic>> agendaSave(Map<String, dynamic> item) async =>
      Map<String, dynamic>.from(await _m.invokeMethod('agendaSave', item) as Map);
  static Future<void> agendaDelete(String id) => _m.invokeMethod('agendaDelete', {'id': id});

  static Future<String?> kvGet(String k) async => (await _m.invokeMethod('kvGet', {'k': k})) as String?;
  static Future<void> kvSet(String k, String? v) => _m.invokeMethod('kvSet', {'k': k, 'v': v});

  static Future<void> requestNotifications() => _m.invokeMethod('requestNotifications');
  static Future<void> requestSms() => _m.invokeMethod('requestSms');

  static Future<Map<String, dynamic>> status() async {
    final r = await _m.invokeMethod('status');
    return Map<String, dynamic>.from(r as Map);
  }

  static Future<Map<String, dynamic>> getSettings() async {
    final r = await _m.invokeMethod('getSettings');
    return Map<String, dynamic>.from(r as Map);
  }

  static Future<void> saveSettings(Map<String, dynamic> s) =>
      _m.invokeMethod('saveSettings', s);

  static Future<List<Map<String, dynamic>>> history() async {
    final r = await _m.invokeMethod('history');
    return (r as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  static Future<void> clearHistory() => _m.invokeMethod('clearHistory');
  static Future<void> startTask(String text) =>
      _m.invokeMethod('startTask', {'text': text});
  static Future<void> stopTask() => _m.invokeMethod('stopTask');
  static Future<void> reply(String text) =>
      _m.invokeMethod('reply', {'text': text});
  static Future<void> confirm(bool yes) =>
      _m.invokeMethod('confirm', {'yes': yes});
  static Future<bool> listen() async =>
      (await _m.invokeMethod('listen')) == true;
  static Future<void> stopListening() => _m.invokeMethod('stopListening');
  static Future<void> openAccessibilitySettings() =>
      _m.invokeMethod('openAccessibilitySettings');
  static Future<void> openAppSettings() => _m.invokeMethod('openAppSettings');
  static Future<void> requestMic() => _m.invokeMethod('requestMic');

  static Future<void> requestContacts() => _m.invokeMethod('requestContacts');

  static Future<List<Map<String, dynamic>>> listVoices() async {
    final r = await _m.invokeMethod('listVoices');
    return ((r as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  static Future<void> previewVoice(String name, double rate, double pitch) =>
      _m.invokeMethod('previewVoice', {'name': name, 'rate': rate, 'pitch': pitch});

  static Future<Map<String, dynamic>> version() async {
    final r = await _m.invokeMethod('version');
    return Map<String, dynamic>.from(r as Map);
  }

  static Future<Map<String, dynamic>> checkUpdate() async {
    final r = await _m.invokeMethod('checkUpdate');
    return Map<String, dynamic>.from(r as Map);
  }

  /// Renvoie "started" ou "permission" (autorisation d'installer à donner).
  static Future<String> downloadUpdate(String url, String version) async {
    final r = await _m.invokeMethod('downloadUpdate', {'url': url, 'version': version});
    return (r ?? '').toString();
  }

  static Future<Map<String, dynamic>> testKey() async {
    final r = await _m.invokeMethod('testKey');
    return Map<String, dynamic>.from(r as Map);
  }
}
