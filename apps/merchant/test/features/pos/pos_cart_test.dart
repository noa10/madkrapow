import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_cart.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';

PosMenuItem _item({
  String id = 'm1',
  String name = 'Nasi Goreng',
  int priceCents = 1250,
}) {
  return PosMenuItem(
    id: id,
    name: name,
    description: null,
    imageUrl: null,
    priceCents: priceCents,
    isAvailable: true,
    categoryId: 'c1',
    sortOrder: 0,
  );
}

PosCartModifier _modifier({
  String id = 'mod1',
  String name = 'Extra egg',
  int priceDeltaCents = 200,
}) {
  return PosCartModifier(
    id: id,
    name: name,
    priceDeltaCents: priceDeltaCents,
  );
}

void main() {
  group('posCartLineKey', () {
    test('is stable when modifier ids arrive in another order', () {
      final first = posCartLineKey('m1', ['b', 'a'], '');
      final second = posCartLineKey('m1', ['a', 'b'], '');

      expect(first, second);
    });

    test('trims the note so trailing spaces do not split a line', () {
      expect(
        posCartLineKey('m1', const [], ' no onions '),
        posCartLineKey('m1', const [], 'no onions'),
      );
    });

    test('keeps lines with different notes apart', () {
      expect(
        posCartLineKey('m1', const [], 'no onions'),
        isNot(posCartLineKey('m1', const [], 'extra spicy')),
      );
    });

    test('keeps lines with different add-ons apart', () {
      expect(
        posCartLineKey('m1', ['mod1'], ''),
        isNot(posCartLineKey('m1', ['mod2'], '')),
      );
    });
  });

  group('posLineTotalCents', () {
    test('adds every modifier delta and multiplies by quantity', () {
      expect(
        posLineTotalCents(1250, [_modifier(), _modifier(id: 'mod2')], 3),
        (1250 + 200 + 200) * 3,
      );
    });

    test('floors a negative unit at zero', () {
      expect(
        posLineTotalCents(100, [_modifier(priceDeltaCents: -500)], 2),
        0,
      );
    });
  });

  group('addPosCartLine', () {
    test('merges an identical dish into one line', () {
      final cart = addPosCartLine(
        addPosCartLine(const [], item: _item()),
        item: _item(),
        quantity: 2,
      );

      expect(cart, hasLength(1));
      expect(cart.single.quantity, 3);
    });

    test('caps a merged line at the 99 quantity limit', () {
      final cart = addPosCartLine(
        addPosCartLine(const [], item: _item(), quantity: 98),
        item: _item(),
        quantity: 5,
      );

      expect(cart.single.quantity, maxPosLineQuantity);
    });

    test('keeps different add-ons as separate lines', () {
      final cart = addPosCartLine(
        addPosCartLine(const [], item: _item()),
        item: _item(),
        modifiers: [_modifier()],
      );

      expect(cart, hasLength(2));
      expect(cart.first.quantity, 1);
      expect(cart.last.modifiers.single.name, 'Extra egg');
    });

    test('does not mutate the original cart', () {
      final original = addPosCartLine(const [], item: _item());
      final updated = addPosCartLine(original, item: _item(), quantity: 2);

      expect(original.single.quantity, 1);
      expect(updated.single.quantity, 3);
    });

    test('trims notes before storing them on the line', () {
      final cart = addPosCartLine(
        const [],
        item: _item(),
        notes: '  no onions  ',
      );

      expect(cart.single.notes, 'no onions');
    });
  });

  group('changePosCartQuantity', () {
    test('removes a line when the quantity reaches zero', () {
      final cart = addPosCartLine(const [], item: _item());
      final updated = changePosCartQuantity(cart, cart.single.key, -1);

      expect(updated, isEmpty);
    });

    test('caps an increase at the line limit', () {
      final cart = addPosCartLine(
        const [],
        item: _item(),
        quantity: maxPosLineQuantity,
      );
      final updated = changePosCartQuantity(cart, cart.single.key, 1);

      expect(updated.single.quantity, maxPosLineQuantity);
    });

    test('leaves other lines untouched', () {
      final first = addPosCartLine(const [], item: _item());
      final cart = addPosCartLine(
        first,
        item: _item(id: 'm2', name: 'Tom Yam'),
      );
      final updated = changePosCartQuantity(cart, first.single.key, 1);

      expect(updated, hasLength(2));
      expect(updated.last.quantity, 1);
    });
  });

  test('posCartTotalCents sums every line total', () {
    final cart = addPosCartLine(
      addPosCartLine(const [], item: _item()),
      item: _item(id: 'm2', priceCents: 500),
      quantity: 2,
    );

    expect(posCartTotalCents(cart), 1250 + 1000);
  });
}
