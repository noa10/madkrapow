import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_order_payload.dart';

const List<Map<String, dynamic>> _items = [
  {
    'menu_item_id': 'm1',
    'quantity': 2,
    'modifier_ids': ['mod1'],
  },
];

void main() {
  group('buildPosOrderPayload', () {
    test('always carries the chosen payment method', () {
      final payload = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.takeAway,
        paymentMethod: PosPaymentMethod.cash,
      );

      expect(payload['payment_method'], 'cash');
    });

    test('never sends the removed payment_timing key', () {
      final payload = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.takeAway,
        paymentMethod: PosPaymentMethod.qrPay,
      );

      // The server rejects a stale client that still sends `payment_timing`
      // with 400 "Reload the POS to update before charging — this page is
      // running an older version."
      expect(payload.containsKey('payment_timing'), isFalse);
      expect(payload['payment_method'], 'qr_pay');
    });

    test('a dine-in order carries the table and the pax', () {
      final payload = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.dineIn,
        paymentMethod: PosPaymentMethod.cash,
        tableId: 't1',
        pax: 4,
      );

      expect(payload['order_type'], 'dine_in');
      expect(payload['table_id'], 't1');
      expect(payload['pax'], 4);
    });

    test('a take-away order carries neither the table nor the pax', () {
      final payload = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.takeAway,
        paymentMethod: PosPaymentMethod.cash,
        tableId: 't1',
        pax: 4,
      );

      expect(payload['order_type'], 'take_away');
      expect(payload.containsKey('table_id'), isFalse);
      expect(payload.containsKey('pax'), isFalse);
    });

    test('trims the customer name and drops it when blank', () {
      final trimmed = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.takeAway,
        paymentMethod: PosPaymentMethod.cash,
        customerName: '  Aina  ',
      );
      final blank = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.takeAway,
        paymentMethod: PosPaymentMethod.cash,
        customerName: '   ',
      );
      final missing = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.takeAway,
        paymentMethod: PosPaymentMethod.cash,
      );

      expect(trimmed['customer_name'], 'Aina');
      expect(blank.containsKey('customer_name'), isFalse);
      expect(missing.containsKey('customer_name'), isFalse);
    });

    test('passes the item lines through untouched', () {
      final payload = buildPosOrderPayload(
        items: _items,
        orderType: PosOrderType.takeAway,
        paymentMethod: PosPaymentMethod.cash,
      );

      expect(payload['items'], _items);
    });
  });
}
