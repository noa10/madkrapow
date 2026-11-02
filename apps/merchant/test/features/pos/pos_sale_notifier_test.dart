import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_cart.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/providers/pos_providers.dart';

PosMenuItem _item(String id) {
  return PosMenuItem(
    id: id,
    name: 'Dish $id',
    description: null,
    imageUrl: null,
    priceCents: 1250,
    isAvailable: true,
    categoryId: 'c1',
    sortOrder: 0,
  );
}

const _table = RestaurantTable(
  id: 't1',
  label: 'T1',
  zone: 'Indoor',
  seats: 4,
  isActive: true,
  sortOrder: 0,
);

ProviderContainer _container() {
  final container = ProviderContainer();
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('canSubmit', () {
    test('is false for an empty cart', () {
      expect(_container().read(posSaleProvider).canSubmit, isFalse);
    });

    test('needs a table for dine-in', () {
      final container = _container();
      final notifier = container.read(posSaleProvider.notifier);
      notifier.addItem(_item('m1'));

      expect(container.read(posSaleProvider).canSubmit, isFalse);

      notifier.selectTable('t1');
      expect(container.read(posSaleProvider).canSubmit, isTrue);
    });

    test('needs a customer name for take-away', () {
      final container = _container();
      final notifier = container.read(posSaleProvider.notifier)
        ..setOrderType(PosOrderType.takeAway)
        ..addItem(_item('m1'));

      expect(container.read(posSaleProvider).canSubmit, isFalse);

      notifier.setCustomerName('Aina');
      expect(container.read(posSaleProvider).canSubmit, isTrue);
    });

    test('is false while submitting', () {
      final container = _container();
      container.read(posSaleProvider.notifier)
        ..selectTable('t1')
        ..addItem(_item('m1'))
        ..setSubmitting(true);

      expect(container.read(posSaleProvider).canSubmit, isFalse);
    });
  });

  group('resetSale', () {
    test('clears the cart but keeps the table context for another round', () {
      final container = _container();
      final notifier = container.read(posSaleProvider.notifier)
        ..selectTable('t1')
        ..setPax(4)
        ..setOrderType(PosOrderType.takeAway)
        ..setCustomerName('Aina')
        ..setSubmitError('failed')
        ..addItem(_item('m1'));

      notifier.resetSale();
      final sale = container.read(posSaleProvider);

      expect(sale.cart, isEmpty);
      expect(sale.customerName, isEmpty);
      expect(sale.paymentMethod, PosPaymentMethod.cash);
      expect(sale.submitError, isNull);
      expect(sale.selectedTableId, 't1');
      expect(sale.pax, 4);
      expect(sale.orderType, PosOrderType.takeAway);
    });
  });

  test('clearing the sale keeps the duplicate-order guard', () {
    final container = _container();
    final notifier = container.read(posSaleProvider.notifier)
      ..setOrderType(PosOrderType.takeAway)
      ..addItem(_item('m1'))
      ..setOutcomeUncertain();

    expect(container.read(posSaleProvider).outcomeUncertain, isTrue);
    notifier.setCustomerName('Aina');
    expect(container.read(posSaleProvider).outcomeUncertain, isTrue);

    // The Clear button must not erase an order the server may still have
    // recorded — the next Charge has to ask the cashier to check Orders first.
    notifier.resetSale();
    expect(container.read(posSaleProvider).outcomeUncertain, isTrue);

    // Only a confirmed create releases the guard.
    notifier.resetSale(orderConfirmed: true);
    expect(container.read(posSaleProvider).outcomeUncertain, isFalse);
  });

  test('a reconciled cart requires review until the cashier confirms', () {
    final container = _container();
    final notifier = container.read(posSaleProvider.notifier);
    final result = PosCartReconciliation(
      cart: addPosCartLine(const [], item: _item('m1')),
      removed: const [],
      repriced: true,
    );

    notifier.applyCartReconciliation(result);
    expect(container.read(posSaleProvider).reviewRequired, isTrue);
    expect(container.read(posSaleProvider).reviewMessage, isNotNull);

    notifier.clearReviewRequired();
    expect(container.read(posSaleProvider).reviewRequired, isFalse);
    expect(container.read(posSaleProvider).reviewMessage, isNull);

    notifier
      ..applyCartReconciliation(result)
      ..resetSale();
    expect(container.read(posSaleProvider).reviewRequired, isFalse);
  });

  group('clearForNewSession', () {
    test('wipes table, pax, order type and cart for the next cashier', () {
      final container = _container();
      final notifier = container.read(posSaleProvider.notifier)
        ..selectTable('t1')
        ..setPax(4)
        ..setOrderType(PosOrderType.takeAway)
        ..setCustomerName('Aina')
        ..setPaymentMethod(PosPaymentMethod.qrPay)
        ..addItem(_item('m1'));

      notifier.clearForNewSession();
      final sale = container.read(posSaleProvider);

      expect(sale.cart, isEmpty);
      expect(sale.customerName, isEmpty);
      expect(sale.submitError, isNull);
      expect(sale.selectedTableId, isNull);
      expect(sale.pax, 2);
      expect(sale.orderType, PosOrderType.dineIn);
      expect(sale.paymentMethod, PosPaymentMethod.cash);
    });
  });

  group('startTableOrder', () {
    test('preloads the table and clamps the party size to the table', () {
      final container = _container();
      final notifier = container.read(posSaleProvider.notifier)
        ..setOrderType(PosOrderType.takeAway)
        ..addItem(_item('m1'));

      notifier.startTableOrder(_table, 6);
      final sale = container.read(posSaleProvider);

      expect(sale.orderType, PosOrderType.dineIn);
      expect(sale.selectedTableId, 't1');
      expect(sale.pax, 6);
      expect(sale.cart, isEmpty);
    });

    test('falls back to two pax when the table has no party size', () {
      final container = _container();
      container.read(posSaleProvider.notifier).startTableOrder(_table, null);

      expect(container.read(posSaleProvider).pax, 2);
    });
  });

  group('addItem', () {
    test('refuses a new line once the API line cap is reached', () {
      final container = _container();
      final notifier = container.read(posSaleProvider.notifier);

      for (var i = 0; i < maxPosCartLines; i++) {
        expect(notifier.addItem(_item('m$i')), isTrue);
      }

      expect(notifier.addItem(_item('one-too-many')), isFalse);
      expect(container.read(posSaleProvider).cart, hasLength(maxPosCartLines));
    });

    test('still merges an existing line at the cap', () {
      final container = _container();
      final notifier = container.read(posSaleProvider.notifier);

      for (var i = 0; i < maxPosCartLines; i++) {
        notifier.addItem(_item('m$i'));
      }

      expect(notifier.addItem(_item('m0')), isTrue);
      final first = container.read(posSaleProvider).cart.first;
      expect(first.quantity, 2);
    });
  });
}
