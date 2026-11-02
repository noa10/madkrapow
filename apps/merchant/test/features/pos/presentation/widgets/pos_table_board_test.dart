import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_tables.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_table_board.dart';

const _table = RestaurantTable(
  id: 't1',
  label: 'T1',
  zone: null,
  seats: 4,
  isActive: true,
  sortOrder: 0,
);

PosOpenOrder _order({
  String id = 'o1',
  String status = 'pending',
  String deliveryType = 'dine_in',
  String? tableId = 't1',
  String? customerName = 'Aina',
  int totalCents = 2500,
}) {
  return PosOpenOrder(
    id: id,
    displayCode: 'MK-001',
    status: status,
    totalCents: totalCents,
    createdAt: DateTime(2026, 10, 28, 12),
    customerName: customerName,
    pax: 2,
    tableId: tableId,
    tableLabel: tableId == null ? null : 'T1',
    deliveryType: deliveryType,
    source: 'counter',
    items: const [],
  );
}

Future<void> _pump(
  WidgetTester tester, {
  required List<TableSummary> summaries,
  List<PosOpenOrder> unpaidTakeaway = const [],
  ValueChanged<PosSettleTarget>? onSettle,
  ValueChanged<PosOpenOrder>? onVoid,
  Future<void> Function()? onRefresh,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: PosTableBoard(
          summaries: summaries,
          unpaidTakeaway: unpaidTakeaway,
          busyId: null,
          refreshing: false,
          onNewOrder: (_) {},
          onSettle: onSettle ?? (_) {},
          onVoid: onVoid ?? (_) {},
          onCloseTable: (_) {},
          onRefresh: onRefresh ?? () async {},
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('summarises occupancy and the bills to collect', (tester) async {
    await _pump(
      tester,
      summaries: [
        summarizeTable(_table, [_order()]),
      ],
    );

    expect(find.text('1 occupied'), findsOneWidget);
    expect(find.textContaining('1 active table'), findsOneWidget);
    expect(find.text('1 to collect'), findsOneWidget);
  });

  testWidgets('lists unpaid take-away tickets and collects one', (
    tester,
  ) async {
    PosSettleTarget? target;
    await _pump(
      tester,
      summaries: const [],
      unpaidTakeaway: [
        _order(
          id: 'takeaway-1',
          deliveryType: 'self_pickup',
          tableId: null,
          totalCents: 1800,
        ),
      ],
      onSettle: (value) => target = value,
    );

    expect(find.text('Unpaid take-away'), findsOneWidget);
    expect(find.text('MK-001'), findsOneWidget);
    expect(find.textContaining('RM 18.00'), findsOneWidget);

    await tester.tap(find.text('Collect'));
    expect(target, isNotNull);
    expect(target!.kind, PosSettleKind.order);
    expect(target!.id, 'takeaway-1');
  });

  testWidgets('voids an unpaid take-away ticket', (tester) async {
    PosOpenOrder? voided;
    await _pump(
      tester,
      summaries: const [],
      unpaidTakeaway: [
        _order(id: 'takeaway-1', deliveryType: 'self_pickup', tableId: null),
      ],
      onVoid: (order) => voided = order,
    );

    await tester.tap(find.byTooltip('Void this unpaid order'));
    expect(voided?.id, 'takeaway-1');
  });

  testWidgets('shows an empty floor state', (tester) async {
    await _pump(tester, summaries: const []);

    expect(find.text('No active tables'), findsOneWidget);
  });

  testWidgets('refresh calls back', (tester) async {
    var refreshes = 0;
    await _pump(
      tester,
      summaries: const [],
      onRefresh: () async => refreshes++,
    );

    await tester.tap(find.text('Refresh'));
    await tester.pump();

    expect(refreshes, 1);
  });
}
