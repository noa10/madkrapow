import '../data/menu_item_visuals.dart';
import '../data/menu_repository.dart';

/// The menu layout after search and signature-item selection.
class MenuCatalogViewData {
  const MenuCatalogViewData({
    required this.isSearching,
    required this.signatureItems,
    required this.categories,
  });

  /// Whether the current query is non-empty.
  final bool isSearching;

  /// Up to two featured items for the Chef's Picks spotlight.
  ///
  /// Empty while searching so signature items appear in normal results.
  final List<MenuItemWithModifiers> signatureItems;

  /// Categories that still have at least one visible item.
  ///
  /// In browse mode this excludes the featured signature items, matching the
  /// web catalog. In search mode it includes every matching item.
  final List<CategoryWithMenuItems> categories;

  /// Whether there is anything to render in the catalog.
  bool get isEmpty => signatureItems.isEmpty && categories.isEmpty;
}

/// Builds the browse/search view model for the home menu.
///
/// Mirrors `apps/web/src/components/menu/MenuCatalogView.tsx`:
/// - Signature items are the first [signatureLimit] `is_signature` rows in
///   category/item sort order.
/// - Browse mode removes those featured items from their categories.
/// - Search matches item name and description, case-insensitively.
/// - Empty categories are dropped from both modes.
MenuCatalogViewData buildMenuCatalogViewData(
  List<CategoryWithMenuItems> categories,
  String query, {
  int signatureLimit = 2,
}) {
  final normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.isNotEmpty) {
    final matches = <CategoryWithMenuItems>[];
    for (final category in categories) {
      final items = category.menuItems
          .where((item) => _searchHaystack(item).contains(normalizedQuery))
          .toList(growable: false);
      if (items.isNotEmpty) {
        matches.add(
          CategoryWithMenuItems(category: category.category, menuItems: items),
        );
      }
    }

    return MenuCatalogViewData(
      isSearching: true,
      signatureItems: const <MenuItemWithModifiers>[],
      categories: List<CategoryWithMenuItems>.unmodifiable(matches),
    );
  }

  final allItems = <MenuItemWithModifiers>[
    for (final category in categories) ...category.menuItems,
  ];
  final featured = allItems
      .where((item) => item.item.isSignature)
      .take(signatureLimit < 0 ? 0 : signatureLimit)
      .toList(growable: false);
  final featuredIds = featured.map((item) => item.item.id).toSet();

  final browse = <CategoryWithMenuItems>[];
  for (final category in categories) {
    final items = category.menuItems
        .where((item) => !featuredIds.contains(item.item.id))
        .toList(growable: false);
    if (items.isNotEmpty) {
      browse.add(
        CategoryWithMenuItems(category: category.category, menuItems: items),
      );
    }
  }

  return MenuCatalogViewData(
    isSearching: false,
    signatureItems: List<MenuItemWithModifiers>.unmodifiable(featured),
    categories: List<CategoryWithMenuItems>.unmodifiable(browse),
  );
}

String _searchHaystack(MenuItemWithModifiers item) {
  final description = item.item.description ?? '';
  return '${item.item.name} $description'.toLowerCase();
}
