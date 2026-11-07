import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/notifications/data/device_identity.dart';
import 'package:madkrapow_merchant/features/notifications/data/order_view_acknowledger.dart';

const orderId = 'ef72d60e-9e92-4b0a-a0a9-cd3b4095780a';
const deviceId = 'abcdefghijklmnopqrstuvwx';

class FakeDeviceIdentity extends DeviceIdentity {
  FakeDeviceIdentity(this._id);

  final String _id;

  @override
  Future<String> get id async => _id;
}

void main() {
  late List<(String, Map<String, dynamic>)> calls;

  OrderViewAcknowledger acknowledger({
    Object? result = true,
    FakeDeviceIdentity? identity,
  }) {
    calls = [];
    return OrderViewAcknowledger.withRpc((function, params) async {
      calls.add((function, params));
      return result;
    }, identity ?? FakeDeviceIdentity(deviceId));
  }

  test('records the view for this device and order', () async {
    final ack = acknowledger();

    expect(await ack.acknowledge(orderId), isTrue);
    expect(calls, hasLength(1));
    expect(calls.single.$1, 'acknowledge_merchant_order_view');
    expect(calls.single.$2, {'p_device_id': deviceId, 'p_order_id': orderId});
  });

  test('returns false when the server did not record the view', () async {
    expect(await acknowledger(result: false).acknowledge(orderId), isFalse);
    expect(await acknowledger(result: null).acknowledge(orderId), isFalse);
  });

  test('rejects malformed order ids before calling the server', () async {
    final ack = acknowledger();

    expect(await ack.acknowledge('../orders'), isFalse);
    expect(await ack.acknowledge(''), isFalse);
    expect(calls, isEmpty);
  });

  test('propagates network errors so the caller can retry', () async {
    final ack = OrderViewAcknowledger.withRpc(
      (function, params) async => throw Exception('offline'),
      FakeDeviceIdentity(deviceId),
    );

    expect(ack.acknowledge(orderId), throwsException);
  });
}
