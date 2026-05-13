import '../../generated/tables/orders.dart';

/// Display code for orders.
///
///  - Production codes are stored in `orders.display_code` (written by the
///    Postgres trigger `orders_assign_display_code`). Format: `MK-NNN` base,
///    auto-expands to `MK-NNNN`, etc. when a day's pool fills.
///  - [getOrderDisplayCode] prefers the stored code and falls back to the
///    legacy FNV-1a daily hash for rows without one.
///  - [generateOrderDisplayCode] is the legacy fallback kept only so callers
///    that have just an id (e.g. before the order row loads) can render
///    something. Do not use for new callers that have the row.
String getOrderDisplayCode(OrdersRow order, [DateTime? date]) {
  final stored = order.getField<String>('display_code');
  if (stored != null && stored.isNotEmpty) return stored;
  return generateOrderDisplayCode(order.id, date);
}

/// Legacy deterministic daily display code. Kept only as a fallback for
/// pre-migration rows and for callers that have only an order id.
String generateOrderDisplayCode(String orderId, [DateTime? date]) {
  final now = date ?? DateTime.now();
  // Kuala Lumpur is UTC+8
  final klDate = now.toUtc().add(const Duration(hours: 8));
  final dateStr = '${klDate.year}-${_pad2(klDate.month)}-${_pad2(klDate.day)}';
  final hash = _fnv1a(orderId + dateStr);
  final num_ = hash % 1000;
  return 'MK-${num_.toString().padLeft(3, '0')}';
}

int _fnv1a(String input) {
  const int fnvPrime = 0x01000193;
  const int offsetBasis = 0x811c9dc5;
  int hash = offsetBasis;
  for (int i = 0; i < input.length; i++) {
    hash ^= input.codeUnitAt(i);
    hash = (hash * fnvPrime) & 0xFFFFFFFF;
  }
  return hash;
}

String _pad2(int value) => value.toString().padLeft(2, '0');
