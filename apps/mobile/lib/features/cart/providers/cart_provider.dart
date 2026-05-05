import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/cart_item.dart';
import '../data/cart_local_storage.dart';

class CartState {
  final List<CartItem> items;
  final bool includeCutlery;

  const CartState({
    this.items = const [],
    this.includeCutlery = true,
  });
}

class CartNotifier extends Notifier<CartState> {
  @override
  CartState build() {
    return CartState(
      items: CartLocalStorage.loadItems(),
      includeCutlery: CartLocalStorage.loadIncludeCutlery(),
    );
  }

  void addItem(CartItem item) {
    final modifierIds = item.selectedModifiers.map((m) => m.id).toList();
    final existingIndex = _findItemIndex(item.menuItemId, modifierIds);

    if (existingIndex >= 0) {
      state.items[existingIndex].quantity += item.quantity;
      state = CartState(items: [...state.items], includeCutlery: state.includeCutlery);
    } else {
      state = CartState(items: [...state.items, item], includeCutlery: state.includeCutlery);
    }
    _persist();
  }

  void removeItem(String menuItemId, List<String> modifierIds) {
    final index = _findItemIndex(menuItemId, modifierIds);
    if (index >= 0) {
      final items = [...state.items]..removeAt(index);
      state = CartState(items: items, includeCutlery: state.includeCutlery);
      _persist();
    }
  }

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
      state.items[index].quantity = quantity;
      state = CartState(items: [...state.items], includeCutlery: state.includeCutlery);
      _persist();
    }
  }

  void setIncludeCutlery(bool value) {
    state = CartState(items: state.items, includeCutlery: value);
    CartLocalStorage.saveIncludeCutlery(value);
  }

  void clear() {
    state = const CartState();
    CartLocalStorage.clear();
  }

  int get totalItems => state.items.fold(0, (sum, item) => sum + item.quantity);

  int get subtotalCents =>
      state.items.fold(0, (sum, item) => sum + item.lineTotalCents);

  int get originalSubtotalCents =>
      state.items.fold(0, (sum, item) => sum + item.originalLineTotalCents);

  int get totalDiscountCents =>
      state.items.fold(0, (sum, item) => sum + (item.discountPerUnitCents * item.quantity));

  void applyPromoDiscounts(Map<String, int> itemDiscounts) {
    for (int i = 0; i < state.items.length; i++) {
      final discount = itemDiscounts[state.items[i].menuItemId] ?? 0;
      state.items[i].discountPerUnitCents = discount;
    }
    state = CartState(items: [...state.items], includeCutlery: state.includeCutlery);
    _persist();
  }

  void clearPromoDiscounts() {
    for (int i = 0; i < state.items.length; i++) {
      state.items[i].discountPerUnitCents = 0;
    }
    state = CartState(items: [...state.items], includeCutlery: state.includeCutlery);
    _persist();
  }

  int _findItemIndex(String menuItemId, List<String> modifierIds) {
    final key = _getModifierKey(modifierIds);
    return state.items.indexWhere((item) {
      return item.menuItemId == menuItemId &&
          _getModifierKey(item.selectedModifiers.map((m) => m.id).toList()) ==
              key;
    });
  }

  String _getModifierKey(List<String> modifierIds) {
    final sorted = [...modifierIds]..sort();
    return sorted.join(',');
  }

  void _persist() {
    CartLocalStorage.saveItems(state.items);
  }
}

final cartProvider = NotifierProvider<CartNotifier, CartState>(() {
  return CartNotifier();
});

final cartItemCountProvider = Provider<int>((ref) {
  return ref
      .watch(cartProvider)
      .items
      .fold<int>(0, (sum, item) => sum + item.quantity);
});
