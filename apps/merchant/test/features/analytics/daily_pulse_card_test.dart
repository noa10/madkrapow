import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/analytics/data/analytics_models.dart';
import 'package:madkrapow_merchant/features/analytics/presentation/widgets/daily_pulse_card.dart';

void main() {
  testWidgets('shows the dine-in count without overflowing a narrow phone', (
    tester,
  ) async {
    final pulse = DailyPulse.fromJson({
      'order_count': 6,
      'revenue_cents': 6000,
      'avg_order_cents': 1000,
      'delivery_count': 2,
      'pickup_count': 1,
      'dine_in_count': 3,
    });
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: SizedBox(
              width: 320,
              child: DailyPulseCard(
                pulse: pulse,
                totals: const AnalyticsTotals(
                  orderCount: 6,
                  revenueCents: 6000,
                ),
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Dine-in'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
