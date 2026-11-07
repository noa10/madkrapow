import 'package:shared_preferences/shared_preferences.dart';

import 'notification_preferences.dart';

/// Local copy of this device's preferences.
///
/// The server row is the source of truth for background delivery; this store
/// keeps the UI instant and restores the values after a sign-out deletes the
/// server row.
class NotificationPreferencesStore {
  NotificationPreferencesStore(this._prefs);

  final SharedPreferences _prefs;

  static const orderAlertsKey = 'order_alerts_enabled';
  static const soundKey = 'sound_enabled';
  static const vibrationKey = 'vibration_enabled';
  static const repeatUntilViewedKey = 'repeat_until_viewed_enabled';
  static const alertSoundKey = 'alert_sound';

  NotificationPreferences read() {
    return NotificationPreferences(
      orderAlerts: _prefs.getBool(orderAlertsKey) ?? true,
      sound: _prefs.getBool(soundKey) ?? true,
      vibration: _prefs.getBool(vibrationKey) ?? true,
      repeatUntilViewed: _prefs.getBool(repeatUntilViewedKey) ?? true,
      alertSound: AlertSound.fromWire(_prefs.getString(alertSoundKey)),
    );
  }

  Future<void> write(NotificationPreferences preferences) async {
    await Future.wait([
      _prefs.setBool(orderAlertsKey, preferences.orderAlerts),
      _prefs.setBool(soundKey, preferences.sound),
      _prefs.setBool(vibrationKey, preferences.vibration),
      _prefs.setBool(repeatUntilViewedKey, preferences.repeatUntilViewed),
      _prefs.setString(alertSoundKey, preferences.alertSound.name),
    ]);
  }
}
