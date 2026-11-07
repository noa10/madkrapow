import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../../main.dart' show firebaseInitialized, localOrderNotifications;
import '../data/device_identity.dart';
import '../data/fcm_repository.dart';
import '../data/local_order_notifications.dart';
import '../data/notification_preferences.dart';
import '../data/notification_preferences_repository.dart';
import '../data/notification_preferences_store.dart';
import '../data/order_view_acknowledger.dart';
import '../data/viewed_order_registry.dart';

/// Stable installation identity shared by FCM registration and settings.
final deviceIdentityProvider = Provider<DeviceIdentity>((ref) {
  return DeviceIdentity();
});

/// Per-process record of orders already opened on this installation.
final viewedOrderRegistryProvider = Provider<ViewedOrderRegistry>((ref) {
  return ViewedOrderRegistry();
});

/// Acknowledges an opened order so the server stops this device's repeats.
final orderViewAcknowledgerProvider = Provider<OrderViewAcknowledger>((ref) {
  return OrderViewAcknowledger(
    ref.watch(supabaseProvider),
    ref.watch(deviceIdentityProvider),
  );
});

/// Overridden in `main()` with the loaded [SharedPreferences] instance.
final notificationPreferencesStoreProvider =
    Provider<NotificationPreferencesStore>((ref) {
      throw UnimplementedError(
        'notificationPreferencesStoreProvider must be overridden',
      );
    });

final notificationPreferencesRepositoryProvider =
    Provider<NotificationPreferencesRepository>((ref) {
      return NotificationPreferencesRepository(
        ref.watch(supabaseProvider),
        ref.watch(deviceIdentityProvider),
        ref.watch(notificationPreferencesStoreProvider),
      );
    });

/// The device's current preferences. Local values are the immediate source for
/// the UI and foreground alerts; every successful save mirrors them to the
/// server row used by the worker.
class NotificationPreferencesController
    extends Notifier<NotificationPreferences> {
  @override
  NotificationPreferences build() {
    return ref.watch(notificationPreferencesStoreProvider).read();
  }

  Future<bool> update(NotificationPreferences next) async {
    final saved = await ref
        .read(notificationPreferencesRepositoryProvider)
        .save(next);
    if (saved) state = next;
    return saved;
  }
}

final notificationPreferencesControllerProvider =
    NotifierProvider<
      NotificationPreferencesController,
      NotificationPreferences
    >(NotificationPreferencesController.new);

/// Provides the FcmRepository instance.
final fcmRepositoryProvider = Provider<FcmRepository>((ref) {
  final repository = FcmRepository(
    ref.watch(supabaseProvider),
    identity: ref.watch(deviceIdentityProvider),
    preferences: ref.watch(notificationPreferencesStoreProvider),
  );
  ref.onDispose(() => unawaited(repository.dispose()));
  return repository;
});

/// The initialized local-notification service, or null when Firebase or the
/// plugin failed to start.
final localOrderNotificationsProvider = Provider<LocalOrderNotifications?>(
  (ref) => localOrderNotifications,
);

enum NotificationPermissionState { unavailable, granted, denied, notDetermined }

/// OS notification permission, exposed as a provider so the settings screen can
/// be tested without Firebase.
final notificationPermissionProvider =
    FutureProvider<NotificationPermissionState>((ref) async {
      if (!firebaseInitialized) {
        return NotificationPermissionState.unavailable;
      }
      final settings = await FirebaseMessaging.instance
          .getNotificationSettings();
      return switch (settings.authorizationStatus) {
        AuthorizationStatus.authorized ||
        AuthorizationStatus.provisional => NotificationPermissionState.granted,
        AuthorizationStatus.denied => NotificationPermissionState.denied,
        AuthorizationStatus.notDetermined =>
          NotificationPermissionState.notDetermined,
      };
    });
