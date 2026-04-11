/// Represents a selected modifier on a cart item.
/// Mirrors the web's SelectedModifier from stores/cart.ts.
class SelectedModifier {
  const SelectedModifier({
    required this.id,
    required this.name,
    required this.priceDeltaCents,
  });

  final String id;
  final String name;
  final int priceDeltaCents;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'price_delta_cents': priceDeltaCents,
      };

  factory SelectedModifier.fromJson(Map<String, dynamic> json) {
    return SelectedModifier(
      id: json['id'] as String,
      name: json['name'] as String,
      priceDeltaCents: json['price_delta_cents'] as int,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SelectedModifier && id == other.id;

  @override
  int get hashCode => id.hashCode;
}

/// Represents a cart item.
/// Mirrors the web's CartItem from stores/cart.ts.
class CartItem {
  CartItem({
    required this.menuItemId,
    required this.unitPrice,
    this.quantity = 1,
    this.selectedModifiers = const [],
    this.specialInstructions = '',
    this.name = '',
    this.imageUrl,
  });

  final String menuItemId;
  final String name;
  final int unitPrice; // cents
  int quantity;
  List<SelectedModifier> selectedModifiers;
  String specialInstructions;
  final String? imageUrl;

  /// Item key for deduplication — mirrors web's getModifierKey.
  /// Same item + same modifiers = increment quantity.
  /// Same item + different modifiers = separate cart entry.
  String get itemKey {
    final modIds = selectedModifiers.map((m) => m.id).toList()..sort();
    return '$menuItemId:${modIds.join(",")}';
  }

  /// Line total: (unit price + all modifier deltas) * quantity.
  int get lineTotalCents {
    final modTotal = selectedModifiers.fold<int>(
      0,
      (sum, m) => sum + m.priceDeltaCents,
    );
    return quantity * (unitPrice + modTotal);
  }

  Map<String, dynamic> toJson() => {
        'menu_item_id': menuItemId,
        'name': name,
        'unit_price': unitPrice,
        'quantity': quantity,
        'selected_modifiers':
            selectedModifiers.map((m) => m.toJson()).toList(),
        'special_instructions': specialInstructions,
        'image_url': imageUrl,
      };

  factory CartItem.fromJson(Map<String, dynamic> json) {
    return CartItem(
      menuItemId: json['menu_item_id'] as String,
      name: json['name'] as String? ?? '',
      unitPrice: json['unit_price'] as int,
      quantity: json['quantity'] as int? ?? 1,
      selectedModifiers: (json['selected_modifiers'] as List?)
              ?.map((m) =>
                  SelectedModifier.fromJson(m as Map<String, dynamic>))
              .toList() ??
          [],
      specialInstructions: json['special_instructions'] as String? ?? '',
      imageUrl: json['image_url'] as String?,
    );
  }
}
