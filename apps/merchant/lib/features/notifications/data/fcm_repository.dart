import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/constants/roles.dart';
import '../../../main.dart' show firebaseInitialized;
import 'device_identity.dart';
import 'notification_preferences_repository.dart';
import 'notification_preferences_store.dart';
import 'token_registration_manager.dart';

/// Registers the installation through the authenticated merchant RPC.
class FcmRepository {
  FcmRepository(
    this._supabase, {
    required DeviceIdentity identity,
    required NotificationPreferencesStore preferences,
    FirebaseMessaging? messaging,
  }) : _identity = identity,
       _preferences = preferences,
       _providedMessaging = messaging;

  final SupabaseClient _supabase;
  final DeviceIdentity _identity;
  final NotificationPreferencesStore _preferences;
  final FirebaseMessaging? _providedMessaging;
  FirebaseMessaging get _messaging =>
      _providedMessaging ?? FirebaseMessaging.instance;
  TokenRegistrationManager? _manager;
  bool _signingOut = false;
  bool _disposed = false;

  TokenRegistrationManager get _registrationManager =>
      _manager ??= TokenRegistrationManager(
        tokenRefreshes: _messaging.onTokenRefresh,
        currentUserId: () => _supabase.auth.currentUser?.id,
        getToken: _messaging.getToken,
        register: _register,
      );

  void updateUser(String? userId) {
    if (!firebaseInitialized || _signingOut || _disposed) return;
    _registrationManager.updateUser(userId);
  }

  void retry() {
    if (firebaseInitialized && !_signingOut && !_disposed) _manager?.retry();
  }

  Future<void> _register(String userId, String token) async {
    final deviceId = await _identity.id;
    if (_signingOut || _disposed || _supabase.auth.currentUser?.id != userId) {
      return;
    }
    try {
      await _supabase.rpc(
        'register_merchant_fcm_token',
        params: {
          'p_device_id': deviceId,
          'p_token': token,
          'p_platform': Platform.isIOS ? 'ios' : 'android',
        },
      );
      // The row now exists; mirror this device's local preferences so a
      // reinstall or account switch restores what the staff member chose.
      final saved = await saveNotificationPreferences(
        _supabase,
        deviceId,
        _preferences.read(),
      );
      if (!saved) {
        throw StateError('Notification preferences were not saved');
      }
    } on PostgrestException catch (error) {
      // 42501: not an authorized staff member. 22023: the stored installation
      // id or token shape was rejected. Retrying cannot fix either.
      if (error.code == '42501' || error.code == '22023') {
        throw PermanentRegistrationException(error.code!);
      }
      rethrow;
    }
  }

  /// Delete before ending the session; DELETE is restricted to its own row.
  Future<void> deleteToken() async {
    _signingOut = true;
    await _manager?.stop();
    try {
      final user = _supabase.auth.currentUser;
      if (user != null) {
        final deviceId = await _identity.id;
        await _supabase
            .from('fcm_tokens')
            .delete()
            .eq('user_id', user.id)
            .eq('device_id', deviceId);
      }
    } finally {
      // Invalidate the FCM token even when the session or row is already gone:
      // the next send then reports UNREGISTERED and the worker removes the row.
      await _invalidateFcmToken();
    }
  }

  /// Session ended without the explicit sign-out path (expiry, remote
  /// revocation). Stop registration and invalidate the token locally so the
  /// device stops receiving the previous user's order alerts.
  Future<void> invalidate() async {
    if (_signingOut || _disposed) return;
    _signingOut = true;
    try {
      await _manager?.stop();
      await _invalidateFcmToken();
    } finally {
      // A new session may have arrived while token deletion was in flight.
      // Resume only after invalidating the old token, using the current role.
      finishSignOut();
    }
  }

  Future<void> _invalidateFcmToken() async {
    if (!firebaseInitialized) return;
    try {
      await _messaging.deleteToken();
    } catch (_) {
      debugPrint('Could not invalidate the FCM token.');
    }
  }

  /// If Supabase sign-out failed, resume registration for the still-valid user.
  void finishSignOut() {
    _signingOut = false;
    if (_disposed) return;
    final user = _supabase.auth.currentUser;
    final role = user?.appMetadata['role'];
    if (user != null &&
        role is String &&
        StaffRoleExtension.fromString(role) != null) {
      updateUser(user.id);
    } else {
      updateUser(null);
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    await _manager?.dispose();
  }
}
