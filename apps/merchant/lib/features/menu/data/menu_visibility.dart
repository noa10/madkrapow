const historicalCategoryId = 'de5a0000-0000-4000-8000-000000000000';

/// Archived rows are hidden; missing `archived_at` means active for older schemas.
bool isActiveMenuRow(Map<String, dynamic> row) => row['archived_at'] == null;

bool isVisibleCategory(Map<String, dynamic> row) =>
    isActiveMenuRow(row) && row['id'] != historicalCategoryId;

bool isVisibleMenuItem(Map<String, dynamic> row) =>
    isActiveMenuRow(row) && row['category_id'] != historicalCategoryId;

/// A bound group requires picks when either the per-item link or the group's
/// own minimum says so. Mirrors the web `isModifierGroupRequired` helper and
/// the order RPC (`is_required OR min_selections > 0`).
bool isEffectivelyRequiredBinding({
  required bool isRequired,
  required int minSelections,
}) => isRequired || minSelections > 0;

/// Binding rows hide when their joined modifier group is archived.
bool isVisibleBinding(Map<String, dynamic> row) {
  final group = row['modifier_groups'];
  return group is Map<String, dynamic> && isActiveMenuRow(group);
}

/// PostgREST returns 42703 when a selected column has not been migrated yet.
bool isMissingColumnCode(String? code) => code == '42703';

/// The GrabFood price override embedded on a menu item row, or null when the
/// channel uses the regular price.
int? grabItemPriceCents(Map<String, dynamic> row) {
  final rows = row['channel_products'];
  if (rows is! List) return null;
  for (final entry in rows) {
    if (entry is! Map) continue;
    if (entry['channel'] != 'grabfood') continue;
    final price = entry['price_cents'];
    return price is int ? price : null;
  }
  return null;
}

/// A DELETE filtered by RLS returns success without changing rows, so the
/// caller must read the row back and confirm it was archived before reporting
/// that the delete worked.
void ensureArchivedRow(Map<String, dynamic>? row, String label) {
  if (row == null || row['archived_at'] == null) {
    throw Exception(
      'The server did not confirm that the $label was deleted. '
      'You may not have permission, or the row may have changed. '
      'Reload the menu and try again.',
    );
  }
}
