import 'package:hive_flutter/hive_flutter.dart';

import 'cart_item.dart';

const _boxName = 'cart_box';
const _itemsKey = 'items';

/// Hive-based persistence for cart state.
/// Mirrors the web's zustand/persist with localStorage.
class CartLocalStorage {
  CartLocalStorage._();
  static Box? _box;

  static Future<void> init() async {
    _box = await Hive.openBox(_boxName);
  }

  static List<CartItem> loadItems() {
    final box = _box;
    if (box == null) return [];

    final rawList = box.get(_itemsKey) as List?;
    if (rawList == null) return [];

    return rawList
        .map((raw) => CartItem.fromJson(Map<String, dynamic>.from(raw as Map)))
        .toList();
  }

  static Future<void> saveItems(List<CartItem> items) async {
    final box = _box;
    if (box == null) return;

    await box.put(
      _itemsKey,
      items.map((item) => item.toJson()).toList(),
    );
  }

  static Future<void> clear() async {
    final box = _box;
    if (box == null) return;
    await box.delete(_itemsKey);
  }
}
