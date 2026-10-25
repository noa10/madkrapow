import '../../../generated/tables/orders.dart';

/// Billplz-related accessors for the generated [OrdersRow].
///
/// The checked-in `orders.dart` predates the Billplz migration. Regenerating
/// the whole schema produces a very large unrelated diff, so this extension
/// reads the new column from the raw row map instead. Rows are fetched with
/// `select()` (all columns), so `billplz_bill_id` is already present.
extension OrdersRowBillplz on OrdersRow {
  /// The Billplz bill id, or null for Stripe/other orders.
  String? get billplzBillId {
    final value = toJson()['billplz_bill_id'];
    return value is String && value.isNotEmpty ? value : null;
  }
}
