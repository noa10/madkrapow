import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../cart/providers/cart_provider.dart';
import '../../checkout/data/checkout_models.dart' show PromoPreview;
import '../../checkout/data/checkout_repository.dart';
import '../../checkout/providers/checkout_providers.dart';
import '../data/menu_repository.dart';

final _promoPreviewCacheProvider =
    StateProvider<Map<String, ({PromoPreview preview, DateTime at})>>(
  (ref) => {},
);

final promoPreviewProvider =
    FutureProvider.family<PromoPreview?, String>((ref, itemId) async {
  final repo = ref.watch(checkoutRepositoryProvider);
  final cache = ref.watch(_promoPreviewCacheProvider);

  final cached = cache[itemId];
  if (cached != null && DateTime.now().difference(cached.at) < const Duration(minutes: 5)) {
    return cached.preview;
  }

  final preview = await repo.fetchPromoPreview(itemId);
  debugPrint('PromoPreview: itemId=$itemId → ${preview != null ? 'discountedCents=${preview.discountedCents}, savingsCents=${preview.savingsCents}' : 'null'}');

  if (preview != null) {
    ref.read(_promoPreviewCacheProvider)[itemId] = (
      preview: preview,
      at: DateTime.now(),
    );
  }

  return preview;
});

/// Returns a map of itemId → PromoPreview? (null entries preserved for items with no promo).
/// Using a Map instead of a List prevents index misalignment when some items have no promo.
final promoPreviewBatchProvider =
    FutureProvider.family<Map<String, PromoPreview?>, List<String>>((ref, itemIds) async {
  final repo = ref.watch(checkoutRepositoryProvider);
  final cache = ref.watch(_promoPreviewCacheProvider);
  final now = DateTime.now();

  final results = <String, PromoPreview?>{};
  for (final itemId in itemIds) {
    final cached = cache[itemId];
    if (cached != null && now.difference(cached.at) < const Duration(minutes: 5)) {
      results[itemId] = cached.preview;
      continue;
    }

    final preview = await repo.fetchPromoPreview(itemId);
    if (preview != null) {
      ref.read(_promoPreviewCacheProvider)[itemId] = (
        preview: preview,
        at: now,
      );
    }
    results[itemId] = preview;
  }

  return results;
});

/// Fetches promo previews for all unique cart item IDs and applies discounts to the cart.
/// Only item-scoped percentage promos reduce per-unit price — order-scoped promos are
/// handled separately at checkout to avoid double-counting.
Future<void> refreshCartPromoDiscounts(WidgetRef ref) async {
  final cart = ref.read(cartProvider);
  if (cart.items.isEmpty) {
    ref.read(cartProvider.notifier).clearPromoDiscounts();
    return;
  }

  final uniqueItemIds = cart.items.map((item) => item.menuItemId).toSet().toList();
  final previewMap = await ref.read(promoPreviewBatchProvider(uniqueItemIds).future);

  // Only apply per-item discounts for item-scoped promos.
  // Order-scoped promos are applied at checkout, not at the item level.
  final discountMap = <String, int>{};
  for (final itemId in uniqueItemIds) {
    final preview = previewMap[itemId];
    if (preview != null &&
        preview.discountType == 'percentage' &&
        preview.savingsCents > 0 &&
        preview.isItemScoped) {
      discountMap[itemId] = preview.savingsCents;
    }
  }

  ref.read(cartProvider.notifier).applyPromoDiscounts(discountMap);
}

// ── Realtime subscription providers ─────────────────────────────────

/// Holds the active realtime channel subscription for promos, or null.
final promoRealtimeSubscriptionProvider =
    StateProvider<RealtimeChannel?>((ref) => null);

/// Whether a promo update was recently received (shows "Promos updated" indicator).
final promoUpdatedProvider = StateProvider<bool>((ref) => false);

/// Watcher provider that subscribes to promo realtime changes and
/// invalidates promo preview providers when changes occur.
/// Also refreshes cart promo discounts if the cart is not empty.
/// Uses a 3-second debounce to avoid rapid re-fetches.
final promoRealtimeWatcherProvider = Provider<void>((ref) {
  final repo = ref.watch(menuRepositoryProvider);
  RealtimeChannel? channel;
  Timer? debounce;

  void onPromoChange() {
    debounce?.cancel();
    debounce = Timer(const Duration(seconds: 3), () {
      // Clear promo preview cache so next watch fetches fresh data
      ref.read(_promoPreviewCacheProvider.notifier).state = {};
      // Show update indicator in the home screen
      ref.read(promoUpdatedProvider.notifier).state = true;
      // Reset indicator after 3 seconds
      Timer(const Duration(seconds: 3), () {
        ref.read(promoUpdatedProvider.notifier).state = false;
      });
    });
  }

  ref.onDispose(() {
    debounce?.cancel();
    if (channel != null) {
      repo.unsubscribeFromPromoChanges(channel);
    }
  });

  channel = repo.subscribeToPromoChanges(onChange: onPromoChange);
});
