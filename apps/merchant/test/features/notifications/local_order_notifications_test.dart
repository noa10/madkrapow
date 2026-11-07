import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/notifications/data/local_order_notifications.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences.dart';
import 'package:madkrapow_merchant/features/notifications/data/order_notification.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const orderId = 'ef72d60e-9e92-4b0a-a0a9-cd3b4095780a';
  const otherOrderId = 'af72d60e-9e92-4b0a-a0a9-cd3b4095780b';
  const nativeChannel = MethodChannel(
    'com.madkrapow.merchant/order_notifications',
  );
  const localChannel = MethodChannel(
    'dexterous.com/flutter/local_notifications',
  );
  final nativeCalls = <MethodCall>[];
  final localCalls = <MethodCall>[];
  String? launchPayload;
  PlatformException? nativeFailure;
  PlatformException? initializeFailure;

  Future<void> tap(String? payload) async {
    final response = TestDefaultBinaryMessengerBinding
        .instance
        .defaultBinaryMessenger
        .handlePlatformMessage(
          localChannel.name,
          const StandardMethodCodec().encodeMethodCall(
            MethodCall('didReceiveNotificationResponse', {
              'notificationId': 0,
              'notificationResponseType': 0,
              'payload': payload,
            }),
          ),
          (_) {},
        );
    await response;
  }

  setUp(() {
    AndroidFlutterLocalNotificationsPlugin.registerWith();
    nativeCalls.clear();
    localCalls.clear();
    launchPayload = null;
    nativeFailure = null;
    initializeFailure = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(nativeChannel, (call) async {
          nativeCalls.add(call);
          if (nativeFailure != null) throw nativeFailure!;
          return null;
        });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(localChannel, (call) async {
          localCalls.add(call);
          if (call.method == 'initialize') {
            if (initializeFailure != null) throw initializeFailure!;
            return true;
          }
          if (call.method == 'getNotificationAppLaunchDetails') {
            return {
              'notificationLaunchedApp': launchPayload != null,
              if (launchPayload != null)
                'notificationResponse': {
                  'notificationId': 0,
                  'notificationResponseType': 0,
                  'payload': launchPayload,
                },
            };
          }
          return null;
        });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(nativeChannel, null);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(localChannel, null);
  });

  test('prepares channels before a notification can launch the app', () async {
    launchPayload = jsonEncode(
      const OrderNotification(orderId: orderId, eventId: 'event-1').toData(),
    );
    final local = LocalOrderNotifications();

    await local.initialize();

    final channels = localCalls
        .where((call) => call.method == 'createNotificationChannel')
        .toList();
    expect(channels, hasLength(orderNotificationChannels.length));
    expect(localCalls.first.method, 'initialize');
    expect(localCalls.last.method, 'getNotificationAppLaunchDetails');
    expect(local.takeInitialPayload(), launchPayload);
    expect(local.takeInitialPayload(), isNull);
  });

  test('retains an early tap until the root handler subscribes', () async {
    final local = LocalOrderNotifications();
    await local.initialize();
    expect(local.takeInitialPayload(), isNull);

    await tap('early-order-payload');

    expect(local.takeInitialPayload(), 'early-order-payload');
    expect(local.takeInitialPayload(), isNull);
  });

  test(
    'delivers live taps through the stream and ignores null payloads',
    () async {
      final local = LocalOrderNotifications();
      await local.initialize();
      final received = <String>[];
      final subscription = local.taps.listen(received.add);

      await tap(null);
      await tap('opened-order-payload');
      await Future<void>.delayed(Duration.zero);

      expect(received, ['opened-order-payload']);
      expect(local.takeInitialPayload(), isNull);
      await subscription.cancel();
    },
  );

  test(
    'surfaces an OS initialization failure before preparing channels',
    () async {
      initializeFailure = PlatformException(code: 'UNAVAILABLE');

      await expectLater(
        LocalOrderNotifications().initialize(),
        throwsA(isA<PlatformException>()),
      );

      expect(localCalls.map((call) => call.method), ['initialize']);
    },
  );

  test(
    'Android foreground alerts share the FCM order tag and fixed id',
    () async {
      final local = LocalOrderNotifications();
      await local.show(
        const OrderNotification(orderId: orderId, eventId: 'event-1'),
        null,
        const NotificationPreferences(),
      );
      await local.show(
        const OrderNotification(
          orderId: orderId,
          eventId: 'event-1',
          repeatNumber: 1,
        ),
        null,
        const NotificationPreferences(),
      );
      await local.show(
        const OrderNotification(orderId: otherOrderId, eventId: 'event-2'),
        null,
        const NotificationPreferences(),
      );

      expect(nativeCalls, hasLength(3));
      expect(nativeCalls.map((call) => call.method), everyElement('show'));
      expect(nativeCalls.first.arguments['id'], 0);
      expect(nativeCalls.first.arguments['tag'], 'merchant-order-$orderId');
      expect(nativeCalls[1].arguments['tag'], 'merchant-order-$orderId');
      expect(nativeCalls.last.arguments['tag'], 'merchant-order-$otherOrderId');
      expect(
        jsonDecode(
          nativeCalls.first.arguments['payload'] as String,
        )['order_id'],
        orderId,
      );
      expect(
        jsonDecode(nativeCalls.last.arguments['payload'] as String)['order_id'],
        otherOrderId,
      );
      expect(localCalls, isEmpty);
    },
  );

  test(
    'dismisses only the opened order, even without an FCM event id',
    () async {
      await LocalOrderNotifications().dismissOrder(orderId);

      expect(localCalls, hasLength(1));
      expect(localCalls.single.method, 'cancel');
      expect(localCalls.single.arguments, {
        'id': 0,
        'tag': 'merchant-order-$orderId',
      });
    },
  );

  test('does not dismiss notifications for malformed order ids', () async {
    await LocalOrderNotifications().dismissOrder('../other-order');
    expect(localCalls, isEmpty);
  });

  test('passes the saved channel and alert preferences to Android', () async {
    await LocalOrderNotifications().show(
      const OrderNotification(orderId: orderId, eventId: 'event-1'),
      null,
      const NotificationPreferences(sound: false, vibration: false),
    );

    expect(
      nativeCalls.single.arguments,
      containsPair('channelId', 'merchant_orders_silent'),
    );
    expect(nativeCalls.single.arguments, containsPair('playSound', false));
    expect(
      nativeCalls.single.arguments,
      containsPair('enableVibration', false),
    );
  });

  test(
    'surfaces Android posting failures so the handler can log them',
    () async {
      nativeFailure = PlatformException(code: 'ORDER_NOTIFICATION_FAILED');

      await expectLater(
        LocalOrderNotifications().show(
          const OrderNotification(orderId: orderId, eventId: 'event-1'),
          null,
          const NotificationPreferences(),
        ),
        throwsA(
          isA<PlatformException>().having(
            (error) => error.code,
            'code',
            'ORDER_NOTIFICATION_FAILED',
          ),
        ),
      );
    },
  );

  test(
    'a test alert carries no order payload and cannot open an order',
    () async {
      await LocalOrderNotifications().showTest(
        const NotificationPreferences(alertSound: AlertSound.system),
      );

      expect(localCalls.single.method, 'show');
      expect(localCalls.single.arguments['payload'], '');
      expect(localCalls.single.arguments['id'], isNot(0));
      expect(nativeCalls, isEmpty);
    },
  );

  test(
    'iOS preserves local order identity when presenting and dismissing',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      IOSFlutterLocalNotificationsPlugin.registerWith();
      final local = LocalOrderNotifications();
      await local.initialize();
      await local.show(
        const OrderNotification(orderId: orderId, eventId: 'event-1'),
        const RemoteNotification(
          title: 'Order MK-1001',
          body: 'Ready to review',
        ),
        const NotificationPreferences(sound: false),
      );
      await local.dismissOrder(orderId);

      final shown = localCalls.singleWhere((call) => call.method == 'show');
      final canceled = localCalls.singleWhere(
        (call) => call.method == 'cancel',
      );
      expect(shown.arguments['title'], 'Order MK-1001');
      expect(shown.arguments['body'], 'Ready to review');
      expect(shown.arguments['platformSpecifics']['presentSound'], isFalse);
      expect(canceled.arguments, shown.arguments['id']);
      expect(
        localCalls.where((call) => call.method == 'createNotificationChannel'),
        isEmpty,
      );
      expect(nativeCalls, isEmpty);
    },
  );
}
