import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/menu/data/menu_repository.dart';
import 'package:madkrapow_mobile/features/menu/presentation/menu_catalog_filter.dart';
import 'package:madkrapow_mobile/generated/tables/categories.dart';
import 'package:madkrapow_mobile/generated/tables/menu_items.dart';

CategoriesRow _category(String id, String name) {
  return CategoriesRow.fromJson({
    'id': id,
    'name': name,
    'description': 'Category description',
    'sort_order': 0,
    'is_active': true,
  });
}

MenuItemsRow _item({
  required String id,
  required String categoryId,
  required String name,
  String? description,
  bool isSignature = false,
  bool isAvailable = true,
}) {
  return MenuItemsRow.fromJson({
    'id': id,
    'category_id': categoryId,
    'name': name,
    'description': description,
    'price_cents': 1250,
    'is_available': isAvailable,
    'sort_order': 0,
    'is_signature': isSignature,
    'spice_level': 0,
    'ingredients': const <String>[],
  });
}

MenuItemWithModifiers _withModifiers(MenuItemsRow item) {
  return MenuItemWithModifiers(item: item, hasModifiers: false);
}

CategoryWithMenuItems _withItems(
  CategoriesRow category,
  List<MenuItemWithModifiers> items,
) {
  return CategoryWithMenuItems(category: category, menuItems: items);
}

void main() {
  final mains = _category('mains', 'Mains');
  final drinks = _category('drinks', 'Drinks');

  group('buildMenuCatalogViewData', () {
    test('takes the first two signature items and removes them from browse', () {
      final categories = [
        _withItems(mains, [
          _withModifiers(
            _item(
              id: 'signature-1',
              categoryId: 'mains',
              name: 'Signature One',
              isSignature: true,
            ),
          ),
          _withModifiers(
            _item(id: 'regular-1', categoryId: 'mains', name: 'Regular One'),
          ),
        ]),
        _withItems(drinks, [
          _withModifiers(
            _item(
              id: 'signature-2',
              categoryId: 'drinks',
              name: 'Signature Two',
              isSignature: true,
            ),
          ),
          _withModifiers(
            _item(
              id: 'signature-3',
              categoryId: 'drinks',
              name: 'Signature Three',
              isSignature: true,
            ),
          ),
        ]),
      ];

      final result = buildMenuCatalogViewData(categories, '');

      expect(result.isSearching, isFalse);
      expect(result.signatureItems.map((item) => item.item.id), [
        'signature-1',
        'signature-2',
      ]);
      expect(result.categories, hasLength(2));
      expect(result.categories.first.menuItems.map((item) => item.item.id), [
        'regular-1',
      ]);
      // Only featured signatures are removed; a third signature stays browseable.
      expect(result.categories.last.menuItems.map((item) => item.item.id), [
        'signature-3',
      ]);
    });

    test('search matches name and description case-insensitively', () {
      final categories = [
        _withItems(mains, [
          _withModifiers(
            _item(
              id: 'kra-pao',
              categoryId: 'mains',
              name: 'Pad Kra Pao',
              description: 'Holy basil and chilli',
              isSignature: true,
            ),
          ),
          _withModifiers(
            _item(
              id: 'fried-rice',
              categoryId: 'mains',
              name: 'Fried Rice',
              description: 'Wok-fired with egg',
            ),
          ),
        ]),
        _withItems(drinks, [
          _withModifiers(
            _item(
              id: 'thai-tea',
              categoryId: 'drinks',
              name: 'Thai Tea',
              description: 'Sweet and cold',
            ),
          ),
        ]),
      ];

      final byName = buildMenuCatalogViewData(categories, '  KRA  ');
      expect(byName.isSearching, isTrue);
      expect(byName.signatureItems, isEmpty);
      expect(byName.categories, hasLength(1));
      expect(byName.categories.single.menuItems.single.item.id, 'kra-pao');

      final byDescription = buildMenuCatalogViewData(categories, 'wok-fired');
      expect(byDescription.categories, hasLength(1));
      expect(
        byDescription.categories.single.menuItems.single.item.id,
        'fried-rice',
      );
    });

    test('search includes signature items and drops empty categories', () {
      final categories = [
        _withItems(mains, [
          _withModifiers(
            _item(
              id: 'signature-1',
              categoryId: 'mains',
              name: 'Signature One',
              isSignature: true,
            ),
          ),
        ]),
        _withItems(drinks, [
          _withModifiers(
            _item(id: 'thai-tea', categoryId: 'drinks', name: 'Thai Tea'),
          ),
        ]),
      ];

      final result = buildMenuCatalogViewData(categories, 'signature');

      expect(result.signatureItems, isEmpty);
      expect(result.categories, hasLength(1));
      expect(result.categories.single.category.id, 'mains');
      expect(result.categories.single.menuItems.single.item.id, 'signature-1');
    });

    test('drops categories with no browseable items', () {
      final categories = [
        _withItems(mains, [
          _withModifiers(
            _item(
              id: 'signature-1',
              categoryId: 'mains',
              name: 'Signature One',
              isSignature: true,
            ),
          ),
        ]),
        _withItems(drinks, const []),
      ];

      final result = buildMenuCatalogViewData(categories, '');

      expect(result.signatureItems, hasLength(1));
      expect(result.categories, isEmpty);
    });

    test('returns an empty catalog for an unmatched query', () {
      final result = buildMenuCatalogViewData([
        _withItems(mains, [
          _withModifiers(
            _item(id: 'kra-pao', categoryId: 'mains', name: 'Pad Kra Pao'),
          ),
        ]),
      ], 'pizza');

      expect(result.isSearching, isTrue);
      expect(result.isEmpty, isTrue);
    });

    test('supports a zero signature limit', () {
      final categories = [
        _withItems(mains, [
          _withModifiers(
            _item(
              id: 'signature-1',
              categoryId: 'mains',
              name: 'Signature One',
              isSignature: true,
            ),
          ),
        ]),
      ];

      final result = buildMenuCatalogViewData(
        categories,
        '',
        signatureLimit: 0,
      );

      expect(result.signatureItems, isEmpty);
      expect(result.categories.single.menuItems.single.item.id, 'signature-1');
    });
  });
}
