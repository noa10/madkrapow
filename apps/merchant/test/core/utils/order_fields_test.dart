import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/utils/order_fields.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';

OrdersRow _row(Map<String, dynamic> extra) {
  return OrdersRow.fromJson({
    'id': 'o1',
    'order_number': 'MK1',
    'subtotal_cents': 2500,
    'total_cents': 2500,
    ...extra,
  });
}

void main() {
  test('reads the POS columns the generated row predates', () {
    final row = _row({
      'delivery_type': 'dine_in',
      'table_id': 't1',
      'table_label': 'T1',
      'pax': 3,
      'payment_method': 'qr_pay',
      // `payment_timing` was never a column on `orders` — it only ever existed
      // as a request-body field in the pre-#484 POS route.
      'source': 'counter',
      'status': 'pending',
    });

    expect(row.isDineIn, isTrue);
    expect(row.tableId, 't1');
    expect(row.tableLabel, 'T1');
    expect(row.pax, 3);
    expect(row.paymentMethod, 'qr_pay');
    expect(row.source, 'counter');
    expect(row.isUnpaid, isTrue);
  });

  test('returns null when a POS column is absent', () {
    final row = _row(const {'status': 'paid'});

    expect(row.tableId, isNull);
    expect(row.tableLabel, isNull);
    expect(row.pax, isNull);
    expect(row.paymentMethod, isNull);
    expect(row.source, isNull);
    expect(row.isDineIn, isFalse);
    expect(row.isUnpaid, isFalse);
  });

  test('labels every fulfilment type', () {
    expect(orderTypeLabel('dine_in'), 'Dine-in');
    expect(orderTypeLabel('self_pickup'), 'Pickup');
    expect(orderTypeLabel('pickup'), 'Pickup');
    expect(orderTypeLabel('delivery'), 'Delivery');
  });

  test('labels the counter payment methods', () {
    expect(orderPaymentMethodLabel('cash'), 'Cash');
    expect(orderPaymentMethodLabel('qr_pay'), 'Company QR');
    expect(orderPaymentMethodLabel(null), '—');
  });

  group('isClaimedByDiner', () {
    test('recognises a table-QR claim', () {
      expect(isClaimedByDiner({'claimed_via': 'table_qr'}), isTrue);
    });

    test('ignores other payment metadata', () {
      expect(isClaimedByDiner(null), isFalse);
      expect(isClaimedByDiner({'claimed_via': 'cashier'}), isFalse);
      expect(isClaimedByDiner('table_qr'), isFalse);
    });
  });

  group('pendingPaymentNoticeFor', () {
    test('points an unpaid dine-in ticket at the table board', () {
      final notice = pendingPaymentNoticeFor(
        _row({
          'status': 'pending',
          'delivery_type': 'dine_in',
          'source': 'counter',
        }),
      );

      expect(notice!.title, 'Awaiting payment at the counter');
      expect(notice.body, contains('POS table board'));
    });

    test('points an unpaid take-away ticket at the unpaid list', () {
      final notice = pendingPaymentNoticeFor(
        _row({
          'status': 'pending',
          'delivery_type': 'self_pickup',
          'source': 'counter',
        }),
      );

      expect(notice!.body, contains('Unpaid take-away list'));
    });

    test('explains a table-QR dine-in ticket', () {
      final notice = pendingPaymentNoticeFor(
        _row({'status': 'pending', 'delivery_type': 'dine_in', 'source': 'web'}),
      );

      expect(notice!.body, contains('came from the table QR'));
    });

    test('explains an order still waiting on Stripe', () {
      final notice = pendingPaymentNoticeFor(
        _row({'status': 'pending', 'delivery_type': 'delivery', 'source': 'web'}),
      );

      expect(notice!.title, 'Awaiting payment confirmation');
      expect(notice.body, contains('Stripe'));
    });

    test('shows nothing once the order is paid', () {
      expect(
        pendingPaymentNoticeFor(
          _row({
            'status': 'paid',
            'delivery_type': 'dine_in',
            'source': 'counter',
          }),
        ),
        isNull,
      );
    });
  });
}
