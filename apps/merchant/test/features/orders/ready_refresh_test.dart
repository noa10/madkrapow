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

void main() {
  testWidgets('kitchen refreshes when a completion event is not visible', (
    tester,
  ) async {
    final repo = MockRepository();
    final channel = MockChannel();
    final printer = MockAutoPrint();
    var active = true;
    final order = OrdersRow(
      id: 'order-1',
      orderNumber: 'MK-1',
      totalCents: 1000,
      subtotalCents: 1000,
      status: 'preparing',
      deliveryType: 'pickup',
      fulfillmentType: 'asap',
      createdAt: DateTime.now(),
    );
    when(
      () => repo.subscribeToNewOrders(onNewOrder: any(named: 'onNewOrder')),
    ).thenReturn(channel);
    when(() => channel.unsubscribe()).thenAnswer((_) async => 'ok');
    when(() => printer.printPendingJobs()).thenAnswer((_) async => 0);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          merchantOrderRepositoryProvider.overrideWithValue(repo),
          autoPrintServiceProvider.overrideWithValue(printer),
          kitchenOrderCardsProvider.overrideWith(
            (ref) async => active
                ? [KitchenOrderCardData(order: order, items: const [])]
                : [],
          ),
        ],
        child: const MaterialApp(home: KitchenDisplayScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Mark Ready'), findsOneWidget);

    active = false;
    await tester.pump(const Duration(seconds: 30));
    await tester.pumpAndSettle();
    expect(find.text('Mark Ready'), findsNothing);
  });

  for (final action in ['list', 'detail', 'kitchen']) {
    for (final disposeBeforeResponse in [false, true]) {
      testWidgets(
        '$action Ready refreshes after server completion (disposed: $disposeBeforeResponse)',
        (tester) async {
          final repo = MockRepository();
          final channel = MockChannel();
          final printer = MockAutoPrint();
          var status = 'preparing';
          final response = Completer<void>();
          final showAction = ValueNotifier(true);
          OrdersRow order() => OrdersRow(
            id: 'order-1',
            orderNumber: 'MK-1',
            totalCents: 1000,
            subtotalCents: 1000,
            status: status,
            deliveryType: 'pickup',
            fulfillmentType: 'asap',
            createdAt: DateTime.now(),
          );
          when(() => repo.updateOrderStatus('order-1', 'ready')).thenAnswer((
            _,
          ) async {
            await response.future;
            status = 'delivered';
          });
          when(
            () =>
                repo.subscribeToNewOrders(onNewOrder: any(named: 'onNewOrder')),
          ).thenReturn(channel);
          when(() => channel.unsubscribe()).thenAnswer((_) async => 'ok');
          when(() => printer.printPendingJobs()).thenAnswer((_) async => 0);

          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                merchantOrderRepositoryProvider.overrideWithValue(repo),
                staffRoleProvider.overrideWithValue(StaffRole.admin),
                autoPrintServiceProvider.overrideWithValue(printer),
                for (final tab in OrderTab.values)
                  adminOrdersProvider(tab).overrideWith((ref) async {
                    if (tab == OrderTab.history) {
                      return status == 'delivered' ? [order()] : [];
                    }
                    if (tab == OrderTab.preparing || tab == OrderTab.upcoming) {
                      return status == 'preparing' ? [order()] : [];
                    }
                    return [];
                  }),
                kitchenOrderCardsProvider.overrideWith(
                  (ref) async => status == 'preparing'
                      ? [KitchenOrderCardData(order: order(), items: const [])]
                      : [],
                ),
              ],
              child: MaterialApp(
                home: Scaffold(
                  body: Column(
                    children: [
                      Consumer(
                        builder: (context, ref, _) {
                          final counts = OrderTab.values
                              .map(
                                (tab) =>
                                    ref
                                        .watch(adminOrdersProvider(tab))
                                        .valueOrNull
                                        ?.length ??
                                    -1,
                              )
                              .join(',');
                          final kitchen =
                              ref
                                  .watch(kitchenOrderCardsProvider)
                                  .valueOrNull
                                  ?.length ??
                              -1;
                          return Text('lists:$counts kitchen:$kitchen');
                        },
                      ),
                      Expanded(
                        child: ValueListenableBuilder<bool>(
                          valueListenable: showAction,
                          builder: (_, show, _) => !show
                              ? const SizedBox.shrink()
                              : switch (action) {
                                  'list' => SingleChildScrollView(
                                    child: OrderListTile(
                                      order: order(),
                                      showAdvanceAction: true,
                                    ),
                                  ),
                                  'detail' => const AdvanceStatusButton(
                                    orderId: 'order-1',
                                    currentStatus: 'preparing',
                                  ),
                                  _ => const KitchenDisplayScreen(),
                                },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(find.text('lists:1,0,1,0 kitchen:1'), findsOneWidget);
          final button = find.text(switch (action) {
            'list' => 'Mark as Ready',
            _ => 'Mark Ready',
          });
          await tester.ensureVisible(button);
          await tester.tap(button);
          if (disposeBeforeResponse) {
            showAction.value = false;
            await tester.pumpAndSettle();
          }
          response.complete();
          await tester.pumpAndSettle();
          expect(find.text('lists:0,0,0,1 kitchen:0'), findsOneWidget);
        },
      );
    }
  }
}
