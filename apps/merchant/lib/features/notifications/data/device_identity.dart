import 'dart:convert';
import 'dart:math';

import 'package:hive/hive.dart';

/// Stable random installation id stored in the Hive `fcm` box.
///
/// The server treats it as a capability, not a hardware identifier. Keeping it
/// in one place lets both the FCM repository and the settings repository use
/// the same device row.
class DeviceIdentity {
  static final _validDeviceId = RegExp(r'^[A-Za-z0-9_-]{22,128}$');

  Future<String>? _id;

  Future<String> get id => _id ??= _load();

  Future<String> _load() async {
    try {
      final box = await Hive.openBox('fcm');
      final existing = box.get('device_id') as String?;
      // The server rejects a malformed installation id permanently, so replace
      // one left behind by an older build instead of retrying it forever.
      if (existing != null && _validDeviceId.hasMatch(existing)) {
        return existing;
      }
      final random = Random.secure();
      final deviceId = base64UrlEncode(
        List<int>.generate(16, (_) => random.nextInt(256)),
      ).replaceAll('=', '');
      await box.put('device_id', deviceId);
      return deviceId;
    } catch (_) {
      _id = null;
      rethrow;
    }
  }
}
