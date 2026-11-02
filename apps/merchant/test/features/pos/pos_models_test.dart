import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';

void main() {
  group('wire values', () {
    test('order types match the API enum', () {
      expect(PosOrderType.dineIn.wire, 'dine_in');
      expect(PosOrderType.takeAway.wire, 'take_away');
    });

    test('payment methods match the API enum', () {
      expect(PosPaymentMethod.cash.wire, 'cash');
      expect(PosPaymentMethod.qrPay.wire, 'qr_pay');
    });
  });

  group('PosModifierGroup', () {
    test('is required when the junction flag or the minimum says so', () {
      const byFlag = PosModifierGroup(
        id: 'g1',
        name: 'Spice',
        minSelections: 0,
        maxSelections: 1,
        isRequired: true,
        modifiers: [],
      );
      const byMinimum = PosModifierGroup(
        id: 'g2',
        name: 'Sides',
        minSelections: 2,
        maxSelections: 3,
        isRequired: false,
        modifiers: [],
      );

      expect(byFlag.required, isTrue);
      expect(byFlag.requiredCount, 1);
      expect(byMinimum.required, isTrue);
      expect(byMinimum.requiredCount, 2);
      expect(byMinimum.isSingleChoice, isFalse);
    });

    test('is optional when neither signal requires a pick', () {
      const group = PosModifierGroup(
        id: 'g1',
        name: 'Drinks',
        minSelections: 0,
        maxSelections: 1,
        isRequired: false,
        modifiers: [],
      );

      expect(group.required, isFalse);
      expect(group.isSingleChoice, isTrue);
    });
  });

  group('RestaurantTable', () {
    test('parses a raw PostgREST row', () {
      final table = RestaurantTable.fromJson({
        'id': 't1',
        'label': 'T1',
        'zone': 'Indoor',
        'seats': 4,
        'is_active': true,
        'sort_order': 2,
      });

      expect(table.id, 't1');
      expect(table.label, 'T1');
      expect(table.detail, 'Indoor · 4 seats');
    });

    test('detail omits an empty zone', () {
      final table = RestaurantTable.fromJson({
        'id': 't1',
        'label': 'T1',
        'seats': 2,
      });

      expect(table.detail, '2 seats');
    });

    test('TableWithToken keeps the QR capability token', () {
      final table = TableWithToken.fromJson({
        'id': 't1',
        'label': 'T1',
        'seats': 2,
        'qr_token': 'token-123',
      });

      expect(table.qrToken, 'token-123');
      expect(table.isActive, isTrue);
    });
  });

  group('PosOpenOrder', () {
    test('parses nested items and modifiers', () {
      final order = PosOpenOrder.fromJson({
        'id': 'o1',
        'display_code': 'MK-042',
        'status': 'pending',
        'total_cents': 3500,
        'created_at': '2026-10-28T12:00:00Z',
        'customer_name': 'Aina',
        'pax': 3,
        'table_id': 't1',
        'table_label': 'T1',
        'delivery_type': 'dine_in',
        'source': 'counter',
        'order_items': [
          {
            'id': 'i1',
            'menu_item_name': 'Nasi Goreng',
            'quantity': 2,
            'line_total_cents': 2500,
            'notes': 'no onions',
            'order_item_modifiers': [
              {'modifier_name': 'Extra egg', 'modifier_price_delta_cents': 200},
            ],
          },
        ],
      });

      expect(order.code, 'MK-042');
      expect(order.isPending, isTrue);
      expect(order.isDineIn, isTrue);
      expect(order.pax, 3);
      expect(order.items, hasLength(1));
      expect(order.items.single.name, 'Nasi Goreng');
      expect(order.items.single.modifiers.single.name, 'Extra egg');
      expect(order.items.single.modifiers.single.priceDeltaCents, 200);
    });

    test('defaults missing optional columns safely', () {
      final order = PosOpenOrder.fromJson({
        'id': 'o1',
        'status': 'paid',
        'total_cents': 1000,
        'created_at': 'not-a-date',
      });

      expect(order.displayCode, isNull);
      expect(order.code, '—');
      expect(order.customerName, isNull);
      expect(order.pax, isNull);
      expect(order.items, isEmpty);
      expect(order.isPending, isFalse);
      expect(order.isDineIn, isFalse);
      expect(order.createdAt, DateTime.fromMillisecondsSinceEpoch(0));
    });
  });

  group('POS API results', () {
    test('create result falls back to the order number for display', () {
      final result = PosCreateOrderResult.fromJson({
        'order_id': 'o1',
        'order_number': 'MK-0001',
        'total_cents': 2500,
        'status': 'paid',
      });

      expect(result.code, 'MK-0001');
      expect(result.status, 'paid');
      expect(result.totalCents, 2500);
    });

    test('an incomplete or unpaid create response cannot confirm payment', () {
      expect(
        () => PosCreateOrderResult.fromJson({
          'order_id': 'o1',
          'order_number': 'MK-0001',
        }),
        throwsFormatException,
      );
      expect(
        () => PosCreateOrderResult.fromJson({
          'order_id': 'o1',
          'order_number': 'MK-0001',
          'total_cents': 2500,
          'status': 'pending',
        }),
        throwsFormatException,
      );
    });

    test('settle result treats a missing settled_count as one order', () {
      final result = PosSettleResult.fromJson({
        'success': true,
        'amount_cents': 2500,
      });

      expect(result.success, isTrue);
      expect(result.alreadySettled, isFalse);
      expect(result.settledCount, 1);
      expect(result.amountCents, 2500);
    });

    test('table settle result carries the grouped count', () {
      final result = PosSettleResult.fromJson({
        'success': true,
        'settled_count': 3,
        'amount_cents': 9000,
      });

      expect(result.settledCount, 3);
      expect(result.amountCents, 9000);
    });

    test('close result carries the closed count', () {
      final result = PosCloseResult.fromJson({'success': true, 'closed': 2});

      expect(result.success, isTrue);
      expect(result.closed, 2);
    });
  });
}
