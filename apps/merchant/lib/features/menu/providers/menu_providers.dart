import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/supabase_provider.dart';
import '../data/menu_api_client.dart';
import '../data/menu_repository.dart';
import '../../../generated/database.dart';

/// Provides the MenuApiClient instance.
final menuApiClientProvider = Provider<MenuApiClient>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return MenuApiClient(supabase);
});

/// Provides the MenuRepository instance.
final menuRepositoryProvider = Provider<MenuRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  final apiClient = ref.watch(menuApiClientProvider);
  return MenuRepository(supabase, apiClient);
});

/// Categories with items — fetches categories and their items separately,
/// then combines them into CategoryWithItems objects.
final categoriesWithItemsProvider =
    FutureProvider<List<CategoryWithItems>>((ref) async {
  final repo = ref.watch(menuRepositoryProvider);

  final categories = await repo.fetchCategories();
  final allItems = await repo.fetchMenuItems();

  final result = <CategoryWithItems>[];
  for (final category in categories) {
    final items = allItems
        .where((item) => item.categoryId == category.id)
        .toList();
    result.add(CategoryWithItems(category: category, items: items));
  }
  return result;
});

/// Fetch a single category by ID.
final categoryDetailProvider =
    FutureProvider.family<CategoriesRow, String>((ref, categoryId) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchCategory(categoryId);
});

/// Fetch a single menu item detail with its modifier group bindings.
final menuItemDetailProvider =
    FutureProvider.family<MenuItemsRow, String>((ref, itemId) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchMenuItem(itemId);
});

/// Modifier groups list provider.
final modifierGroupsProvider =
    FutureProvider<List<ModifierGroupsRow>>((ref) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchModifierGroups();
});

/// Modifiers for a specific group provider.
final modifiersForGroupProvider =
    FutureProvider.family<List<ModifiersRow>, String>((ref, groupId) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchModifiers(groupId);
});

/// Modifier bindings for a menu item provider.
final modifierBindingsForItemProvider =
    FutureProvider.family<List<MenuItemModifierGroupsRow>, String>(
        (ref, itemId) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchBindingsForItem(itemId);
});

/// Realtime subscription provider for menu changes.
final menuRealtimeSubscriptionProvider =
    StateProvider<RealtimeChannel?>((ref) => null);

/// Watcher provider that subscribes to menu realtime changes and
/// invalidates the categoriesWithItemsProvider when changes occur.
final menuRealtimeWatcherProvider = Provider<void>((ref) {
  final repo = ref.watch(menuRepositoryProvider);
  RealtimeChannel? channel;

  ref.onDispose(() {
    if (channel != null) {
      repo.unsubscribeFromChannel(channel);
    }
  });

  channel = repo.subscribeToMenuChanges(
    onChange: () {
      ref.invalidate(categoriesWithItemsProvider);
    },
  );
});
