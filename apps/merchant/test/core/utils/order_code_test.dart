import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/utils/order_code.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';

void main() {
  OrdersRow order(
    String source,
    List<dynamic>? channels, {
    String? code = 'MK-042',
  }) => OrdersRow.fromJson({
    'id': 'order-id',
    'order_number': 'internal-number',
    'source': source,
    'display_code': code,
    'channel_orders': channels,
  });

  test('uses the GrabFood number from the matching channel', () {
    final row = order('grabfood', [
      {'channel': 'foodpanda', 'external_order_number': 'FP-1'},
      {'channel': 'grabfood', 'external_order_number': '  GF-123  '},
    ]);
    expect(getOrderDisplayCode(row), 'GF-123');
    expect(row.id, 'order-id');
    expect(row.orderNumber, 'internal-number');
    expect(row.getField<String>('display_code'), 'MK-042');
  });

  test('uses local code when the GrabFood number is missing or blank', () {
    for (final channels in [
      null,
      <dynamic>[],
      [
        {'channel': 'grabfood', 'external_order_number': null},
      ],
      [
        {'channel': 'grabfood', 'external_order_number': '  '},
      ],
      [
        {'channel': 'foodpanda', 'external_order_number': 'FP-1'},
      ],
    ]) {
      expect(getOrderDisplayCode(order('grabfood', channels)), 'MK-042');
    }
  });

  test('other sources retain the local code even with channel data', () {
    expect(
      getOrderDisplayCode(
        order('web', [
          {'channel': 'grabfood', 'external_order_number': 'GF-123'},
        ]),
      ),
      'MK-042',
    );
  });

  test('missing local and external codes retain the legacy fallback', () {
    expect(
      getOrderDisplayCode(
        order('grabfood', null, code: null),
        DateTime.utc(2026, 1, 1),
      ),
      matches(RegExp(r'^MK-\d{3}$')),
    );
  });
}
