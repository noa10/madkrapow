import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/notifications/data/order_notification.dart';

void main() {
  const orderId = 'ef72d60e-9e92-4b0a-a0a9-cd3b4095780a';
  const data = {
    'type': 'new_order',
    'order_id': orderId,
    'event_id': 'event-1',
  };

  test(
    'only accepts new-order payloads with a valid order UUID and event id',
    () {
      final notification = OrderNotification.fromData(data);
      expect(notification?.orderId, orderId);
      expect(notification?.eventId, 'event-1');
      expect(OrderNotification.fromData({...data, 'type': 'other'}), isNull);
      expect(
        OrderNotification.fromData({...data, 'order_id': '../orders'}),
        isNull,
      );
      expect(OrderNotification.fromData({...data, 'order_id': 42}), isNull);
      expect(OrderNotification.fromData({...data, 'event_id': ''}), isNull);
    },
  );

  test('parses repeat sequence tolerantly and includes it in the payload', () {
    expect(OrderNotification.fromData(data)?.repeatNumber, 0);
    expect(
      OrderNotification.fromData({...data, 'repeat': '3'})?.repeatNumber,
      3,
    );
    expect(
      OrderNotification.fromData({...data, 'repeat': 90})?.repeatNumber,
      90,
    );
    expect(
      OrderNotification.fromData({...data, 'repeat': '91'})?.repeatNumber,
      0,
    );
    expect(
      OrderNotification.fromData({...data, 'repeat': '-1'})?.repeatNumber,
      0,
    );
    expect(
      OrderNotification.fromData({...data, 'repeat': 'nope'})?.repeatNumber,
      0,
    );
    expect(
      OrderNotification.fromData({...data, 'repeat': 2.5})?.repeatNumber,
      0,
    );
    expect(
      OrderNotification.fromData({...data, 'repeat': '4'})?.toData()['repeat'],
      '4',
    );
  });

  test('uses the repeat sequence in the foreground dedupe key', () {
    final first = OrderNotification.fromData(data)!;
    final firstRepeat = OrderNotification.fromData({...data, 'repeat': '1'})!;
    expect(first.dedupeKey, 'event-1#0');
    expect(firstRepeat.dedupeKey, 'event-1#1');
    expect(firstRepeat.dedupeKey, isNot(first.dedupeKey));
  });

  test(
    'uses a stable order identity independent of event, repeat, or casing',
    () {
      expect(
        OrderNotification.androidTagForOrder(orderId.toUpperCase()),
        'merchant-order-$orderId',
      );
      expect(
        OrderNotification.localIdForOrder(orderId.toUpperCase()),
        OrderNotification.localIdForOrder(orderId),
      );
      expect(OrderNotification.isValidOrderId(orderId), isTrue);
      expect(OrderNotification.isValidOrderId('../orders'), isFalse);
    },
  );

  test('holds a tap until both authentication and routing are ready', () {
    final queue = NotificationTapQueue();
    queue.add(data);
    expect(queue.takeIfReady(authReady: false, routerReady: true), isNull);
    expect(queue.takeIfReady(authReady: true, routerReady: false), isNull);
    expect(
      queue.takeIfReady(authReady: true, routerReady: true)?.orderId,
      orderId,
    );
    expect(queue.takeIfReady(authReady: true, routerReady: true), isNull);
    queue.add(data);
    expect(queue.takeIfReady(authReady: true, routerReady: true), isNull);
  });

  test('ignores invalid taps and keeps the most recent distinct tap', () {
    final queue = NotificationTapQueue();
    queue.add(data);
    queue.add({...data, 'order_id': 'invalid', 'event_id': 'bad'});
    expect(
      queue.takeIfReady(authReady: true, routerReady: true)?.eventId,
      'event-1',
    );
    queue.add(data);
    queue.add({...data, 'event_id': 'event-2'});
    expect(
      queue.takeIfReady(authReady: true, routerReady: true)?.eventId,
      'event-2',
    );
  });

  test(
    'foreground duplicate event ids are suppressed separately from taps',
    () {
      final seen = NotificationEventDeduplicator();
      expect(seen.accept('event-1'), isTrue);
      expect(seen.accept('event-1'), isFalse);
      expect(seen.accept('event-2'), isTrue);
      final queue = NotificationTapQueue();
      queue.add(data);
      expect(
        queue.takeIfReady(authReady: true, routerReady: true)?.eventId,
        'event-1',
      );
    },
  );
}
