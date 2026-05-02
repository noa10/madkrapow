import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/supabase_provider.dart';
import '../data/promo_repository.dart';

/// Provides the PromoRepository instance.
final promoRepositoryProvider = Provider<PromoRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return PromoRepository(supabase);
});

/// Fetches all promos.
final promosProvider = FutureProvider<List<PromoCode>>((ref) async {
  final repo = ref.watch(promoRepositoryProvider);
  return repo.fetchPromos();
});

/// Controller for creating a new promo.
class CreatePromoNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> createPromo({
    required String code,
    String? description,
    required String scope,
    required String applicationType,
    required String discountType,
    required int discountValue,
    int? minOrderAmountCents,
    int? maxDiscountCents,
    int? maxUses,
    DateTime? validFrom,
    DateTime? validUntil,
    required bool isActive,
    List<String>? targetMenuItemIds,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(promoRepositoryProvider);
      final promo = await repo.createPromo(
        code: code,
        description: description,
        scope: scope,
        applicationType: applicationType,
        discountType: discountType,
        discountValue: discountValue,
        minOrderAmountCents: minOrderAmountCents,
        maxDiscountCents: maxDiscountCents,
        maxUses: maxUses,
        validFrom: validFrom,
        validUntil: validUntil,
        isActive: isActive,
      );
      // Save target items for order-scope auto promos
      if (targetMenuItemIds != null && scope == 'order' && applicationType == 'auto') {
        await repo.setPromoTargetItems(
          promoId: promo.id,
          menuItemIds: targetMenuItemIds,
        );
      }
      ref.invalidate(promosProvider);
    });
  }
}

final createPromoProvider = AsyncNotifierProvider<CreatePromoNotifier, void>(
  CreatePromoNotifier.new,
);

/// Controller for updating a promo.
class UpdatePromoNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> updatePromo(
    String id, {
    String? code,
    String? description,
    String? scope,
    String? applicationType,
    String? discountType,
    int? discountValue,
    int? minOrderAmountCents,
    int? maxDiscountCents,
    int? maxUses,
    DateTime? validFrom,
    DateTime? validUntil,
    bool? isActive,
    List<String>? targetMenuItemIds,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(promoRepositoryProvider);
      await repo.updatePromo(
        id,
        code: code,
        description: description,
        scope: scope,
        applicationType: applicationType,
        discountType: discountType,
        discountValue: discountValue,
        minOrderAmountCents: minOrderAmountCents,
        maxDiscountCents: maxDiscountCents,
        maxUses: maxUses,
        validFrom: validFrom,
        validUntil: validUntil,
        isActive: isActive,
      );
      // Update target items for order-scope auto promos
      if (targetMenuItemIds != null && scope == 'order' && applicationType == 'auto') {
        await repo.setPromoTargetItems(
          promoId: id,
          menuItemIds: targetMenuItemIds,
        );
      }
      ref.invalidate(promosProvider);
    });
  }
}

final updatePromoProvider = AsyncNotifierProvider<UpdatePromoNotifier, void>(
  UpdatePromoNotifier.new,
);

/// Controller for deleting a promo.
class DeletePromoNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> deletePromo(String id) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(promoRepositoryProvider);
      await repo.deletePromo(id);
      ref.invalidate(promosProvider);
    });
  }
}

final deletePromoProvider = AsyncNotifierProvider<DeletePromoNotifier, void>(
  DeletePromoNotifier.new,
);

/// Controller for toggling a promo's active status.
class TogglePromoNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> toggle(String id, bool currentlyActive) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(promoRepositoryProvider);
      await repo.toggleActive(id, currentlyActive);
      ref.invalidate(promosProvider);
    });
  }
}

final togglePromoProvider = AsyncNotifierProvider<TogglePromoNotifier, void>(
  TogglePromoNotifier.new,
);
