import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/models/date_filter.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/order_stats_card.dart';
import 'package:madkrapow_merchant/features/orders/providers/admin_order_providers.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';

void main() {
  group('OrderStatsCard', () {
    testWidgets('shows zero counts when no orders', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            adminOrdersProvider(OrderTab.history)
                .overrideWith((ref) async => []),
            dateFilterProvider.overrideWith((ref) => DateFilter()),
          ],
          child: const MaterialApp(
            home: Scaffold(body: OrderStatsCard()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Completed'), findsOneWidget);
      expect(find.text('Cancelled'), findsOneWidget);
      expect(find.text('0'), findsNWidgets(2)); // Both completed and cancelled show 0
    });

    testWidgets('shows correct completed and cancelled counts',
        (tester) async {
      final date = DateTime(2026, 4, 10);
      final orders = [
        _makeOrder(createdAt: date, totalCents: 1000, status: 'delivered'),
        _makeOrder(createdAt: date, totalCents: 2000, status: 'picked_up'),
        _makeOrder(createdAt: date, totalCents: 3000, status: 'cancelled'),
        _makeOrder(createdAt: date, totalCents: 4000, status: 'cancelled'),
      ];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            adminOrdersProvider(OrderTab.history)
                .overrideWith((ref) async => orders),
            dateFilterProvider.overrideWith(
              (ref) => DateFilter(date: date),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: OrderStatsCard()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 2 completed (delivered + picked_up)
      // 2 cancelled
      final completedFinder = find.text('2');
      final cancelledFinder = find.text('2');
      expect(completedFinder, findsNWidgets(2)); // Appears in both cards
      expect(cancelledFinder, findsNWidgets(2));
    });

    testWidgets('completed includes both delivered and picked_up',
        (tester) async {
      final orders = [
        _makeOrder(status: 'delivered'),
        _makeOrder(status: 'picked_up'),
        _makeOrder(status: 'cancelled'),
      ];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            adminOrdersProvider(OrderTab.history)
                .overrideWith((ref) async => orders),
          ],
          child: const MaterialApp(
            home: Scaffold(body: OrderStatsCard()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Completed = 2, Cancelled = 1
      expect(find.text('2'), findsOneWidget);
      expect(find.text('1'), findsOneWidget);
    });
  });
}

OrdersRow _makeOrder({
  DateTime? createdAt,
  int totalCents = 1000,
  String status = 'delivered',
}) {
  return OrdersRow(
    totalCents: totalCents,
    orderNumber: 'TEST001',
    subtotalCents: totalCents,
    createdAt: createdAt ?? DateTime(2026, 4, 10),
    status: status,
    deliveryType: 'delivery',
    fulfillmentType: 'asap',
    orderKind: 'standard',
    dispatchStatus: 'not_ready',
    approvalStatus: 'auto_approved',
    hubboPosSyncStatus: 'pending',
    requiresManualReview: false,
  );
}
