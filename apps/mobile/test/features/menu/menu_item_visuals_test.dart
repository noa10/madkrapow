import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/menu/data/menu_item_visuals.dart';
import 'package:madkrapow_mobile/generated/tables/menu_items.dart';

MenuItemsRow _row(Map<String, dynamic> extra) {
  return MenuItemsRow.fromJson({
    'id': 'item-1',
    'category_id': 'category-1',
    'name': 'Pad Kra Pao',
    'price_cents': 1250,
    ...extra,
  });
}

void main() {
  group('MenuItemVisuals', () {
    test('reads signature, spice, and ingredients from the row data', () {
      final item = _row({
        'is_signature': true,
        'spice_level': 2,
        'ingredients': ['Holy basil', 'Bird eye chilli', 'Egg'],
      });

      expect(item.isSignature, isTrue);
      expect(item.spiceLevel, 2);
      expect(item.ingredients, ['Holy basil', 'Bird eye chilli', 'Egg']);
    });

    test('defaults visual fields when the columns are absent', () {
      final item = _row({});

      expect(item.isSignature, isFalse);
      expect(item.spiceLevel, 0);
      expect(item.ingredients, isEmpty);
    });

    test('clamps spice levels outside 0..3', () {
      expect(_row({'spice_level': -2}).spiceLevel, 0);
      expect(_row({'spice_level': 9}).spiceLevel, 3);
      expect(_row({'spice_level': 2.9}).spiceLevel, 2);
    });

    test('ignores non-string ingredient entries', () {
      final item = _row({
        'ingredients': ['Basil', 42, null, 'Chilli'],
      });

      expect(item.ingredients, ['Basil', 'Chilli']);
    });
  });

  group('menuSpiceLevelLabel', () {
    test('maps levels to the web labels', () {
      expect(menuSpiceLevelLabel(0), 'Mild');
      expect(menuSpiceLevelLabel(1), 'Medium');
      expect(menuSpiceLevelLabel(2), 'Hot');
      expect(menuSpiceLevelLabel(3), 'Thai-hot');
    });

    test('clamps out-of-range labels', () {
      expect(menuSpiceLevelLabel(-1), 'Mild');
      expect(menuSpiceLevelLabel(99), 'Thai-hot');
    });
  });
}
