import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../cart/providers/cart_provider.dart';
import '../../checkout/data/checkout_models.dart' show PromoPreview;
import '../../checkout/data/checkout_repository.dart';
import '../../checkout/providers/checkout_providers.dart';

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
  if (cart.isEmpty) {
    ref.read(cartProvider.notifier).clearPromoDiscounts();
    return;
  }

  final uniqueItemIds = cart.map((item) => item.menuItemId).toSet().toList();
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
