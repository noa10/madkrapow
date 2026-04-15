import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:hive/hive.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../main.dart' show firebaseInitialized;

/// Repository for managing FCM device tokens.
class FcmRepository {
  FcmRepository(this._supabase);

  final SupabaseClient _supabase;

  /// Register the current device's FCM token.
  /// Upserts by (user_id, device_id) so each device has one token.
  Future<void> registerToken() async {
    if (!firebaseInitialized) return;

    final user = _supabase.auth.currentUser;
    if (user == null) return;

    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;

    final deviceId = await _getDeviceId();

    await _supabase.from('fcm_tokens').upsert(
      {
        'user_id': user.id,
        'device_id': deviceId,
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
      },
      onConflict: 'user_id,device_id',
    );
  }

  /// Delete the current device's FCM token (on sign-out).
  Future<void> deleteToken() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;

    final deviceId = await _getDeviceId();

    await _supabase
        .from('fcm_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('device_id', deviceId);

    if (firebaseInitialized) {
      await FirebaseMessaging.instance.deleteToken();
    }
  }

  /// Listen for token refresh and update the server.
  void setupTokenRefresh() {
    if (!firebaseInitialized) return;

    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      final deviceId = await _getDeviceId();

      await _supabase.from('fcm_tokens').upsert(
        {
          'user_id': user.id,
          'device_id': deviceId,
          'token': newToken,
          'platform': Platform.isIOS ? 'ios' : 'android',
        },
        onConflict: 'user_id,device_id',
      );
    });
  }

  /// Generate a stable device ID using a Hive box.
  Future<String> _getDeviceId() async {
    // Use a simple box to store a persistent device ID
    final box = await Hive.openBox('fcm');
    var deviceId = box.get('device_id') as String?;
    if (deviceId == null) {
      deviceId = base64UrlEncode(
          List<int>.generate(16, (_) => Random.secure().nextInt(256)),
        ).replaceAll('=', '');
      await box.put('device_id', deviceId);
    }
    return deviceId;
  }
}
