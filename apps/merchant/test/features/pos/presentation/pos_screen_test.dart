import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/constants/roles.dart';
import 'package:madkrapow_merchant/features/auth/providers/admin_auth_providers.dart';
import 'package:madkrapow_merchant/features/pos/data/pos_api_client.dart';
import 'package:madkrapow_merchant/features/pos/data/pos_repository.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/presentation/screens/pos_screen.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_sale_panel.dart';
import 'package:madkrapow_merchant/features/pos/providers/pos_providers.dart';

const _table = RestaurantTable(
  id: 't1',
  label: 'T1',
  zone: null,
  seats: 4,
  isActive: true,
  sortOrder: 0,
);

const _item = PosMenuItem(
  id: 'm1',
  name: 'Dish',
  description: null,
  imageUrl: null,
  priceCents: 1250,
  isAvailable: true,
  categoryId: 'c1',
  sortOrder: 0,
);

const _itemRaised = PosMenuItem(
  id: 'm1',
  name: 'Dish',
  description: null,
  imageUrl: null,
  priceCents: 1500,
  isAvailable: true,
  categoryId: 'c1',
  sortOrder: 0,
);

class _PendingOrderRepository extends Fake implements PosRepository {
  final pending = Completer<PosCreateOrderResult>();

  @override
  Future<PosCreateOrderResult> createOrder({
    required List<Map<String, dynamic>> items,
    required PosOrderType orderType,
    required PosPaymentMethod paymentMethod,
    String? tableId,
    int? pax,
    String? customerName,
  }) => pending.future;
}

class _FailingOrderRepository extends Fake implements PosRepository {
  int calls = 0;

  @override
  Future<PosCreateOrderResult> createOrder({
    required List<Map<String, dynamic>> items,
    required PosOrderType orderType,
    required PosPaymentMethod paymentMethod,
    String? tableId,
    int? pax,
    String? customerName,
  }) async {
    calls++;
    throw const PosApiException(message: 'Server error', statusCode: 500);
  }
}

class _ClosingRepository extends Fake implements PosRepository {
  @override
  Future<PosCloseResult> closeTable(
    String tableId,
    List<String> orderIds,
  ) async => const PosCloseResult(success: true, closed: 1);
}

PosOpenOrder _paidDineIn({bool claimedByDiner = false}) {
  return PosOpenOrder(
    id: 'o1',
    displayCode: 'MK-1',
    status: 'paid',
    totalCents: 1250,
    createdAt: DateTime(2026, 10, 28, 12),
    customerName: null,
    pax: 2,
    tableId: 't1',
    tableLabel: 'T1',
    deliveryType: 'dine_in',
    source: 'counter',
    items: const [],
    paymentClaimedByDiner: claimedByDiner,
  );
}

void main() {
  testWidgets(
    'starting a table order asks before discarding an existing sale',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final container = ProviderContainer(
        overrides: [
          staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
          posRealtimeWatcherProvider.overrideWith((ref) {}),
          posBoardProvider.overrideWith(
            (ref) async => const PosBoardData(tables: [_table], openOrders: []),
          ),
          posMenuProvider.overrideWith(
            (ref) async => const PosMenuData(
              categories: [],
              menuItems: [],
              modifierGroupsByItem: {},
            ),
          ),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: PosScreen()),
        ),
      );
      await tester.pumpAndSettle();
      container.read(posSaleProvider.notifier)
        ..setOrderType(PosOrderType.takeAway)
        ..setCustomerName('Aina')
        ..addItem(_item);
      await tester.pump();

      await tester.tap(find.text('Tables'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('New order'));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(container.read(posSaleProvider).cart, hasLength(1));
      expect(container.read(posSaleProvider).customerName, 'Aina');

      await tester.tap(find.text('New order'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard and continue'));
      await tester.pumpAndSettle();
      final sale = container.read(posSaleProvider);
      expect(sale.cart, isEmpty);
      expect(sale.selectedTableId, 't1');
      expect(sale.orderType, PosOrderType.dineIn);
    },
  );

  testWidgets('resume queues a refresh if another refresh is running', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    const menu = PosMenuData(
      categories: [],
      menuItems: [],
      modifierGroupsByItem: {},
    );
    const board = PosBoardData(tables: [_table], openOrders: []);
    final menuPending = Completer<PosMenuData>();
    final boardPending = Completer<PosBoardData>();
    var menuCalls = 0;
    var boardCalls = 0;
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posMenuProvider.overrideWith((ref) {
          menuCalls++;
          return menuCalls == 2 ? menuPending.future : Future.value(menu);
        }),
        posBoardProvider.overrideWith((ref) {
          boardCalls++;
          return boardCalls == 2 ? boardPending.future : Future.value(board);
        }),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: PosScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Refresh'));
    await tester.pump();
    expect(boardCalls, 2);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    boardPending.complete(board);
    menuPending.complete(menu);
    await tester.pump();
    await tester.pump();
    expect(boardCalls, 3);
    expect(menuCalls, 3);
  });

  testWidgets('a sale error and payment stay reachable above the keyboard', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posBoardProvider.overrideWith(
          (ref) async => const PosBoardData(tables: [_table], openOrders: []),
        ),
        posMenuProvider.overrideWith(
          (ref) async => const PosMenuData(
            categories: [],
            menuItems: [],
            modifierGroupsByItem: {},
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: PosScreen()),
      ),
    );
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..setOrderType(PosOrderType.takeAway)
      ..setCustomerName('Aina')
      ..addItem(_item)
      ..setSubmitError(
        'Could not confirm the order. Check Orders before retrying.',
      );
    await tester.pump();
    await tester.tap(find.text('Review 1 item'));
    await tester.pumpAndSettle();
    tester.view.viewInsets = const FakeViewPadding(bottom: 350);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    await tester.drag(find.byType(PosSalePanel), const Offset(0, -1000));
    await tester.pumpAndSettle();
    expect(
      tester.getBottomRight(find.text('Charge RM 12.50')).dy,
      lessThanOrEqualTo(290),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('a previous cashier response cannot clear the new sale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repository = _PendingOrderRepository();
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRepositoryProvider.overrideWith((ref) => repository),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posBoardProvider.overrideWith(
          (ref) async => const PosBoardData(tables: [_table], openOrders: []),
        ),
        posMenuProvider.overrideWith(
          (ref) async => const PosMenuData(
            categories: [],
            menuItems: [],
            modifierGroupsByItem: {},
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    Widget app(String session, Widget child) => UncontrolledProviderScope(
      container: container,
      child: MaterialApp(key: ValueKey(session), home: child),
    );
    await tester.pumpWidget(app('first', const PosScreen()));
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..selectTable('t1')
      ..addItem(_item);
    await tester.pump();
    await tester.tap(find.text('Charge RM 12.50'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash received'));
    await tester.pump();

    await tester.pumpWidget(app('signed-out', const Scaffold()));
    await tester.pumpWidget(app('second', const PosScreen()));
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..selectTable('t1')
      ..addItem(_item)
      ..setSubmitting(true);
    await tester.pump();
    repository.pending.complete(
      const PosCreateOrderResult(
        orderId: 'o1',
        orderNumber: 'MK-1',
        displayCode: 'MK-1',
        totalCents: 1250,
        status: 'paid',
        tableLabel: 'T1',
        pax: 2,
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(container.read(posSaleProvider).cart, hasLength(1));
    expect(container.read(posSaleProvider).submitting, isTrue);
  });

  testWidgets('a server failure prompts for an order check after reopening', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repository = _FailingOrderRepository();
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRepositoryProvider.overrideWith((ref) => repository),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posBoardProvider.overrideWith(
          (ref) async => const PosBoardData(tables: [_table], openOrders: []),
        ),
        posMenuProvider.overrideWith(
          (ref) async => const PosMenuData(
            categories: [],
            menuItems: [],
            modifierGroupsByItem: {},
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: PosScreen()),
      ),
    );
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..selectTable('t1')
      ..addItem(_item);
    await tester.pump();

    await tester.tap(find.text('Charge RM 12.50'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash received'));
    await tester.pumpAndSettle();
    expect(repository.calls, 1);
    expect(container.read(posSaleProvider).outcomeUncertain, isTrue);

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Charge RM 12.50'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash received'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Check orders first'), findsOneWidget);
    expect(repository.calls, 1);
  });

  testWidgets('clearing the sale keeps the duplicate-order guard', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repository = _FailingOrderRepository();
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRepositoryProvider.overrideWith((ref) => repository),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posBoardProvider.overrideWith(
          (ref) async => const PosBoardData(tables: [_table], openOrders: []),
        ),
        posMenuProvider.overrideWith(
          (ref) async => const PosMenuData(
            categories: [],
            menuItems: [],
            modifierGroupsByItem: {},
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: PosScreen()),
      ),
    );
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..selectTable('t1')
      ..addItem(_item);
    await tester.pump();

    await tester.tap(find.text('Charge RM 12.50'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash received'));
    await tester.pumpAndSettle();
    expect(container.read(posSaleProvider).outcomeUncertain, isTrue);

    // Close the pay sheet, Clear the sale, and ring the same cart again.
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Clear'));
    await tester.pump();
    container.read(posSaleProvider.notifier).addItem(_item);
    await tester.pump();

    await tester.tap(find.text('Charge RM 12.50'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash received'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Check orders first'), findsOneWidget);
    expect(repository.calls, 1);
  });

  testWidgets('a menu price change updates the sale and requires review', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var menuCalls = 0;
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posBoardProvider.overrideWith(
          (ref) async => const PosBoardData(tables: [_table], openOrders: []),
        ),
        posMenuProvider.overrideWith((ref) {
          menuCalls++;
          return PosMenuData(
            categories: const [],
            menuItems: [menuCalls == 1 ? _item : _itemRaised],
            modifierGroupsByItem: const {},
          );
        }),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: PosScreen()),
      ),
    );
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..selectTable('t1')
      ..addItem(_item);
    await tester.pump();
    expect(find.text('Charge RM 12.50'), findsOneWidget);

    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();

    expect(find.text('Charge RM 15.00'), findsOneWidget);
    expect(find.textContaining('Review the updated total'), findsOneWidget);

    await tester.tap(find.text('Charge RM 15.00'));
    await tester.pumpAndSettle();
    expect(find.text('Review the updated sale'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(FilledButton, 'Charge RM 15.00'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Collect cash'), findsOneWidget);
  });

  testWidgets('a deactivated table is cleared from the sale on refresh', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var boardCalls = 0;
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posBoardProvider.overrideWith((ref) {
          boardCalls++;
          return Future.value(
            boardCalls == 1
                ? const PosBoardData(tables: [_table], openOrders: [])
                : const PosBoardData(tables: [], openOrders: []),
          );
        }),
        posMenuProvider.overrideWith(
          (ref) async => const PosMenuData(
            categories: [],
            menuItems: [_item],
            modifierGroupsByItem: {},
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: PosScreen()),
      ),
    );
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..selectTable('t1')
      ..addItem(_item);
    await tester.pump();

    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();

    expect(container.read(posSaleProvider).selectedTableId, isNull);
    expect(find.textContaining('no longer active'), findsOneWidget);
  });

  testWidgets('closing the selected table clears its unsent sale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repository = _ClosingRepository();
    final container = ProviderContainer(
      overrides: [
        staffRoleProvider.overrideWith((ref) => StaffRole.cashier),
        posRepositoryProvider.overrideWith((ref) => repository),
        posRealtimeWatcherProvider.overrideWith((ref) {}),
        posBoardProvider.overrideWith(
          (ref) async => PosBoardData(
            tables: const [_table],
            openOrders: [_paidDineIn(claimedByDiner: true)],
          ),
        ),
        posMenuProvider.overrideWith(
          (ref) async => const PosMenuData(
            categories: [],
            menuItems: [_item],
            modifierGroupsByItem: {},
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: PosScreen()),
      ),
    );
    await tester.pumpAndSettle();
    container.read(posSaleProvider.notifier)
      ..selectTable('t1')
      ..addItem(_item);
    await tester.pump();

    await tester.tap(find.text('Tables'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Close table'));
    await tester.pumpAndSettle();

    expect(find.textContaining('unsent sale'), findsOneWidget);
    expect(find.textContaining('Verify the bank transfer'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.widgetWithText(FilledButton, 'Close table'),
      ),
    );
    await tester.pumpAndSettle();

    expect(container.read(posSaleProvider).cart, isEmpty);
    expect(container.read(posSaleProvider).selectedTableId, isNull);
  });
}
