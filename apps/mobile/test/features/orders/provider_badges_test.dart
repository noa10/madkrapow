import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/orders/data/orders_row_billplz.dart';
import 'package:madkrapow_mobile/features/orders/presentation/widgets/provider_badges.dart';
import 'package:madkrapow_mobile/generated/tables/orders.dart';

void main() {
  group('paymentProviderFor', () {
    test('prefers Stripe over Billplz', () {
      final data = ProviderBadgeData(
        status: 'preparing',
        stripeSessionId: 'cs_1',
        billplzBillId: 'bill_1',
      );

      expect(paymentProviderFor(data), PaymentProvider.stripe);
    });

    test('returns Billplz when only the bill id is present', () {
      final data = ProviderBadgeData(
        status: 'preparing',
        billplzBillId: 'bill_1',
      );

      expect(paymentProviderFor(data), PaymentProvider.billplz);
      expect(paymentLabel(PaymentProvider.billplz), 'Billplz');
    });

    test('returns Awaiting for a pending order with no provider id', () {
      expect(
        paymentProviderFor(ProviderBadgeData(status: 'pending')),
        PaymentProvider.pending,
      );
    });

    test('falls back to Cash for a confirmed order with no provider id', () {
      expect(
        paymentProviderFor(ProviderBadgeData(status: 'delivered')),
        PaymentProvider.cash,
      );
    });
  });

  group('OrdersRowBillplz', () {
    test('reads billplz_bill_id from the raw row map', () {
      final row = OrdersRow.fromJson({
        'id': 'order-1',
        'order_number': 'MK1',
        'subtotal_cents': 1000,
        'total_cents': 1000,
        'billplz_bill_id': 'bill_1',
      });

      expect(row.billplzBillId, 'bill_1');
    });

    test('returns null for a Stripe/legacy row', () {
      final row = OrdersRow.fromJson({
        'id': 'order-1',
        'order_number': 'MK1',
        'subtotal_cents': 1000,
        'total_cents': 1000,
        'stripe_session_id': 'cs_1',
      });

      expect(row.billplzBillId, isNull);
    });
  });
}
