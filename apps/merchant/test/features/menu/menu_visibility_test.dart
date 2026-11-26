import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_repository.dart';
import 'package:madkrapow_merchant/features/menu/providers/menu_providers.dart';
import 'package:madkrapow_merchant/generated/database.dart';

class FakeMenuRepository extends Fake implements MenuRepository {
  @override
  Future<List<CategoriesRow>> fetchCategories() async => [
    CategoriesRow(
      id: 'de5a0000-0000-4000-8000-000000000000',
      name: 'Historical',
    ),
    CategoriesRow(id: 'visible', name: 'Visible'),
    CategoriesRow.fromJson({
      'id': 'archived',
      'name': 'Archived',
      'archived_at': '2026-11-26T00:00:00Z',
    }),
  ];

  @override
  Future<List<MenuItemsRow>> fetchMenuItems({String? categoryId}) async => [
    MenuItemsRow(
      id: 'hidden',
      categoryId: 'de5a0000-0000-4000-8000-000000000000',
      name: 'Old',
      priceCents: 100,
    ),
    MenuItemsRow(
      id: 'shown',
      categoryId: 'visible',
      name: 'Current',
      priceCents: 200,
    ),
  ];
}

void main() {
  test('menu excludes the historical category and its items', () async {
    final container = ProviderContainer(
      overrides: [
        menuRepositoryProvider.overrideWithValue(FakeMenuRepository()),
      ],
    );
    addTearDown(container.dispose);
    final result = await container.read(categoriesWithItemsProvider.future);
    expect(result.map((entry) => entry.category.name), ['Visible']);
    expect(result.single.items.single.name, 'Current');
  });
}
