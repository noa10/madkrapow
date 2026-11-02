import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_tables.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_sale_panel.dart';
import 'package:madkrapow_merchant/features/pos/providers/pos_providers.dart';

const _table = RestaurantTable(
  id: 't1',
  label: 'T1',
  zone: 'Indoor',
  seats: 4,
  isActive: true,
  sortOrder: 0,
);

const _item = PosMenuItem(
  id: 'm1',
  name: 'Nasi Goreng',
  description: null,
  imageUrl: null,
  priceCents: 1250,
  isAvailable: true,
  categoryId: 'c1',
  sortOrder: 0,
);

const _modifier = PosCartModifier(
  id: 'mod1',
  name: 'Extra egg',
  priceDeltaCents: 200,
);

PosOpenOrder _pendingOrder() {
  return PosOpenOrder(
    id: 'o1',
    displayCode: 'MK-001',
    status: 'pending',
    totalCents: 2500,
    createdAt: DateTime(2026, 10, 28, 12),
    customerName: null,
    pax: 2,
    tableId: 't1',
    tableLabel: 'T1',
    deliveryType: 'dine_in',
    source: 'counter',
    items: const [],
  );
}

Future<ProviderContainer> _pump(
  WidgetTester tester, {
  List<RestaurantTable> tables = const [_table],
  Map<String, TableSummary> summaries = const {},
  ValueChanged<PosSettleTarget>? onCollectUnpaid,
  VoidCallback? onSubmit,
  VoidCallback? onClear,
}) async {
  final controller = TextEditingController();
  addTearDown(controller.dispose);

  // A tall surface so the whole panel (controls, cart and payment section)
  // is laid out without the lazy ListView skipping the cart lines.
  tester.view.physicalSize = const Size(500, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 380,
            height: 1200,
            child: PosSalePanel(
              tables: tables,
              summaries: summaries,
              customerNameController: controller,
              onCollectUnpaid: onCollectUnpaid ?? (_) {},
              onSubmit: onSubmit ?? () {},
              onClear: onClear ?? () {},
            ),
          ),
        ),
      ),
    ),
  );

  return ProviderScope.containerOf(tester.element(find.byType(PosSalePanel)));
}

void main() {
  testWidgets('starts as a dine-in sale with pax 2 and cash', (tester) async {
    await _pump(tester);

    expect(find.text('TABLE'), findsOneWidget);
    expect(find.text('PAX'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('T1'), findsOneWidget);
    expect(find.text('Charge RM 0.00'), findsOneWidget);
  });

  testWidgets('shows Occupied on a table with an open ticket', (tester) async {
    final summary = summarizeTable(_table, [_pendingOrder()]);
    await _pump(tester, summaries: {'t1': summary});

    expect(find.text('Occupied'), findsOneWidget);
  });

  testWidgets('take-away requires a customer name before charging', (
    tester,
  ) async {
    var submitted = 0;
    final container = await _pump(tester, onSubmit: () => submitted++);

    container.read(posSaleProvider.notifier).setOrderType(
      PosOrderType.takeAway,
    );
    container.read(posSaleProvider.notifier).addItem(_item);
    await tester.pump();

    expect(find.text('CUSTOMER NAME'), findsOneWidget);
    final charge = find.widgetWithText(FilledButton, 'Charge RM 12.50');
    expect(tester.widget<FilledButton>(charge).onPressed, isNull);

    await tester.enterText(find.byType(TextField), 'Aina');
    await tester.pump();

    expect(tester.widget<FilledButton>(charge).onPressed, isNotNull);
    await tester.tap(charge);
    expect(submitted, 1);
  });

  testWidgets('renders a cart line with its add-ons, note and total', (
    tester,
  ) async {
    final container = await _pump(tester);

    container.read(posSaleProvider.notifier).addItem(
      _item,
      modifiers: const [_modifier],
      notes: 'no onions',
    );
    await tester.pump();

    expect(find.textContaining('Extra egg'), findsOneWidget);
    expect(find.text('“no onions”'), findsOneWidget);
    expect(find.text('RM 14.50'), findsNWidgets(2));
    expect(find.text('Charge RM 14.50'), findsOneWidget);
  });

  testWidgets('quantity controls update the charge total', (tester) async {
    final container = await _pump(tester);

    container.read(posSaleProvider.notifier).addItem(_item);
    await tester.pump();

    await tester.tap(find.byTooltip('Add one Nasi Goreng'));
    await tester.pump();

    expect(find.text('Charge RM 25.00'), findsOneWidget);
  });

  testWidgets('offers no pay-later option and always charges', (
    tester,
  ) async {
    final container = await _pump(tester);

    container.read(posSaleProvider.notifier).addItem(_item);
    await tester.pump();

    // Pay-later was removed server-side, so the cashier UI must not offer it.
    expect(find.text('Pay now'), findsNothing);
    expect(find.text('Pay later'), findsNothing);
    expect(find.text('Send to kitchen · Pay later'), findsNothing);
    expect(find.textContaining('Unpaid take-away list'), findsNothing);

    // Both methods are always offered and the submit button always charges.
    expect(find.text('Cash'), findsOneWidget);
    expect(find.text('Company QR'), findsOneWidget);
    expect(find.text('Charge RM 12.50'), findsOneWidget);

    await tester.tap(find.text('Company QR'));
    await tester.pump();

    expect(
      container.read(posSaleProvider).paymentMethod,
      PosPaymentMethod.qrPay,
    );
    expect(find.text('Charge RM 12.50'), findsOneWidget);
  });

  testWidgets('shows the grouped unpaid banner for the selected table', (
    tester,
  ) async {
    PosSettleTarget? collected;
    final summary = summarizeTable(_table, [_pendingOrder()]);
    final container = await _pump(
      tester,
      summaries: {'t1': summary},
      onCollectUnpaid: (target) => collected = target,
    );

    container.read(posSaleProvider.notifier).selectTable('t1');
    await tester.pump();

    expect(find.text('UNPAID AT THIS TABLE'), findsOneWidget);
    expect(find.textContaining('RM 25.00'), findsOneWidget);

    await tester.tap(find.text('Collect'));
    expect(collected, isNotNull);
    expect(collected!.orderIds, ['o1']);
  });

  testWidgets('Clear calls back so the screen can reset the sale', (
    tester,
  ) async {
    var cleared = 0;
    final container = await _pump(tester, onClear: () => cleared++);

    container.read(posSaleProvider.notifier).addItem(_item);
    await tester.pump();

    await tester.tap(find.text('Clear'));
    expect(cleared, 1);
  });

  testWidgets('renders a failed submit inside the panel', (tester) async {
    final container = await _pump(tester);

    container
        .read(posSaleProvider.notifier)
        .setSubmitError('Could not record the order: session expired');
    await tester.pump();

    // A snackbar would render underneath the sale bottom sheet, so the panel
    // itself must carry the message.
    expect(
      find.text('Could not record the order: session expired'),
      findsOneWidget,
    );
  });
}
