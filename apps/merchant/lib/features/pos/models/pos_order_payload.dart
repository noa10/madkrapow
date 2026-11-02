/// Builds the request body for `POST /api/pos/orders`.
///
/// Pure and framework-free (mirroring `pos_cart.dart`) so the wire contract
/// is unit-testable without an HTTP stack.
///
/// The server removed pay-later: a POS ticket is only created once the money
/// is in, because the kitchen starts preparing as soon as the ticket lands.
/// A POS order is therefore always created paid, with `payment_method`
/// recording cash or the company QR.
///
/// This payload never emits a `payment_timing` key. A stale client that still
/// sends it is rejected with HTTP 400: "Reload the POS to update before
/// charging — this page is running an older version."
library;

import 'pos_models.dart';

/// The body of `POST /api/pos/orders`.
///
/// `payment_method` is always present; `table_id` and `pax` only ride along
/// with a dine-in order; `customer_name` only when the cashier typed one.
Map<String, dynamic> buildPosOrderPayload({
  required List<Map<String, dynamic>> items,
  required PosOrderType orderType,
  required PosPaymentMethod paymentMethod,
  String? tableId,
  int? pax,
  String? customerName,
}) {
  final name = customerName?.trim() ?? '';

  return {
    'items': items,
    'order_type': orderType.wire,
    'payment_method': paymentMethod.wire,
    if (orderType == PosOrderType.dineIn && tableId != null) 'table_id': tableId,
    if (orderType == PosOrderType.dineIn && pax != null) 'pax': pax,
    if (name.isNotEmpty) 'customer_name': name,
  };
}
