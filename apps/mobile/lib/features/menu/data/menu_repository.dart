import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../../generated/tables/categories.dart';
import '../../../generated/tables/menu_item_modifier_groups.dart';
import '../../../generated/tables/menu_items.dart';
import '../../../generated/tables/modifier_groups.dart';
import '../../../generated/tables/modifiers.dart';
import '../../../generated/tables/store_settings.dart';

// ── Models ────────────────────────────────────────────────────────

class MenuItemWithModifiers {
  final MenuItemsRow item;
  final bool hasModifiers;
  final List<ModifierGroupWithModifiers> modifierGroups;

  MenuItemWithModifiers({
    required this.item,
    required this.hasModifiers,
    this.modifierGroups = const [],
  });

  /// Builds the detail payload the quick view needs. The quick view does not
  /// render the category label, so an empty name is sufficient here.
  FullMenuItem toQuickViewItem() {
    return FullMenuItem(
      item: item,
      category: (id: item.categoryId, name: ''),
      modifierGroups: modifierGroups,
    );
  }
}

class CategoryWithMenuItems {
  final CategoriesRow category;
  final List<MenuItemWithModifiers> menuItems;

  CategoryWithMenuItems({required this.category, required this.menuItems});
}

class ModifierGroupWithModifiers {
  final ModifierGroupsRow group;
  final List<ModifiersRow> modifiers;
  final bool isRequired;

  ModifierGroupWithModifiers({
    required this.group,
    required this.modifiers,
    required this.isRequired,
  });
}

class FullMenuItem {
  final MenuItemsRow item;
  final ({String id, String name}) category;
  final List<ModifierGroupWithModifiers> modifierGroups;

  FullMenuItem({
    required this.item,
    required this.category,
    required this.modifierGroups,
  });
}

// ── Repository ────────────────────────────────────────────────────

class MenuRepository {
  MenuRepository(this._supabase);

  final SupabaseClient _supabase;

  /// Fetch categories with their available menu items.
  ///
  /// The five reads are independent, so they run together. Hydrating modifier
  /// groups here (rather than on item tap) keeps the quick view instant: the
  /// menu is small, and every item already carries everything the sheet needs.
  ///
  /// Each table is paged because PostgREST caps a response at 1000 rows by
  /// default. Without paging, a menu that grows past the cap would silently
  /// lose required modifier options.
  Future<List<CategoryWithMenuItems>> fetchCategoriesWithItems() async {
    const pageSize = 1000;

    Future<List<Map<String, dynamic>>> fetchAllPages(
      Future<List<Map<String, dynamic>>> Function(int from, int to) fetchPage,
    ) async {
      final rows = <Map<String, dynamic>>[];
      var from = 0;
      while (true) {
        final page = await fetchPage(from, from + pageSize - 1);
        rows.addAll(page);
        if (page.length < pageSize) return rows;
        from += pageSize;
      }
    }

    final responses = await Future.wait([
      fetchAllPages(
        (from, to) => _supabase
            .from('categories')
            .select()
            .eq('is_active', true)
            .order('sort_order', ascending: true)
            .order('id')
            .range(from, to),
      ),
      fetchAllPages(
        (from, to) => _supabase
            .from('menu_items')
            .select()
            .order('sort_order', ascending: true)
            .order('id')
            .range(from, to),
      ),
      fetchAllPages(
        (from, to) => _supabase
            .from('menu_item_modifier_groups')
            .select()
            .order('id')
            .range(from, to),
      ),
      fetchAllPages(
        (from, to) => _supabase
            .from('modifier_groups')
            .select()
            .order('sort_order', ascending: true)
            .order('id')
            .range(from, to),
      ),
      fetchAllPages(
        (from, to) => _supabase
            .from('modifiers')
            .select()
            .eq('is_available', true)
            .order('sort_order', ascending: true)
            .order('id')
            .range(from, to),
      ),
    ]);

    final categoriesRes = responses[0];
    final itemsRes = responses[1];
    final junctionRes = responses[2];
    final groupsRes = responses[3];
    final modifiersRes = responses[4];

    final categories = categoriesRes
        .map((json) => CategoriesRow.fromJson(json))
        .toList();
    final items = itemsRes.map((json) => MenuItemsRow.fromJson(json)).toList();

    final junctionsByItem = <String, List<MenuItemModifierGroupsRow>>{};
    for (final json in junctionRes) {
      final junction = MenuItemModifierGroupsRow.fromJson(json);
      junctionsByItem.putIfAbsent(junction.menuItemId, () => []).add(junction);
    }

    final groups = groupsRes
        .map((json) => ModifierGroupsRow.fromJson(json))
        .toList();
    final groupsById = {for (final group in groups) group.id: group};

    final modifiersByGroup = <String, List<ModifiersRow>>{};
    for (final json in modifiersRes) {
      final modifier = ModifiersRow.fromJson(json);
      modifiersByGroup
          .putIfAbsent(modifier.modifierGroupId, () => [])
          .add(modifier);
    }

    List<ModifierGroupWithModifiers> modifierGroupsFor(String itemId) {
      final groupsForItem = <ModifierGroupWithModifiers>[];
      for (final junction
          in junctionsByItem[itemId] ?? const <MenuItemModifierGroupsRow>[]) {
        final group = groupsById[junction.modifierGroupId];
        if (group == null) continue;
        groupsForItem.add(
          ModifierGroupWithModifiers(
            group: group,
            modifiers: modifiersByGroup[group.id] ?? const [],
            isRequired: junction.isRequired,
          ),
        );
      }
      groupsForItem.sort(
        (a, b) => a.group.sortOrder.compareTo(b.group.sortOrder),
      );
      return groupsForItem;
    }

    // Group items by category_id
    final itemsByCategory = <String, List<MenuItemsRow>>{};
    for (final item in items) {
      final catId = item.categoryId;
      itemsByCategory.putIfAbsent(catId, () => []).add(item);
    }

    return categories.map((category) {
      final categoryItems = itemsByCategory[category.id] ?? [];
      return CategoryWithMenuItems(
        category: category,
        menuItems: categoryItems.map((item) {
          final modifierGroups = modifierGroupsFor(item.id);
          return MenuItemWithModifiers(
            item: item,
            hasModifiers: modifierGroups.isNotEmpty,
            modifierGroups: modifierGroups,
          );
        }).toList(),
      );
    }).toList();
  }

  /// Fetch a full menu item with its modifier groups and modifiers.
  /// Mirrors web's getItemById() — up to 5 queries.
  Future<FullMenuItem?> fetchItemById(String id) async {
    // 1. Fetch the menu item
    final itemRes = await _supabase
        .from('menu_items')
        .select()
        .eq('id', id)
        .single();

    final menuItem = MenuItemsRow.fromJson(itemRes);

    // 2. Fetch the item's category (just id and name)
    final categoryRes = await _supabase
        .from('categories')
        .select('id, name')
        .eq('id', menuItem.categoryId)
        .single();

    final category = (
      id: categoryRes['id'] as String,
      name: categoryRes['name'] as String,
    );

    // 3. Fetch junction rows for this item's modifier groups
    final junctionRes = await _supabase
        .from('menu_item_modifier_groups')
        .select()
        .eq('menu_item_id', id);

    if (junctionRes.isEmpty) {
      return FullMenuItem(
        item: menuItem,
        category: category,
        modifierGroups: [],
      );
    }

    final junctions = junctionRes
        .map((json) => MenuItemModifierGroupsRow.fromJson(json))
        .toList();
    final modifierGroupIds = junctions.map((j) => j.modifierGroupId).toList();
    final isRequiredMap = {
      for (final j in junctions) j.modifierGroupId: j.isRequired,
    };

    // 4. Fetch modifier groups
    final groupsRes = await _supabase
        .from('modifier_groups')
        .select()
        .inFilter('id', modifierGroupIds)
        .order('sort_order', ascending: true);

    final groups = groupsRes
        .map((json) => ModifierGroupsRow.fromJson(json))
        .toList();

    // 5. Fetch modifiers for all groups
    final groupIdList = groups.map((g) => g.id).toList();
    final modifiersRes = await _supabase
        .from('modifiers')
        .select()
        .inFilter('modifier_group_id', groupIdList)
        .eq('is_available', true)
        .order('sort_order', ascending: true);

    final allModifiers = modifiersRes
        .map((json) => ModifiersRow.fromJson(json))
        .toList();

    // Group modifiers by modifier_group_id
    final modifiersByGroup = <String, List<ModifiersRow>>{};
    for (final mod in allModifiers) {
      modifiersByGroup.putIfAbsent(mod.modifierGroupId, () => []).add(mod);
    }

    final modifierGroups = groups.map((group) {
      return ModifierGroupWithModifiers(
        group: group,
        modifiers: modifiersByGroup[group.id] ?? [],
        isRequired: isRequiredMap[group.id] ?? false,
      );
    }).toList();

    return FullMenuItem(
      item: menuItem,
      category: category,
      modifierGroups: modifierGroups,
    );
  }

  /// Fetch store settings (single row).
  Future<StoreSettingsRow> fetchStoreSettings() async {
    final res = await _supabase
        .from('store_settings')
        .select()
        .limit(1)
        .single();

    return StoreSettingsRow.fromJson(res);
  }

  // -- Realtime --

  RealtimeChannel subscribeToMenuChanges({required void Function() onChange}) {
    return _supabase
        .channel('menu-changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'menu_items',
          callback: (_) => onChange(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'categories',
          callback: (_) => onChange(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'modifiers',
          callback: (_) => onChange(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'modifier_groups',
          callback: (_) => onChange(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'menu_item_modifier_groups',
          callback: (_) => onChange(),
        )
        .subscribe();
  }

  void unsubscribeFromMenuChanges(RealtimeChannel channel) {
    _supabase.removeChannel(channel);
  }

  /// Subscribe to real-time changes on promo_codes and promo_items.
  RealtimeChannel subscribeToPromoChanges({required void Function() onChange}) {
    return _supabase
        .channel('promo-changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'promo_codes',
          callback: (_) => onChange(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'promo_items',
          callback: (_) => onChange(),
        )
        .subscribe();
  }

  /// Unsubscribe from promo real-time changes.
  void unsubscribeFromPromoChanges(RealtimeChannel channel) {
    _supabase.removeChannel(channel);
  }
}

// ── Providers ─────────────────────────────────────────────────────

final menuRepositoryProvider = Provider<MenuRepository>((ref) {
  return MenuRepository(ref.watch(supabaseProvider));
});

final categoriesWithItemsProvider = FutureProvider<List<CategoryWithMenuItems>>(
  (ref) async {
    final repo = ref.watch(menuRepositoryProvider);
    return repo.fetchCategoriesWithItems();
  },
);

final menuItemDetailProvider = FutureProvider.family<FullMenuItem?, String>((
  ref,
  itemId,
) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchItemById(itemId);
});

final storeSettingsProvider = FutureProvider<StoreSettingsRow>((ref) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchStoreSettings();
});
