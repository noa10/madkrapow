import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/models/date_filter.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/total_sales_card.dart';
import 'package:madkrapow_merchant/features/orders/providers/admin_order_providers.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';

void main() {
  group('TotalSalesCard', () {
    testWidgets('shows RM 0.00 when no orders', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            adminOrdersProvider(OrderTab.history)
                .overrideWith((ref) async => []),
            dateFilterProvider.overrideWith((ref) => DateFilter()),
          ],
          child: const MaterialApp(
            home: Scaffold(body: TotalSalesCard()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Total Sales Today'), findsOneWidget);
      expect(find.text('RM 0.00'), findsOneWidget);
      expect(find.text('0 orders'), findsOneWidget);
    });

    testWidgets('shows total for selected date', (tester) async {
      final date = DateTime(2026, 4, 10);
      final orders = [
        _makeOrder(createdAt: date, totalCents: 1250, status: 'delivered'),
        _makeOrder(createdAt: date, totalCents: 3400, status: 'picked_up'),
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
            home: Scaffold(body: TotalSalesCard()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Total Sales (10 Apr)'), findsOneWidget);
      expect(find.text('RM 46.50'), findsOneWidget);
      expect(find.text('2 orders'), findsOneWidget);
    });

    testWidgets('dynamically updates when date changes',
        (tester) async {
      final container = ProviderContainer(
        overrides: [
          adminOrdersProvider(OrderTab.history)
              .overrideWith((ref) async => []),
          dateFilterProvider.overrideWith((ref) => DateFilter()),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(body: TotalSalesCard()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Total Sales Today'), findsOneWidget);

      container.read(dateFilterProvider.notifier).state =
          DateFilter(date: DateTime(2026, 4, 15));
      await tester.pumpAndSettle();

      expect(find.text('Total Sales (15 Apr)'), findsOneWidget);
    });
  });
}

OrdersRow _makeOrder({
  required DateTime createdAt,
  required int totalCents,
  String status = 'delivered',
}) {
  return OrdersRow(
    totalCents: totalCents,
    orderNumber: 'TEST001',
    subtotalCents: totalCents,
    createdAt: createdAt,
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
