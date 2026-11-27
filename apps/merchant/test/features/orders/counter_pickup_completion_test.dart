import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/constants/roles.dart';
import 'package:madkrapow_merchant/features/auth/providers/admin_auth_providers.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_order_repository.dart';
import 'package:madkrapow_merchant/features/orders/presentation/screens/kitchen_display_screen.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/advance_status_button.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/order_list_tile.dart';
import 'package:madkrapow_merchant/features/orders/providers/admin_order_providers.dart';
import 'package:madkrapow_merchant/features/orders/providers/kitchen_providers.dart';
import 'package:madkrapow_merchant/features/printing/data/auto_print_service.dart';
import 'package:madkrapow_merchant/features/printing/providers/printer_providers.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MockRepository extends Mock implements MerchantOrderRepository {}

class MockChannel extends Mock implements RealtimeChannel {}

class MockAutoPrint extends Mock implements AutoPrintService {}

/// A ready counter take-away, as POS creates it.
OrdersRow _counterPickup({String status = 'ready'}) => OrdersRow.fromJson({
  'id': 'order-1',
  'order_number': 'MK-1',
  'status': status,
  'subtotal_cents': 1000,
  'total_cents': 1000,
  'created_at': DateTime(2026, 11, 27, 18, 0).toIso8601String(),
  'fulfillment_type': 'asap',
  'source': 'counter',
  'delivery_type': 'self_pickup',
});

/// A ready web pickup: it completes through the customer's own flow.
OrdersRow _webPickup({String status = 'ready'}) => OrdersRow.fromJson({
  'id': 'order-1',
  'order_number': 'MK-1',
  'status': status,
  'subtotal_cents': 1000,
  'total_cents': 1000,
  'created_at': DateTime(2026, 11, 27, 18, 0).toIso8601String(),
  'fulfillment_type': 'asap',
  'source': 'web',
  'delivery_type': 'self_pickup',
});

List<Override> _baseOverrides(MockRepository repo) => [
  merchantOrderRepositoryProvider.overrideWithValue(repo),
  staffRoleProvider.overrideWithValue(StaffRole.admin),
  for (final tab in OrderTab.values)
    adminOrdersProvider(tab).overrideWith((ref) async => <OrdersRow>[]),
  kitchenOrderCardsProvider.overrideWith((ref) async => const []),
  // Never fetched; keeps invalidation from reaching Supabase.
  adminOrderDetailProvider(
    'order-1',
  ).overrideWith((ref) => Completer<OrderDetail>().future),
];

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  required MockRepository repo,
  List<Override> extraOverrides = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [..._baseOverrides(repo), ...extraOverrides],
      child: MaterialApp(home: Scaffold(body: child)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('order list completes a ready counter take-away', (tester) async {
    final repo = MockRepository();
    when(
      () => repo.updateOrderStatus('order-1', 'delivered'),
    ).thenAnswer((_) async {});

    await _pump(
      tester,
      SingleChildScrollView(child: OrderListTile(order: _counterPickup())),
      repo: repo,
    );

    expect(find.text('Complete Order'), findsOneWidget);
    expect(find.text('Mark as Ready'), findsNothing);

    await tester.tap(find.text('Complete Order'));
    await tester.pumpAndSettle();

    verify(() => repo.updateOrderStatus('order-1', 'delivered')).called(1);
  });

  testWidgets('order list leaves a ready web pickup alone', (tester) async {
    final repo = MockRepository();

    await _pump(
      tester,
      SingleChildScrollView(child: OrderListTile(order: _webPickup())),
      repo: repo,
    );

    expect(find.text('Complete Order'), findsNothing);
    expect(find.text('Mark as Ready'), findsNothing);
  });

  testWidgets('detail completes a ready counter take-away', (tester) async {
    final repo = MockRepository();
    when(
      () => repo.updateOrderStatus('order-1', 'delivered'),
    ).thenAnswer((_) async {});

    await _pump(
      tester,
      const AdvanceStatusButton(
        orderId: 'order-1',
        currentStatus: 'ready',
        source: 'counter',
        deliveryType: 'self_pickup',
      ),
      repo: repo,
    );

    expect(find.text('Complete Order'), findsOneWidget);
    await tester.tap(find.text('Complete Order'));
    await tester.pumpAndSettle();

    verify(() => repo.updateOrderStatus('order-1', 'delivered')).called(1);
  });

  testWidgets('detail leaves a ready web pickup alone', (tester) async {
    final repo = MockRepository();

    await _pump(
      tester,
      const AdvanceStatusButton(
        orderId: 'order-1',
        currentStatus: 'ready',
        source: 'web',
        deliveryType: 'self_pickup',
      ),
      repo: repo,
    );

    expect(find.text('Complete Order'), findsNothing);
  });

  testWidgets('kitchen completes a ready counter take-away', (tester) async {
    final repo = MockRepository();
    final channel = MockChannel();
    final printer = MockAutoPrint();
    when(
      () => repo.updateOrderStatus('order-1', 'delivered'),
    ).thenAnswer((_) async {});
    when(
      () => repo.subscribeToNewOrders(onNewOrder: any(named: 'onNewOrder')),
    ).thenReturn(channel);
    when(() => channel.unsubscribe()).thenAnswer((_) async => 'ok');
    when(() => printer.printPendingJobs()).thenAnswer((_) async => 0);

    await _pump(
      tester,
      const KitchenDisplayScreen(),
      repo: repo,
      extraOverrides: [
        autoPrintServiceProvider.overrideWithValue(printer),
        kitchenOrderCardsProvider.overrideWith(
          (ref) async => [
            KitchenOrderCardData(order: _counterPickup(), items: const []),
          ],
        ),
      ],
    );

    expect(find.text('Complete Order'), findsOneWidget);
    await tester.tap(find.text('Complete Order'));
    await tester.pumpAndSettle();

    verify(() => repo.updateOrderStatus('order-1', 'delivered')).called(1);
  });
}
