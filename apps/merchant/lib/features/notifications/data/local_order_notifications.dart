import 'dart:async';
import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'notification_preferences.dart';
import 'order_notification.dart';

/// The same Android channel is used by FCM in the background and by local
/// notifications when the app is in the foreground.
class LocalOrderNotifications {
  static const _androidOrders = MethodChannel(
    'com.madkrapow.merchant/order_notifications',
  );
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
    if (defaultTargetPlatform == TargetPlatform.android) {
      final channel = orderNotificationChannels.firstWhere(
        (candidate) => candidate.id == preferences.channelId,
      );
      // The adapter posts with FCM's ID zero while giving each order a unique
      // PendingIntent category. The local plugin uses the numeric ID alone for
      // its tap intent, which would route every ID-zero alert to the last order.
      return _androidOrders.invokeMethod<void>('show', {
        'id': 0,
        'orderId': order.orderId,
        'tag': OrderNotification.androidTagForOrder(order.orderId),
        'title': message?.title ?? 'New order',
        'body': message?.body ?? 'Tap to view the order.',
        'channelId': channel.id,
        'playSound': preferences.sound,
        'enableVibration': preferences.vibration,
        'rawSound': channel.rawSound,
        'payload': jsonEncode(order.toData()),
      });
    }
    return _plugin.show(
      OrderNotification.localIdForOrder(order.orderId),
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

  /// Opening an order from any route dismisses its alert without clearing
  /// other orders. An event ID is deliberately not needed here.
  Future<void> dismissOrder(String orderId) async {
    if (!OrderNotification.isValidOrderId(orderId)) return;
    if (defaultTargetPlatform == TargetPlatform.android) {
      await _plugin.cancel(
        0,
        tag: OrderNotification.androidTagForOrder(orderId),
      );
    } else {
      await _plugin.cancel(OrderNotification.localIdForOrder(orderId));
    }
  }

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
