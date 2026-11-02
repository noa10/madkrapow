/// Pure helpers for the POS sale cart.
///
/// Framework-free so the sale panel, the notifier and the tests agree on line
/// identity and money. Mirrors `apps/web/src/lib/pos/cart.ts`.
library;

import 'pos_models.dart';

/// The largest quantity one merged cart line may carry. The API merges
/// duplicate lines too and rejects a merged line above this cap.
const maxPosLineQuantity = 99;

/// The largest quantity the item-options sheet lets a cashier add in one go.
/// Mirrors the web options modal, which reuses the menu quantity cap; the
/// server itself accepts up to [maxPosLineQuantity].
const maxPosAddQuantity = 10;

/// The largest number of distinct lines the order API accepts.
const maxPosCartLines = 50;

/// The largest number of add-ons the order API accepts on one line. Per-group
/// maxima can still add up past this, so the options sheet caps the total too.
const maxPosLineModifiers = 20;

/// One line of the current sale.
class PosCartLine {
  const PosCartLine({
    required this.key,
    required this.item,
    required this.quantity,
    required this.modifiers,
    required this.notes,
  });

  final String key;
  final PosMenuItem item;
  final int quantity;
  final List<PosCartModifier> modifiers;
  final String notes;

  PosCartLine copyWith({int? quantity}) => PosCartLine(
    key: key,
    item: item,
    quantity: quantity ?? this.quantity,
    modifiers: modifiers,
    notes: notes,
  );
}

/// Identity of a cart line: same dish + same options + same note.
///
/// Two lines with different add-ons (or different kitchen notes) must stay
/// separate; modifier ids are sorted so option order cannot split a line.
String posCartLineKey(
  String menuItemId,
  Iterable<String> modifierIds,
  String notes,
) {
  final sorted = modifierIds.toList()..sort();
  return '$menuItemId|${sorted.join(',')}|${notes.trim()}';
}

/// Integer-cents line total: (base + sum of add-on deltas) × quantity.
///
/// Floored at zero: a negative delta larger than the base price must not turn
/// a line negative (the database has no `total_cents >= 0` check).
int posLineTotalCents(
  int basePriceCents,
  Iterable<PosCartModifier> modifiers,
  int quantity,
) {
  var unit = basePriceCents;
  for (final modifier in modifiers) {
    unit += modifier.priceDeltaCents;
  }
  if (unit < 0) unit = 0;
  return unit * quantity;
}

/// Whether another line fits in the sale.
///
/// A dish that matches an existing line merges instead of adding a line, so it
/// is allowed even when the cart is at [maxPosCartLines].
bool posCartCanAddLine(
  List<PosCartLine> cart, {
  required PosMenuItem item,
  List<PosCartModifier> modifiers = const [],
  String notes = '',
}) {
  if (cart.length < maxPosCartLines) return true;
  final key = posCartLineKey(item.id, modifiers.map((m) => m.id), notes);
  return cart.any((line) => line.key == key);
}

/// Sum of every line total in the sale.
int posCartTotalCents(Iterable<PosCartLine> cart) {
  var total = 0;
  for (final line in cart) {
    total += posLineTotalCents(
      line.item.priceCents,
      line.modifiers,
      line.quantity,
    );
  }
  return total;
}

/// Add a dish (or merge into an identical line) and return a new cart.
///
/// Merging caps the quantity at [maxPosLineQuantity]; a new line starts at the
/// requested quantity (also capped).
List<PosCartLine> addPosCartLine(
  List<PosCartLine> cart, {
  required PosMenuItem item,
  List<PosCartModifier> modifiers = const [],
  String notes = '',
  int quantity = 1,
}) {
  final key = posCartLineKey(item.id, modifiers.map((m) => m.id), notes);
  final merged = <PosCartLine>[];
  var found = false;

  for (final line in cart) {
    if (line.key != key) {
      merged.add(line);
      continue;
    }
    found = true;
    merged.add(line.copyWith(quantity: _cap(line.quantity + quantity)));
  }

  if (!found) {
    merged.add(
      PosCartLine(
        key: key,
        item: item,
        quantity: _cap(quantity),
        modifiers: List.unmodifiable(modifiers),
        notes: notes.trim(),
      ),
    );
  }

  return List.unmodifiable(merged);
}

/// Change one line's quantity by [delta]; a line at zero is removed.
List<PosCartLine> changePosCartQuantity(
  List<PosCartLine> cart,
  String lineKey,
  int delta,
) {
  final updated = <PosCartLine>[];
  for (final line in cart) {
    if (line.key != lineKey) {
      updated.add(line);
      continue;
    }
    final next = line.quantity + delta;
    if (next <= 0) continue;
    updated.add(line.copyWith(quantity: _cap(next)));
  }
  return List.unmodifiable(updated);
}

/// Remove a line entirely.
List<PosCartLine> removePosCartLine(List<PosCartLine> cart, String lineKey) {
  return List.unmodifiable(cart.where((line) => line.key != lineKey));
}

int _cap(int quantity) =>
    quantity > maxPosLineQuantity ? maxPosLineQuantity : quantity;

/// Result of matching a sale against a freshly fetched menu.
class PosCartReconciliation {
  const PosCartReconciliation({
    required this.cart,
    required this.removed,
    required this.repriced,
  });

  final List<PosCartLine> cart;

  /// Dish names dropped because the dish or one of its add-ons can no longer
  /// be sold.
  final List<String> removed;

  /// True when a surviving line has a new dish or add-on price.
  final bool repriced;

  bool get reviewRequired => removed.isNotEmpty || repriced;

  String? get message {
    if (!reviewRequired) return null;
    final parts = <String>[];
    if (removed.isNotEmpty) {
      final names = removed.toSet().join(', ');
      final isOne = removed.toSet().length == 1;
      parts.add(
        isOne
            ? '$names is no longer available and was removed from the sale.'
            : '$names are no longer available and were removed from the sale.',
      );
    }
    if (repriced) parts.add('Menu prices or options changed.');
    parts.add('Review the updated total before charging.');
    return parts.join(' ');
  }
}

/// Match a sale against the live menu before charging.
///
/// The server re-prices every create, but cash changes hands in the POS before
/// that call. Lines whose dish or add-on disappeared are dropped; surviving
/// lines adopt the current price and add-ons so the total shown is the one the
/// server will charge. Either way [PosCartReconciliation.reviewRequired] makes
/// the cashier confirm the new total first.
PosCartReconciliation reconcilePosCart(
  List<PosCartLine> cart, {
  required Map<String, PosMenuItem> menuItemsById,
  required Map<String, List<PosModifierGroup>> modifierGroupsByItem,
}) {
  final updated = <PosCartLine>[];
  final removed = <String>[];
  var repriced = false;

  for (final line in cart) {
    final item = menuItemsById[line.item.id];
    if (item == null || !item.isAvailable) {
      removed.add(line.item.name);
      continue;
    }

    final groups = modifierGroupsByItem[item.id] ?? const <PosModifierGroup>[];
    final modifiersById = <String, PosModifier>{
      for (final group in groups)
        for (final modifier in group.modifiers) modifier.id: modifier,
    };

    final latestModifiers = <PosCartModifier>[];
    var invalid = false;
    for (final selected in line.modifiers) {
      final latest = modifiersById[selected.id];
      if (latest == null) {
        invalid = true;
        break;
      }
      latestModifiers.add(
        PosCartModifier(
          id: latest.id,
          name: latest.name,
          priceDeltaCents: latest.priceDeltaCents,
        ),
      );
    }
    if (!invalid) {
      for (final group in groups) {
        final selectedInGroup = line.modifiers
            .where(
              (selected) =>
                  group.modifiers.any((modifier) => modifier.id == selected.id),
            )
            .length;
        if ((group.required && selectedInGroup < group.requiredCount) ||
            selectedInGroup > group.maxSelections) {
          invalid = true;
          break;
        }
      }
    }
    if (invalid) {
      removed.add(line.item.name);
      continue;
    }

    final changed =
        item.priceCents != line.item.priceCents ||
        item.name != line.item.name ||
        latestModifiers.length != line.modifiers.length ||
        [
          for (var i = 0; i < latestModifiers.length; i++)
            latestModifiers[i].id != line.modifiers[i].id ||
                latestModifiers[i].name != line.modifiers[i].name ||
                latestModifiers[i].priceDeltaCents !=
                    line.modifiers[i].priceDeltaCents,
        ].any((different) => different);

    if (changed) repriced = true;
    updated.add(
      changed
          ? PosCartLine(
              key: line.key,
              item: item,
              quantity: line.quantity,
              modifiers: List.unmodifiable(latestModifiers),
              notes: line.notes,
            )
          : line,
    );
  }

  return PosCartReconciliation(
    cart: List.unmodifiable(updated),
    removed: List.unmodifiable(removed),
    repriced: repriced,
  );
}
