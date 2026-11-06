import 'package:flutter/services.dart';

/// Pont vers le code Kotlin (service d'accessibilité + agent).
class Native {
  static const _m = MethodChannel('tiya/native');
  static const _e = EventChannel('tiya/events');

  static Stream<Map<String, dynamic>> events() => _e
      .receiveBroadcastStream()
      .map((e) => Map<String, dynamic>.from(e as Map));

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
