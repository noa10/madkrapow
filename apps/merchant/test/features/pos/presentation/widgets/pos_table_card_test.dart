import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_tables.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_table_card.dart';

const _table = RestaurantTable(
  id: 't1',
  label: 'T1',
  zone: 'Indoor',
  seats: 4,
  isActive: true,
  sortOrder: 0,
);

final _now = DateTime(2026, 10, 28, 12, 12);

PosOpenOrder _order({
  String id = 'o1',
  String status = 'pending',
  int totalCents = 2500,
  int? pax = 2,
  List<PosOrderItem> items = const [],
  bool paymentClaimedByDiner = false,
}) {
  return PosOpenOrder(
    id: id,
    displayCode: 'MK-001',
    status: status,
    totalCents: totalCents,
    createdAt: DateTime(2026, 10, 28, 12),
    customerName: null,
    pax: pax,
    tableId: 't1',
    tableLabel: 'T1',
    deliveryType: 'dine_in',
    source: 'counter',
    items: items,
    paymentClaimedByDiner: paymentClaimedByDiner,
  );
}

Future<void> _pump(
  WidgetTester tester,
  TableSummary summary, {
  VoidCallback? onNewOrder,
  ValueChanged<PosSettleTarget>? onSettle,
  ValueChanged<PosOpenOrder>? onVoid,
  VoidCallback? onCloseTable,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: SizedBox(
            width: 360,
            child: PosTableCard(
              summary: summary,
              now: _now,
              busy: false,
              onNewOrder: onNewOrder ?? () {},
              onSettle: onSettle ?? (_) {},
              onVoid: onVoid ?? (_) {},
              onCloseTable: onCloseTable ?? () {},
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('a free table offers New order and a disabled close', (
    tester,
  ) async {
    await _pump(tester, summarizeTable(_table, const []));

    expect(find.text('Free'), findsOneWidget);
    expect(find.text('Table is free.'), findsOneWidget);

    final close = find.widgetWithText(FilledButton, 'Close table');
    expect(tester.widget<FilledButton>(close).onPressed, isNull);
  });

  testWidgets('an unpaid table shows its bill and a collect action', (
    tester,
  ) async {
    PosSettleTarget? target;
    await _pump(
      tester,
      summarizeTable(_table, [_order()]),
      onSettle: (value) => target = value,
    );

    expect(find.text('Unpaid'), findsNWidgets(2)); // card pill + ticket chip
    expect(find.textContaining('Collect RM 25.00'), findsOneWidget);

    await tester.tap(find.textContaining('Collect RM 25.00'));
    expect(target, isNotNull);
    expect(target!.orderIds, ['o1']);
    expect(target!.amountCents, 2500);
  });

  testWidgets('voiding an unpaid ticket calls back with that order', (
    tester,
  ) async {
    PosOpenOrder? voided;
    await _pump(
      tester,
      summarizeTable(_table, [_order()]),
      onVoid: (order) => voided = order,
    );

    await tester.tap(find.byTooltip('Void this unpaid order'));
    expect(voided?.id, 'o1');
  });

  testWidgets('a paid table can be closed', (tester) async {
    var closed = 0;
    await _pump(
      tester,
      summarizeTable(_table, [_order(status: 'paid')]),
      onCloseTable: () => closed++,
    );

    expect(find.text('Occupied'), findsOneWidget);
    final close = find.widgetWithText(FilledButton, 'Close table');
    expect(tester.widget<FilledButton>(close).onPressed, isNotNull);

    await tester.tap(close);
    expect(closed, 1);
  });

  testWidgets('a diner-claimed payment is flagged for verification', (
    tester,
  ) async {
    await _pump(
      tester,
      summarizeTable(_table, [
        _order(status: 'paid', paymentClaimedByDiner: true),
      ]),
    );

    expect(
      find.textContaining('verify the bank transfer', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('expanding a ticket reveals its dishes', (tester) async {
    await _pump(
      tester,
      summarizeTable(_table, [
        _order(
          items: const [
            PosOrderItem(
              id: 'i1',
              name: 'Nasi Goreng',
              quantity: 2,
              lineTotalCents: 2500,
              notes: 'no onions',
              modifiers: [
                PosOrderItemModifier(name: 'Extra egg', priceDeltaCents: 200),
              ],
            ),
          ],
        ),
      ]),
    );

    expect(find.text('2× Nasi Goreng'), findsNothing);

    await tester.tap(find.byTooltip('View items'));
    await tester.pump();

    expect(find.text('2× Nasi Goreng'), findsOneWidget);
    expect(find.textContaining('Extra egg'), findsOneWidget);
    expect(find.text('“no onions”'), findsOneWidget);
  });

  testWidgets('New order calls back with the table summary', (tester) async {
    var started = 0;
    await _pump(
      tester,
      summarizeTable(_table, const []),
      onNewOrder: () => started++,
    );

    await tester.tap(find.text('New order'));
    expect(started, 1);
  });
}
