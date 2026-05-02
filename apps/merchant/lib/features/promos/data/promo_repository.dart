import 'package:supabase_flutter/supabase_flutter.dart';

/// A promo code from the promo_codes table.
class PromoCode {
  PromoCode({
    required this.id,
    required this.code,
    this.description,
    required this.scope,
    required this.applicationType,
    required this.discountType,
    required this.discountValue,
    this.minOrderAmountCents,
    this.maxDiscountCents,
    this.maxUses,
    required this.currentUses,
    this.validFrom,
    this.validUntil,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String code;
  final String? description;
  final String scope;
  final String applicationType;
  final String discountType;
  final int discountValue;
  final int? minOrderAmountCents;
  final int? maxDiscountCents;
  final int? maxUses;
  final int currentUses;
  final DateTime? validFrom;
  final DateTime? validUntil;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory PromoCode.fromJson(Map<String, dynamic> json) {
    return PromoCode(
      id: json['id'] as String,
      code: json['code'] as String,
      description: json['description'] as String?,
      scope: json['scope'] as String? ?? 'order',
      applicationType: json['application_type'] as String? ?? 'code',
      discountType: json['discount_type'] as String,
      discountValue: json['discount_value'] as int,
      minOrderAmountCents: json['min_order_amount_cents'] as int?,
      maxDiscountCents: json['max_discount_cents'] as int?,
      maxUses: json['max_uses'] as int?,
      currentUses: json['current_uses'] as int? ?? 0,
      validFrom:
          json['valid_from'] != null ? DateTime.parse(json['valid_from'] as String) : null,
      validUntil: json['valid_until'] != null
          ? DateTime.parse(json['valid_until'] as String)
          : null,
      isActive: json['is_active'] as bool? ?? true,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  /// Status label based on current state.
  String get statusLabel {
    if (!isActive) return 'Inactive';
    if (maxUses != null && currentUses >= maxUses!) return 'Depleted';
    if (validUntil != null && DateTime.now().isAfter(validUntil!)) return 'Expired';
    if (validFrom != null && DateTime.now().isBefore(validFrom!)) return 'Scheduled';
    return 'Active';
  }

  /// Whether the status is a "good" state (active and usable).
  bool get isStatusActive {
    return statusLabel == 'Active';
  }
}

/// Repository for promo code CRUD operations.
/// Uses direct Supabase queries — RLS enforces access control.
class PromoRepository {
  PromoRepository(this._client);

  final SupabaseClient _client;

  /// Fetch all promo codes ordered by created_at DESC.
  Future<List<PromoCode>> fetchPromos() async {
    final response = await _client
        .from('promo_codes')
        .select()
        .order('created_at', ascending: false);

    return (response as List<dynamic>)
        .map((json) => PromoCode.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// Create a new promo code.
  Future<PromoCode> createPromo({
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
  }) async {
    final response = await _client.from('promo_codes').insert({
      'code': code,
      'description': description,
      'scope': scope,
      'application_type': applicationType,
      'discount_type': discountType,
      'discount_value': discountValue,
      'min_order_amount_cents': minOrderAmountCents,
      'max_discount_cents': maxDiscountCents,
      'max_uses': maxUses,
      'current_uses': 0,
      'valid_from': validFrom?.toIso8601String(),
      'valid_until': validUntil?.toIso8601String(),
      'is_active': isActive,
    }).select().single();

    return PromoCode.fromJson(response);
  }

  /// Update an existing promo code.
  Future<PromoCode> updatePromo(
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
  }) async {
    final updates = <String, dynamic>{};
    if (code != null) updates['code'] = code;
    if (description != null) updates['description'] = description;
    if (scope != null) updates['scope'] = scope;
    if (applicationType != null) updates['application_type'] = applicationType;
    if (discountType != null) updates['discount_type'] = discountType;
    if (discountValue != null) updates['discount_value'] = discountValue;
    if (minOrderAmountCents != null) updates['min_order_amount_cents'] = minOrderAmountCents;
    if (maxDiscountCents != null) updates['max_discount_cents'] = maxDiscountCents;
    if (maxUses != null) updates['max_uses'] = maxUses;
    if (validFrom != null) updates['valid_from'] = validFrom.toIso8601String();
    if (validUntil != null) updates['valid_until'] = validUntil.toIso8601String();
    if (isActive != null) updates['is_active'] = isActive;

    final response = await _client
        .from('promo_codes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    return PromoCode.fromJson(response);
  }

  /// Delete a promo code permanently.
  Future<void> deletePromo(String id) async {
    await _client.from('promo_codes').delete().eq('id', id);
  }

  /// Toggle the active status of a promo code.
  Future<PromoCode> toggleActive(String id, bool currentlyActive) async {
    final response = await _client
        .from('promo_codes')
        .update({'is_active': !currentlyActive})
        .eq('id', id)
        .select()
        .single();

    return PromoCode.fromJson(response);
  }

  /// Save target menu items for an order-scope auto promo.
  /// First deletes existing targets, then inserts the new set.
  Future<void> setPromoTargetItems({
    required String promoId,
    required List<String> menuItemIds,
  }) async {
    // Delete existing targets
    await _client
        .from('promo_items')
        .delete()
        .eq('promo_id', promoId)
        .eq('role', 'target');

    // Insert new targets
    if (menuItemIds.isNotEmpty) {
      final rows = menuItemIds.map((itemId) => {
        'promo_id': promoId,
        'menu_item_id': itemId,
        'role': 'target',
        'quantity': 1,
      }).toList();

      await _client.from('promo_items').insert(rows);
    }
  }

  /// Fetch target menu item IDs for a promo.
  Future<List<String>> fetchPromoTargetItems(String promoId) async {
    final response = await _client
        .from('promo_items')
        .select('menu_item_id')
        .eq('promo_id', promoId)
        .eq('role', 'target');

    return (response as List<dynamic>)
        .map((json) => json['menu_item_id'] as String)
        .toList();
  }
}
