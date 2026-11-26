import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../generated/database.dart';
import 'menu_api_client.dart';
import 'menu_visibility.dart';

/// Hybrid menu repository:
/// - Reads: Supabase client directly (RLS-enforced, admin SELECT policies)
/// - Writes: Via MenuApiClient -> webapp API route (validation + audit trail)
class MenuRepository {
  MenuRepository(this._supabase, this._apiClient);

  final SupabaseClient _supabase;
  final MenuApiClient _apiClient;

  Future<Map<String, dynamic>> fetchGrabItemPrice(String itemId) =>
      _apiClient.fetchGrabItemPrice(itemId);

  Future<Map<String, dynamic>> fetchGrabModifierPrice(String modifierId) async {
    final row = await _supabase
        .from('channel_modifiers')
        .select('price_cents')
        .eq('channel', 'grabfood')
        .eq('modifier_id', modifierId)
        .maybeSingle();
    return {'exists': row != null, 'price_cents': row?['price_cents']};
  }

  Future<Map<String, dynamic>> saveGrabPrice({
    required bool isModifier,
    required String id,
    required int? priceCents,
    required int? expectedPriceCents,
    required bool expectedExists,
    bool updatePrice = true,
    bool regularPriceChanged = false,
    bool retryNotification = false,
  }) => _apiClient.saveGrabPrice(
    isModifier: isModifier,
    id: id,
    priceCents: priceCents,
    expectedPriceCents: expectedPriceCents,
    expectedExists: expectedExists,
    updatePrice: updatePrice,
    regularPriceChanged: regularPriceChanged,
    retryNotification: retryNotification,
  );

  // -- Categories --

  Future<List<CategoriesRow>> fetchCategories() async {
    final response = await _supabase
        .from('categories')
        .select()
        .order('sort_order', ascending: true);
    return response
        .where(isVisibleCategory)
        .map(CategoriesRow.fromJson)
        .toList();
  }

  Future<CategoriesRow> fetchCategory(String categoryId) async {
    final response = await _supabase
        .from('categories')
        .select()
        .eq('id', categoryId)
        .single();
    return CategoriesRow.fromJson(response);
  }

  Future<CategoriesRow> createCategory(CategoriesRow category) async {
    final created = await _apiClient.createCategory(
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    );
    return CategoriesRow.fromJson(created);
  }

  Future<CategoriesRow> updateCategory(CategoriesRow category) async {
    final updated = await _apiClient.updateCategory(
      category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    );
    return CategoriesRow.fromJson(updated);
  }

  Future<void> deleteCategory(String categoryId) async {
    await _apiClient.deleteCategory(categoryId);
    await _assertArchived('categories', categoryId, 'category');
  }

  Future<void> _assertArchived(String table, String id, String label) async {
    final Map<String, dynamic>? row;
    try {
      row = await _supabase
          .from(table)
          .select('archived_at')
          .eq('id', id)
          .maybeSingle();
    } on PostgrestException catch (e) {
      // Before the archival migration the DELETE really hard-deleted the row,
      // so a missing archived_at column still means the delete succeeded.
      if (isMissingColumnCode(e.code)) return;
      rethrow;
    }
    ensureArchivedRow(row, label);
  }

  // -- Menu Items --

  Future<List<MenuItemsRow>> fetchMenuItems({String? categoryId}) async {
    late final List<dynamic> response;
    if (categoryId != null) {
      response = await _supabase
          .from('menu_items')
          .select('*, categories(name)')
          .eq('category_id', categoryId)
          .order('sort_order', ascending: true);
    } else {
      response = await _supabase
          .from('menu_items')
          .select('*, categories(name)')
          .order('sort_order', ascending: true);
    }

    return response
        .where((row) => isVisibleMenuItem(row as Map<String, dynamic>))
        .map((json) => MenuItemsRow.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  Future<MenuItemsRow> fetchMenuItem(String itemId) async {
    final response = await _supabase
        .from('menu_items')
        .select('*, categories(name)')
        .eq('id', itemId)
        .single();
    return MenuItemsRow.fromJson(response);
  }

  Future<MenuItemsRow> createMenuItem(
    MenuItemsRow item, {
    bool isSignature = false,
  }) async {
    final created = await _apiClient.createMenuItem(
      name: item.name,
      priceCents: item.priceCents,
      categoryId: item.categoryId,
      description: item.description,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      isSignature: isSignature,
      sortOrder: item.sortOrder,
    );
    return MenuItemsRow.fromJson(created);
  }

  Future<MenuItemsRow> updateMenuItem(MenuItemsRow item) async {
    final updated = await _apiClient.updateMenuItem(
      item.id,
      name: item.name,
      priceCents: item.priceCents,
      categoryId: item.categoryId,
      description: item.description,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      sortOrder: item.sortOrder,
    );
    return MenuItemsRow.fromJson(updated);
  }

  Future<void> deleteMenuItem(String itemId) async {
    await _apiClient.deleteMenuItem(itemId);
    await _assertArchived('menu_items', itemId, 'item');
  }

  /// Full replacement — sends every field including null values.
  Future<MenuItemsRow> replaceMenuItem({
    required String itemId,
    required String name,
    required int priceCents,
    required String categoryId,
    required bool isAvailable,
    required int sortOrder,
    String? description,
    String? imageUrl,
    bool? isSignature,
  }) async {
    final updated = await _apiClient.replaceMenuItem(
      itemId,
      name: name,
      description: description,
      priceCents: priceCents,
      imageUrl: imageUrl,
      isAvailable: isAvailable,
      categoryId: categoryId,
      sortOrder: sortOrder,
      isSignature: isSignature,
    );
    return MenuItemsRow.fromJson(updated);
  }

  Future<void> toggleItemAvailability(String itemId, bool isAvailable) async {
    await _apiClient.updateMenuItem(itemId, isAvailable: isAvailable);
  }

  Future<void> reorderItems(List<String> itemIds) async {
    for (int i = 0; i < itemIds.length; i++) {
      await _apiClient.updateMenuItem(itemIds[i], sortOrder: i);
    }
  }

  Future<void> reorderCategories(List<String> categoryIds) async {
    for (int i = 0; i < categoryIds.length; i++) {
      await _apiClient.updateCategory(categoryIds[i], sortOrder: i);
    }
  }

  // -- Modifier Groups --

  Future<List<ModifierGroupsRow>> fetchModifierGroups() async {
    final response = await _supabase
        .from('modifier_groups')
        .select()
        .order('sort_order', ascending: true);
    return response
        .where(isActiveMenuRow)
        .map(ModifierGroupsRow.fromJson)
        .toList();
  }

  Future<ModifierGroupsRow> createModifierGroup(ModifierGroupsRow group) async {
    final created = await _apiClient.createModifierGroup(
      name: group.name,
      description: group.description,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      sortOrder: group.sortOrder,
    );
    return ModifierGroupsRow.fromJson(created);
  }

  Future<ModifierGroupsRow> updateModifierGroup(ModifierGroupsRow group) async {
    final updated = await _apiClient.updateModifierGroup(
      group.id,
      name: group.name,
      hasDescription: true,
      description: group.description,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      sortOrder: group.sortOrder,
    );
    return ModifierGroupsRow.fromJson(updated);
  }

  Future<void> deleteModifierGroup(String groupId) async {
    await _apiClient.deleteModifierGroup(groupId);
    await _assertArchived('modifier_groups', groupId, 'option group');
  }

  // -- Modifiers --

  Future<List<ModifiersRow>> fetchModifiers(String groupId) async {
    final response = await _supabase
        .from('modifiers')
        .select()
        .eq('modifier_group_id', groupId)
        .order('sort_order', ascending: true);
    return response.where(isActiveMenuRow).map(ModifiersRow.fromJson).toList();
  }

  Future<ModifiersRow> createModifier(ModifiersRow modifier) async {
    final created = await _apiClient.createModifier(
      name: modifier.name,
      modifierGroupId: modifier.modifierGroupId,
      priceDeltaCents: modifier.priceDeltaCents,
      isDefault: modifier.isDefault,
      isAvailable: modifier.isAvailable,
      sortOrder: modifier.sortOrder,
    );
    return ModifiersRow.fromJson(created);
  }

  Future<ModifiersRow> updateModifier(ModifiersRow modifier) async {
    final updated = await _apiClient.updateModifier(
      modifier.id,
      name: modifier.name,
      priceDeltaCents: modifier.priceDeltaCents,
      modifierGroupId: modifier.modifierGroupId,
      isDefault: modifier.isDefault,
      isAvailable: modifier.isAvailable,
      sortOrder: modifier.sortOrder,
    );
    return ModifiersRow.fromJson(updated);
  }

  Future<void> deleteModifier(String modifierId) async {
    await _apiClient.deleteModifier(modifierId);
    await _assertArchived('modifiers', modifierId, 'option');
  }

  // -- Item-Modifier Group Bindings --

  Future<List<MenuItemModifierGroupsRow>> fetchBindingsForItem(
    String itemId,
  ) async {
    final response = await _supabase
        .from('menu_item_modifier_groups')
        .select('*, modifier_groups(*)')
        .eq('menu_item_id', itemId);
    return response
        .where(isVisibleBinding)
        .map((json) => MenuItemModifierGroupsRow.fromJson(json))
        .toList();
  }

  Future<MenuItemModifierGroupsRow> bindModifierGroup({
    required String menuItemId,
    required String modifierGroupId,
    bool isRequired = false,
  }) async {
    final created = await _apiClient.bindModifierGroup(
      menuItemId: menuItemId,
      modifierGroupId: modifierGroupId,
      isRequired: isRequired,
    );
    return MenuItemModifierGroupsRow.fromJson(created);
  }

  Future<void> unbindModifierGroup({
    required String menuItemId,
    required String modifierGroupId,
  }) async {
    await _apiClient.unbindModifierGroup(
      menuItemId: menuItemId,
      modifierGroupId: modifierGroupId,
    );
  }

  Future<List<MenuItemModifierGroupsRow>> batchUpdateModifierBindings({
    required String menuItemId,
    required List<Map<String, dynamic>> bindings,
  }) async {
    final updated = await _apiClient.batchUpdateModifierBindings(
      menuItemId: menuItemId,
      bindings: bindings,
    );
    return updated
        .map((json) => MenuItemModifierGroupsRow.fromJson(json))
        .toList();
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
        .subscribe();
  }

  void unsubscribeFromChannel(RealtimeChannel channel) {
    _supabase.removeChannel(channel);
  }
}

/// Aggregated category with its items.
class CategoryWithItems {
  final CategoriesRow category;
  final List<MenuItemsRow> items;

  CategoryWithItems({required this.category, required this.items});
}
