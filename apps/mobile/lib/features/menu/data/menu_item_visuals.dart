import '../../../generated/tables/menu_items.dart';

/// Human-readable labels for the `spice_level` column (0–3).
const List<String> menuSpiceLevelLabels = <String>[
  'Mild',
  'Medium',
  'Hot',
  'Thai-hot',
];

/// Returns the label for a clamped spice level.
String menuSpiceLevelLabel(int level) {
  if (level <= 0) return menuSpiceLevelLabels.first;
  if (level >= menuSpiceLevelLabels.length) return menuSpiceLevelLabels.last;
  return menuSpiceLevelLabels[level];
}

/// Read-only accessors for menu columns added by migration 041.
///
/// The generated `MenuItemsRow` is older than the live schema, so it does not
/// expose these fields as typed getters. Supabase still returns them because
/// the repository selects all columns. These accessors keep the visual layer
/// honest until the Dart models are regenerated.
extension MenuItemVisuals on MenuItemsRow {
  /// Whether this item is featured in the Chef's Picks spotlight.
  bool get isSignature => data['is_signature'] as bool? ?? false;

  /// 0 = mild, 1 = medium, 2 = hot, 3 = Thai-hot.
  int get spiceLevel {
    final raw = data['spice_level'];
    final parsed = raw is num ? raw.toInt() : int.tryParse('$raw') ?? 0;
    if (parsed < 0) return 0;
    if (parsed > 3) return 3;
    return parsed;
  }

  /// Free-form short ingredient names shown on item details.
  List<String> get ingredients {
    final raw = data['ingredients'];
    if (raw is! List) return const <String>[];
    return raw.whereType<String>().toList(growable: false);
  }
}
