import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_tables.dart';

RestaurantTable _table({
  String id = 't1',
  String label = 'T1',
  String? zone = 'Indoor',
  int seats = 4,
}) {
  return RestaurantTable(
    id: id,
    label: label,
    zone: zone,
    seats: seats,
    isActive: true,
    sortOrder: 0,
  );
}

PosOpenOrder _order({
  String id = 'o1',
  String status = 'pending',
  int totalCents = 2500,
  String? tableId = 't1',
  String deliveryType = 'dine_in',
  int? pax,
  DateTime? createdAt,
  bool paymentClaimedByDiner = false,
}) {
  return PosOpenOrder(
    id: id,
    displayCode: 'MK-001',
    status: status,
    totalCents: totalCents,
    createdAt: createdAt ?? DateTime(2026, 10, 28, 12),
    customerName: 'Aina',
    pax: pax,
    tableId: tableId,
    tableLabel: 'T1',
    deliveryType: deliveryType,
    source: 'counter',
    items: const [],
    paymentClaimedByDiner: paymentClaimedByDiner,
  );
}

void main() {
  group('parsePax', () {
    test('accepts integers within 1..50', () {
      expect(parsePax(1), 1);
      expect(parsePax(50), 50);
      expect(parsePax('4'), 4);
    });

    test('rejects zero, above the cap and non-numbers', () {
      expect(parsePax(0), isNull);
      expect(parsePax(51), isNull);
      expect(parsePax('four'), isNull);
      expect(parsePax(null), isNull);
    });
  });

  group('tableQrUrl', () {
    test('trims trailing slashes from the base url', () {
      expect(
        tableQrUrl('abc', 'https://www.madkrapow.com///'),
        'https://www.madkrapow.com/t/abc',
      );
    });

    test('percent-encodes the token', () {
      expect(
        tableQrUrl('a b/c', 'https://www.madkrapow.com'),
        'https://www.madkrapow.com/t/a%20b%2Fc',
      );
    });
  });

  group('posAgeMinutes', () {
    test('counts whole minutes', () {
      final created = DateTime(2026, 10, 28, 12);
      expect(
        posAgeMinutes(
          created,
          created.add(const Duration(minutes: 12, seconds: 40)),
        ),
        12,
      );
    });

    test('never returns a negative age', () {
      final created = DateTime(2026, 10, 28, 12);
      expect(
        posAgeMinutes(created, created.subtract(const Duration(minutes: 5))),
        0,
      );
    });
  });

  group('summarizeTable', () {
    test('reports an empty table as free and not closable', () {
      final summary = summarizeTable(_table(), const []);

      expect(summary.isOccupied, isFalse);
      expect(summary.canClose, isFalse);
      expect(summary.closeBlockReason, TableCloseBlockReason.empty);
      expect(summary.totalCents, 0);
      expect(closeBlockedMessage(summary.closeBlockReason), isNotNull);
    });

    test('treats a pending ticket as unpaid and blocks closing', () {
      final summary = summarizeTable(_table(), [_order()]);

      expect(summary.isOccupied, isTrue);
      expect(summary.hasUnpaid, isTrue);
      expect(summary.canClose, isFalse);
      expect(summary.closeBlockReason, TableCloseBlockReason.unpaid);
      expect(summary.totalCents, 2500);
    });

    test('allows closing when every ticket is paid', () {
      final summary = summarizeTable(_table(), [
        _order(id: 'o1', status: 'paid'),
        _order(id: 'o2', status: 'ready'),
      ]);

      expect(summary.hasUnpaid, isFalse);
      expect(summary.canClose, isTrue);
      expect(summary.closeBlockReason, isNull);
      // `ready` has left the kitchen; `paid` has not.
      expect(summary.kitchenActiveOrderCount, 1);
    });

    test('sums tickets, keeps the largest pax and the oldest ticket', () {
      final oldest = DateTime(2026, 10, 28, 12);
      final summary = summarizeTable(_table(), [
        _order(
          id: 'o1',
          status: 'paid',
          totalCents: 1000,
          pax: 2,
          createdAt: oldest,
        ),
        _order(
          id: 'o2',
          status: 'preparing',
          totalCents: 1500,
          pax: 4,
          createdAt: oldest.add(const Duration(minutes: 5)),
        ),
      ]);

      expect(summary.openOrderCount, 2);
      expect(summary.totalCents, 2500);
      expect(summary.pax, 4);
      expect(summary.oldestCreatedAt, oldest);
    });

    test('ignores statuses that no longer keep the table open', () {
      final summary = summarizeTable(_table(), [
        _order(id: 'o1', status: 'cancelled'),
        _order(id: 'o2', status: 'completed'),
      ]);

      expect(summary.isOccupied, isFalse);
      expect(summary.orders, isEmpty);
    });

    test('counts a self-declared diner payment without blocking close', () {
      final summary = summarizeTable(_table(), [
        _order(status: 'paid', paymentClaimedByDiner: true),
        _order(id: 'o2', status: 'paid'),
      ]);

      expect(summary.dinerClaimedOrderCount, 1);
      expect(summary.hasUnverifiedDinerPayment, isTrue);
      expect(summary.hasUnpaid, isFalse);
      expect(summary.canClose, isTrue);
    });
  });

  group('unpaidOrdersForTable', () {
    test('keeps only pending dine-in tickets', () {
      final unpaid = unpaidOrdersForTable([
        _order(id: 'o1'),
        _order(id: 'o2', status: 'paid'),
        _order(id: 'o3', deliveryType: 'self_pickup'),
      ]);

      expect(unpaid.map((order) => order.id), ['o1']);
    });

    test('de-duplicates by id', () {
      final unpaid = unpaidOrdersForTable([_order(id: 'o1'), _order(id: 'o1')]);

      expect(unpaid, hasLength(1));
    });
  });

  group('buildTableSettleTarget', () {
    test('groups every unpaid ticket into one collect action', () {
      final table = _table();
      final target = buildTableSettleTargetFromOrders(table, [
        _order(id: 'o1', totalCents: 1000),
        _order(id: 'o2', totalCents: 2500),
        _order(id: 'o3', status: 'paid', totalCents: 9999),
      ]);

      expect(target, isNotNull);
      expect(target!.kind, PosSettleKind.table);
      expect(target.amountCents, 3500);
      expect(target.orderCount, 2);
      expect(target.orderIds, ['o1', 'o2']);
      expect(target.label, 'Table T1');
    });

    test('returns null when nothing is unpaid', () {
      final target = buildTableSettleTargetFromOrders(_table(), [
        _order(status: 'paid'),
      ]);

      expect(target, isNull);
    });
  });

  group('buildOrderSettleTarget', () {
    test('uses the customer name when present', () {
      final target = buildOrderSettleTarget(_order());

      expect(target.kind, PosSettleKind.order);
      expect(target.label, 'MK-001');
      expect(target.context, 'Take-away · Aina');
      expect(target.orderIds, ['o1']);
    });

    test('falls back to Walk-in without a name', () {
      final order = PosOpenOrder(
        id: 'o1',
        displayCode: 'MK-002',
        status: 'pending',
        totalCents: 900,
        createdAt: DateTime(2026, 10, 28),
        customerName: null,
        pax: null,
        tableId: null,
        tableLabel: null,
        deliveryType: 'self_pickup',
        source: 'counter',
        items: const [],
      );

      expect(buildOrderSettleTarget(order).context, 'Take-away');
    });
  });

  group('closeTableWarning', () {
    test('is null when the kitchen is done', () {
      expect(closeTableWarning(0), isNull);
    });

    test('is singular for one ticket', () {
      expect(closeTableWarning(1), contains('1 order is'));
    });

    test('is plural for several tickets', () {
      expect(closeTableWarning(3), contains('3 orders are'));
    });

    test('warns that a table-QR payment needs a bank-transfer check', () {
      final warning = closeTableWarning(0, 1)!;

      expect(warning, contains('self-declared'));
      expect(warning, contains('Verify the bank transfer'));
    });

    test('combines the kitchen and payment warnings', () {
      final warning = closeTableWarning(2, 1)!;

      expect(warning, contains('2 orders are'));
      expect(warning, contains('self-declared'));
    });
  });
}
