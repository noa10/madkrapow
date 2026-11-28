import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_order_repository.dart';
import 'package:madkrapow_merchant/features/orders/providers/kitchen_providers.dart';

void main() {
  test('the queue filter mirrors the web kitchen constant', () {
    expect(
      MerchantOrderRepository.kitchenQueueOrFilter,
      'status.in.(paid,accepted,preparing,ready),'
      'and(status.eq.pending,delivery_type.eq.dine_in),'
      'and(status.eq.pending,source.eq.counter),'
      'and(status.eq.delivered,source.eq.counter,delivery_type.eq.self_pickup,kitchen_status.in.(paid,preparing))',
    );
  });

  group('isKitchenActive', () {
    test('keeps every paid-through-ready ticket', () {
      for (final status in ['paid', 'accepted', 'preparing', 'ready']) {
        expect(isKitchenActive(status: status), isTrue, reason: status);
      }
    });

    test('keeps a pending dine-in ticket', () {
      expect(
        isKitchenActive(status: 'pending', deliveryType: 'dine_in'),
        isTrue,
      );
    });

    test('keeps a pending counter ticket', () {
      expect(
        isKitchenActive(
          status: 'pending',
          deliveryType: 'self_pickup',
          source: 'counter',
        ),
        isTrue,
      );
    });

    test('drops an abandoned web checkout', () {
      expect(
        isKitchenActive(
          status: 'pending',
          deliveryType: 'delivery',
          source: 'web',
        ),
        isFalse,
      );
    });

    test(
      'keeps delivered counter pickups only while kitchen work is active',
      () {
        for (final kitchenStatus in ['paid', 'preparing']) {
          expect(
            isKitchenActive(
              status: 'delivered',
              source: 'counter',
              deliveryType: 'self_pickup',
              kitchenStatus: kitchenStatus,
            ),
            isTrue,
          );
        }
        for (final kitchenStatus in [null, 'ready']) {
          expect(
            isKitchenActive(
              status: 'delivered',
              source: 'counter',
              deliveryType: 'self_pickup',
              kitchenStatus: kitchenStatus,
            ),
            isFalse,
          );
        }
        expect(
          isKitchenActive(
            status: 'delivered',
            source: 'web',
            deliveryType: 'self_pickup',
            kitchenStatus: 'paid',
          ),
          isFalse,
        );
        expect(
          isKitchenActive(
            status: 'delivered',
            source: 'counter',
            deliveryType: 'dine_in',
            kitchenStatus: 'paid',
          ),
          isFalse,
        );
      },
    );

    test('drops terminal states', () {
      for (final status in ['cancelled', 'completed', 'picked_up']) {
        expect(
          isKitchenActive(
            status: status,
            deliveryType: 'dine_in',
            source: 'counter',
          ),
          isFalse,
          reason: status,
        );
      }
    });
  });
}
