import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_order_repository.dart';
import 'package:madkrapow_merchant/generated/tables/order_item_modifiers.dart';
import 'package:madkrapow_merchant/generated/tables/order_items.dart';

void main() {
  group('groupItemsAndModifiers', () {
    test('groups items under their order', () {
      final result = groupItemsAndModifiers(
        [
          _item(id: 'i1', orderId: 'o1', name: 'Nasi Goreng'),
          _item(id: 'i2', orderId: 'o1', name: 'Tom Yam'),
          _item(id: 'i3', orderId: 'o2', name: 'Pad Thai'),
        ],
        [],
      );

      expect(result.keys, unorderedEquals(['o1', 'o2']));
      expect(
        result['o1']!.map((e) => e.item.menuItemName),
        ['Nasi Goreng', 'Tom Yam'],
      );
      expect(result['o2']!.map((e) => e.item.menuItemName), ['Pad Thai']);
    });

    test('preserves the order the rows arrived in', () {
      final result = groupItemsAndModifiers(
        [
          _item(id: 'i1', orderId: 'o1', name: 'First'),
          _item(id: 'i2', orderId: 'o1', name: 'Second'),
          _item(id: 'i3', orderId: 'o1', name: 'Third'),
        ],
        [],
      );

      expect(
        result['o1']!.map((e) => e.item.menuItemName),
        ['First', 'Second', 'Third'],
      );
    });

    test('attaches each modifier to its own item', () {
      final result = groupItemsAndModifiers(
        [
          _item(id: 'i1', orderId: 'o1', name: 'Nasi Goreng'),
          _item(id: 'i2', orderId: 'o1', name: 'Tom Yam'),
        ],
        [
          _modifier(orderItemId: 'i1', name: 'Extra Spicy'),
          _modifier(orderItemId: 'i2', name: 'Less Spicy'),
          _modifier(orderItemId: 'i1', name: 'Add Egg'),
        ],
      );

      final items = result['o1']!;
      expect(
        items[0].modifiers.map((m) => m.modifierName),
        ['Extra Spicy', 'Add Egg'],
      );
      expect(items[1].modifiers.map((m) => m.modifierName), ['Less Spicy']);
    });

    test('gives items with no modifiers an empty list', () {
      final result = groupItemsAndModifiers(
        [_item(id: 'i1', orderId: 'o1', name: 'Nasi Goreng')],
        [],
      );

      expect(result['o1']!.single.modifiers, isEmpty);
    });

    test('ignores modifiers whose item is absent', () {
      final result = groupItemsAndModifiers(
        [_item(id: 'i1', orderId: 'o1', name: 'Nasi Goreng')],
        [_modifier(orderItemId: 'ghost', name: 'Orphan')],
      );

      expect(result.keys, ['o1']);
      expect(result['o1']!.single.modifiers, isEmpty);
    });

    test('returns an empty map when there are no items', () {
      expect(
        groupItemsAndModifiers([], [_modifier(orderItemId: 'i1', name: 'x')]),
        isEmpty,
      );
    });
  });

  group('batchIds', () {
    test('returns no batches for an empty list', () {
      expect(batchIds(<String>[], 3), isEmpty);
    });

    test('returns one batch when the list fits', () {
      expect(batchIds(['a', 'b', 'c'], 3), [
        ['a', 'b', 'c'],
      ]);
    });

    test('splits on the boundary without a trailing empty batch', () {
      expect(batchIds(['a', 'b', 'c', 'd'], 2), [
        ['a', 'b'],
        ['c', 'd'],
      ]);
    });

    test('puts the remainder in a final short batch', () {
      expect(batchIds(['a', 'b', 'c', 'd', 'e'], 2), [
        ['a', 'b'],
        ['c', 'd'],
        ['e'],
      ]);
    });

    test('preserves order and contents when recombined', () {
      final ids = [for (var i = 0; i < 250; i++) 'id-$i'];

      final recombined = batchIds(ids, 150).expand((batch) => batch).toList();

      expect(recombined, ids);
    });

    test('bounds every batch by the requested size', () {
      final ids = [for (var i = 0; i < 1000; i++) 'id-$i'];

      for (final batch in batchIds(ids, 150)) {
        expect(batch.length, lessThanOrEqualTo(150));
      }
    });
  });
}

OrderItemsRow _item({
  required String id,
  required String orderId,
  required String name,
}) {
  return OrderItemsRow(
    id: id,
    orderId: orderId,
    menuItemId: 'menu-$id',
    menuItemName: name,
    menuItemPriceCents: 1200,
    lineTotalCents: 1200,
  );
}

OrderItemModifiersRow _modifier({
  required String orderItemId,
  required String name,
}) {
  return OrderItemModifiersRow(
    orderItemId: orderItemId,
    modifierId: 'mod-$name',
    modifierName: name,
  );
}
