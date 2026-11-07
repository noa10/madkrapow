/// The data contract shared by FCM and foreground local-notification taps.
class OrderNotification {
  const OrderNotification({
    required this.orderId,
    required this.eventId,
    this.repeatNumber = 0,
  });

  final String orderId;
  final String eventId;
  final int repeatNumber;

  String get dedupeKey => '$eventId#$repeatNumber';

  /// Android/FCM identifies a tray entry by both tag and integer ID. FCM uses
  /// ID zero, so the full order UUID in the tag distinguishes separate orders.
  static String androidTagForOrder(String orderId) =>
      'merchant-order-${orderId.toLowerCase()}';

  /// Platforms without Android tags require a stable integer local ID.
  static int localIdForOrder(String orderId) =>
      orderId.toLowerCase().codeUnits.fold<int>(
        0x811c9dc5,
        (hash, unit) => ((hash ^ unit) * 0x01000193) & 0xffffffff,
      ) &
      0x7fffffff;

  static final _uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  static bool isValidOrderId(String orderId) => _uuid.hasMatch(orderId);

  static int _repeatNumber(Object? repeat) {
    final value = repeat is String
        ? int.tryParse(repeat)
        : repeat is int
        ? repeat
        : null;
    if (value == null || value < 0 || value > 90) return 0;
    return value;
  }

  static OrderNotification? fromData(Map<String, dynamic> data) {
    final orderId = data['order_id'];
    final eventId = data['event_id'];
    if (data['type'] != 'new_order' ||
        orderId is! String ||
        !isValidOrderId(orderId) ||
        eventId is! String ||
        eventId.trim().isEmpty ||
        eventId.length > 200) {
      return null;
    }
    return OrderNotification(
      orderId: orderId,
      eventId: eventId,
      repeatNumber: _repeatNumber(data['repeat']),
    );
  }

  Map<String, String> toData() => {
    'type': 'new_order',
    'order_id': orderId,
    'event_id': eventId,
    'repeat': repeatNumber.toString(),
  };
}

/// Bounds in-memory deduplication without suppressing a later tap on a shown alert.
class NotificationEventDeduplicator {
  final _seen = <String>{};

  bool accept(String eventId) {
    if (!_seen.add(eventId)) return false;
    if (_seen.length > 256) _seen.remove(_seen.first);
    return true;
  }

  /// A new account must not inherit the previous session's suppression state.
  void clear() => _seen.clear();
}

/// Keep the latest tap until the staff session and router are ready.
class NotificationTapQueue {
  final _handled = NotificationEventDeduplicator();
  OrderNotification? _pending;

  bool get hasPending => _pending != null;

  void add(Map<String, dynamic> data) {
    final notification = OrderNotification.fromData(data);
    if (notification != null) _pending = notification;
  }

  OrderNotification? takeIfReady({
    required bool authReady,
    required bool routerReady,
  }) {
    if (!authReady || !routerReady) return null;
    final notification = _pending;
    _pending = null;
    if (notification == null || !_handled.accept(notification.eventId)) {
      return null;
    }
    return notification;
  }

  void clear() => _pending = null;
}
