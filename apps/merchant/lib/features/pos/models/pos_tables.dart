/// Pure helpers for the dine-in table board and table QR links.
///
/// Mirrors `apps/web/src/lib/pos/tables.ts` so the Flutter board, the settle
/// sheets and the API agree on totals, counts and blockers.
library;

import 'pos_models.dart';

/// Statuses that keep a dine-in table occupied (mirrors the open-order index).
const openDineInStatuses = <String>[
  'pending',
  'paid',
  'accepted',
  'preparing',
  'ready',
];

const minPax = 1;
const maxPax = 50;

bool isOpenDineInStatus(String status) => openDineInStatuses.contains(status);

/// Validate a pax value from an untrusted source. Returns null when invalid.
int? parsePax(Object? value) {
  final int? parsed = switch (value) {
    final int number => number,
    final num number => number.toInt() == number ? number.toInt() : null,
    final String text when text.trim().isNotEmpty => int.tryParse(text.trim()),
    _ => null,
  };
  if (parsed == null || parsed < minPax || parsed > maxPax) return null;
  return parsed;
}

/// Absolute URL encoded in a table's QR code.
String tableQrUrl(String token, String baseUrl) {
  final trimmed = baseUrl.replaceAll(RegExp(r'/+$'), '');
  return '$trimmed/t/${Uri.encodeComponent(token)}';
}

/// Minutes since [createdAt], never negative.
int posAgeMinutes(DateTime createdAt, DateTime now) {
  final minutes = now.difference(createdAt).inMinutes;
  return minutes < 0 ? 0 : minutes;
}

/// Why a table cannot close. Only an unsettled bill blocks closing: the POS
/// has no control that moves a ticket through the kitchen, so requiring
/// `ready` stranded every pay-now table (migration 061).
enum TableCloseBlockReason { empty, unpaid }

/// Derived view of one table plus its open orders.
class TableSummary {
  const TableSummary({
    required this.table,
    required this.orders,
    required this.isOccupied,
    required this.openOrderCount,
    required this.totalCents,
    required this.pax,
    required this.hasUnpaid,
    required this.canClose,
    required this.closeBlockReason,
    required this.oldestCreatedAt,
    required this.kitchenActiveOrderCount,
    required this.dinerClaimedOrderCount,
  });

  final RestaurantTable table;
  final List<PosOpenOrder> orders;
  final bool isOccupied;
  final int openOrderCount;
  final int totalCents;
  final int? pax;
  final bool hasUnpaid;
  final bool canClose;
  final TableCloseBlockReason? closeBlockReason;
  final DateTime? oldestCreatedAt;

  /// Paid tickets the kitchen has not marked `ready`. Closing completes them,
  /// so the confirm dialog warns about them.
  final int kitchenActiveOrderCount;

  /// Paid tickets whose payment was self-declared by a diner at the table QR.
  /// The server cannot see the bank transfer, so staff must verify it.
  final int dinerClaimedOrderCount;

  bool get hasUnverifiedDinerPayment => dinerClaimedOrderCount > 0;
}

/// Derive the table board state from a table and its open orders.
TableSummary summarizeTable(
  RestaurantTable table,
  Iterable<PosOpenOrder> orders,
) {
  final open = orders
      .where((order) => isOpenDineInStatus(order.status))
      .toList(growable: false);

  var totalCents = 0;
  var hasUnpaid = false;
  var kitchenActive = 0;
  var dinerClaimed = 0;
  int? pax;
  DateTime? oldest;

  for (final order in open) {
    totalCents += order.totalCents;
    if (order.isPending) hasUnpaid = true;
    if (!order.isPending && order.status != 'ready') kitchenActive++;
    if (!order.isPending && order.paymentClaimedByDiner) dinerClaimed++;
    final orderPax = order.pax;
    if (orderPax != null && (pax == null || orderPax > pax)) {
      pax = orderPax;
    }
    if (oldest == null || order.createdAt.isBefore(oldest)) {
      oldest = order.createdAt;
    }
  }

  TableCloseBlockReason? blockReason;
  if (open.isEmpty) {
    blockReason = TableCloseBlockReason.empty;
  } else if (hasUnpaid) {
    blockReason = TableCloseBlockReason.unpaid;
  }

  return TableSummary(
    table: table,
    orders: open,
    isOccupied: open.isNotEmpty,
    openOrderCount: open.length,
    totalCents: totalCents,
    pax: pax,
    hasUnpaid: hasUnpaid,
    canClose: blockReason == null,
    closeBlockReason: blockReason,
    oldestCreatedAt: oldest,
    kitchenActiveOrderCount: kitchenActive,
    dinerClaimedOrderCount: dinerClaimed,
  );
}

/// Human copy for the close-table blocker.
String? closeBlockedMessage(TableCloseBlockReason? reason) {
  switch (reason) {
    case TableCloseBlockReason.empty:
      return 'This table has no open orders.';
    case TableCloseBlockReason.unpaid:
      return 'Collect payment for the unpaid order before closing the table.';
    case null:
      return null;
  }
}

/// Warning for the close confirmation.
///
/// Covers tickets still in the kitchen and table-QR payments the diner declared
/// themselves — the server cannot see that bank transfer, so staff verify it
/// before the table is released.
String? closeTableWarning(
  int kitchenActiveOrderCount, [
  int dinerClaimedOrderCount = 0,
]) {
  final parts = <String>[];
  if (kitchenActiveOrderCount > 0) {
    final isOne = kitchenActiveOrderCount == 1;
    parts.add(
      '$kitchenActiveOrderCount order${isOne ? ' is' : 's are'} still in the '
      'kitchen. Closing marks ${isOne ? 'it' : 'them'} served and frees the '
      'table.',
    );
  }
  if (dinerClaimedOrderCount > 0) {
    final isOne = dinerClaimedOrderCount == 1;
    parts.add(
      '$dinerClaimedOrderCount payment${isOne ? ' was' : 's were'} '
      'self-declared by ${isOne ? 'a diner' : 'diners'} via table QR. Verify '
      'the bank transfer before closing.',
    );
  }
  return parts.isEmpty ? null : parts.join('\n\n');
}

/// Pending dine-in orders for a table, de-duplicated by id (realtime can race).
List<PosOpenOrder> unpaidOrdersForTable(Iterable<PosOpenOrder> orders) {
  final seen = <String>{};
  final unpaid = <PosOpenOrder>[];
  for (final order in orders) {
    if (!order.isPending) continue;
    // Mirror the settle RPC's predicate so the button total always equals what
    // the database will mark paid.
    if (!order.isDineIn) continue;
    if (!seen.add(order.id)) continue;
    unpaid.add(order);
  }
  return List.unmodifiable(unpaid);
}

/// What a cashier is collecting: one take-away ticket or every unpaid order at
/// a table. The UI groups the money; the ledger stays per order.
class PosSettleTarget {
  const PosSettleTarget({
    required this.kind,
    required this.id,
    required this.label,
    required this.context,
    required this.amountCents,
    required this.orderCount,
    required this.orderIds,
  });

  final PosSettleKind kind;

  /// Order id for [PosSettleKind.order], table id for [PosSettleKind.table].
  final String id;
  final String label;
  final String context;
  final int amountCents;
  final int orderCount;

  /// Exactly which tickets the cashier is confirming. The table settle RPC
  /// rejects the call when the live pending set differs.
  final List<String> orderIds;
}

enum PosSettleKind { order, table }

/// One collect action for every unpaid order at a table.
PosSettleTarget? buildTableSettleTargetFromOrders(
  RestaurantTable table,
  Iterable<PosOpenOrder> orders,
) {
  final unpaid = unpaidOrdersForTable(orders);
  if (unpaid.isEmpty) return null;

  var amountCents = 0;
  for (final order in unpaid) {
    amountCents += order.totalCents;
  }

  return PosSettleTarget(
    kind: PosSettleKind.table,
    id: table.id,
    label: 'Table ${table.label}',
    context: '${unpaid.length} unpaid order${unpaid.length == 1 ? '' : 's'}',
    amountCents: amountCents,
    orderCount: unpaid.length,
    orderIds: List.unmodifiable(unpaid.map((order) => order.id)),
  );
}

/// Grouped collect target for a table summary.
PosSettleTarget? buildTableSettleTarget(TableSummary summary) =>
    buildTableSettleTargetFromOrders(summary.table, summary.orders);

/// Collect target for a single ticket (take-away, or a direct order settle).
PosSettleTarget buildOrderSettleTarget(PosOpenOrder order) {
  final name = order.customerName;
  return PosSettleTarget(
    kind: PosSettleKind.order,
    id: order.id,
    label: order.code,
    context: name == null || name.isEmpty ? 'Take-away' : 'Take-away · $name',
    amountCents: order.totalCents,
    orderCount: 1,
    orderIds: List.unmodifiable([order.id]),
  );
}
