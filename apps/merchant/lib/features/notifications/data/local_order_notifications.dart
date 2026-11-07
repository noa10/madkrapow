import 'dart:async';
import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'notification_preferences.dart';
import 'order_notification.dart';

/// The same Android channel is used by FCM in the background and by local
/// notifications when the app is in the foreground.
class LocalOrderNotifications {
  final _plugin = FlutterLocalNotificationsPlugin();
  final _taps = StreamController<String>.broadcast();
  String? _initialPayload;

  Stream<String> get taps => _taps.stream;

  Future<void> initialize() async {
    await _plugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('ic_order_notification'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null) return;
        if (_taps.hasListener) {
          _taps.add(payload);
        } else {
          _initialPayload = payload;
        }
      },
    );

    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    // Every channel is created up front: the worker targets the channel for
    // the device's saved sound, so it must exist without waiting for a
    // restart after the choice changes.
    for (final channel in orderNotificationChannels) {
      await android?.createNotificationChannel(
        AndroidNotificationChannel(
          channel.id,
          channel.name,
          description: channel.description,
          importance: Importance.high,
          playSound: channel.sound,
          enableVibration: channel.vibration,
          sound: channel.rawSound == null
              ? null
              : RawResourceAndroidNotificationSound(channel.rawSound!),
        ),
      );
    }

    final launch = await _plugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp == true) {
      _initialPayload = launch?.notificationResponse?.payload;
    }
  }

  String? takeInitialPayload() {
    final payload = _initialPayload;
    _initialPayload = null;
    return payload;
  }

  Future<void> show(
    OrderNotification order,
    RemoteNotification? message,
    NotificationPreferences preferences,
  ) {
    return _plugin.show(
      order.eventId.hashCode & 0x7fffffff,
      message?.title ?? 'New order',
      message?.body ?? 'Tap to view the order.',
      _details(preferences),
      payload: jsonEncode(order.toData()),
    );
  }

  /// A local-only alert that never carries an order payload, so tapping it
  /// cannot open a stale or made-up order.
  Future<void> showTest(NotificationPreferences preferences) {
    return _plugin.show(
      0x7ffffffe,
      'Test alert',
      'Order notifications are working on this device.',
      _details(preferences),
    );
  }

  Future<void> cancelAll() => _plugin.cancelAll();

  NotificationDetails _details(NotificationPreferences preferences) {
    final channel = orderNotificationChannels.firstWhere(
      (candidate) => candidate.id == preferences.channelId,
    );
    return NotificationDetails(
      android: AndroidNotificationDetails(
        channel.id,
        channel.name,
        channelDescription: channel.description,
        importance: Importance.high,
        priority: Priority.high,
        playSound: preferences.sound,
        enableVibration: preferences.vibration,
        onlyAlertOnce: false,
        icon: 'ic_order_notification',
        sound: channel.rawSound == null
            ? null
            : RawResourceAndroidNotificationSound(channel.rawSound!),
      ),
      iOS: DarwinNotificationDetails(
        presentAlert: true,
        presentSound: preferences.sound,
      ),
    );
  }
}
