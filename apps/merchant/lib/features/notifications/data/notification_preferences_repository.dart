import 'package:supabase_flutter/supabase_flutter.dart';

import 'device_identity.dart';
import 'notification_preferences.dart';
import 'notification_preferences_store.dart';

/// Mirrors the local preferences to the authenticated device row.
class NotificationPreferencesRepository {
  NotificationPreferencesRepository(
    this._supabase,
    this._identity,
    this._store,
  );

  final SupabaseClient _supabase;
  final DeviceIdentity _identity;
  final NotificationPreferencesStore _store;

  /// Returns false when this installation has not registered yet. The local
  /// copy is only updated after the server accepted the values, so background
  /// and foreground alerts cannot silently disagree.
  Future<bool> save(NotificationPreferences preferences) async {
    final deviceId = await _identity.id;
    final saved = await saveNotificationPreferences(
      _supabase,
      deviceId,
      preferences,
    );
    if (saved) await _store.write(preferences);
    return saved;
  }
}

/// Shared by the settings repository and the post-registration sync.
Future<bool> saveNotificationPreferences(
  SupabaseClient supabase,
  String deviceId,
  NotificationPreferences preferences,
) async {
  final result = await supabase.rpc(
    'set_merchant_notification_preferences_v3',
    params: {
      'p_device_id': deviceId,
      'p_order_alerts': preferences.orderAlerts,
      'p_sound': preferences.sound,
      'p_vibration': preferences.vibration,
      'p_repeat_until_viewed': preferences.repeatUntilViewed,
      'p_alert_sound': preferences.alertSound.name,
    },
  );
  return result == true;
}
