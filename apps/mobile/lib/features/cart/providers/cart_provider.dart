import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/cart_item.dart';
import '../data/cart_local_storage.dart';

/// Cart state notifier — mirrors web's useCartStore from stores/cart.ts.
class CartNotifier extends Notifier<List<CartItem>> {
  @override
  List<CartItem> build() {
    return CartLocalStorage.loadItems();
  }

  /// Add an item to the cart. If the same item+modifiers exists, increment quantity.
  /// Mirrors web's addItem from stores/cart.ts:57-76.
  void addItem(CartItem item) {
    final modifierIds = item.selectedModifiers.map((m) => m.id).toList();
    final existingIndex = _findItemIndex(item.menuItemId, modifierIds);

    if (existingIndex >= 0) {
      state[existingIndex].quantity += item.quantity;
    } else {
      state = [...state, item];
    }
    _persist();
  }

  /// Remove an item by menu item ID and modifier IDs.
  /// Mirrors web's removeItem from stores/cart.ts:78-84.
  void removeItem(String menuItemId, List<String> modifierIds) {
    final index = _findItemIndex(menuItemId, modifierIds);
    if (index >= 0) {
      state = [...state]..removeAt(index);
      _persist();
    }
  }

  /// Update the quantity of an item. If quantity is 0, removes it.
  /// Mirrors web's updateQuantity from stores/cart.ts:86-102.
  void updateQuantity(
    String menuItemId,
    List<String> modifierIds,
    int quantity,
  ) {
    final index = _findItemIndex(menuItemId, modifierIds);
    if (index < 0) return;

    if (quantity <= 0) {
      removeItem(menuItemId, modifierIds);
    } else {
      state[index].quantity = quantity;
      state = [...state];
      _persist();
    }
  }

  /// Clear all items from the cart.
  void clear() {
    state = [];
    CartLocalStorage.clear();
  }

  /// Total number of items (sum of quantities).
  int get totalItems => state.fold(0, (sum, item) => sum + item.quantity);

  /// Subtotal in cents (sum of all line totals, after promo discounts applied).
  int get subtotalCents =>
      state.fold(0, (sum, item) => sum + item.lineTotalCents);

  /// Original subtotal before promo discounts.
  int get originalSubtotalCents =>
      state.fold(0, (sum, item) => sum + item.originalLineTotalCents);

  /// Total promo discount across all cart items.
  int get totalDiscountCents =>
      state.fold(0, (sum, item) => sum + (item.discountPerUnitCents * item.quantity));

  /// Apply promo discounts to cart items based on previews.
  void applyPromoDiscounts(Map<String, int> itemDiscounts) {
    for (int i = 0; i < state.length; i++) {
      final discount = itemDiscounts[state[i].menuItemId] ?? 0;
      state[i].discountPerUnitCents = discount;
    }
    state = [...state];
    _persist();
  }

  /// Clear all promo discounts from cart items.
  void clearPromoDiscounts() {
    for (int i = 0; i < state.length; i++) {
      state[i].discountPerUnitCents = 0;
    }
    state = [...state];
    _persist();
  }

  /// Find item index by menu item ID and modifier IDs.
  /// Mirrors web's findItemIndex from stores/cart.ts:37-45.
  int _findItemIndex(String menuItemId, List<String> modifierIds) {
    final key = _getModifierKey(modifierIds);
    return state.indexWhere((item) {
      return item.menuItemId == menuItemId &&
          _getModifierKey(item.selectedModifiers.map((m) => m.id).toList()) ==
              key;
    });
  }

  /// Generate a modifier key for comparison.
  /// Mirrors web's getModifierKey from stores/cart.ts:33-35.
  String _getModifierKey(List<String> modifierIds) {
    final sorted = [...modifierIds]..sort();
    return sorted.join(',');
  }

  void _persist() {
    CartLocalStorage.saveItems(state);
  }
}

final cartProvider = NotifierProvider<CartNotifier, List<CartItem>>(() {
  return CartNotifier();
});

/// Derived provider: total item count (sum of quantities) for badges.
final cartItemCountProvider = Provider<int>((ref) {
  return ref
      .watch(cartProvider)
      .fold<int>(0, (sum, item) => sum + item.quantity);
});
