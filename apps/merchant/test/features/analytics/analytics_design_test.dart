import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/analytics/data/analytics_models.dart';
import 'package:madkrapow_merchant/features/analytics/presentation/widgets/revenue_chart.dart';
import 'package:madkrapow_merchant/features/analytics/presentation/widgets/top_items_list.dart';

TrendPoint point(String date, int cents) =>
    TrendPoint.fromJson({'order_date': date, 'revenue_cents': cents});

void main() {
  testWidgets('chart places missing dates at their true interval with a gap', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RevenueChart(
            trends: [point('2026-11-01', 1250), point('2026-11-03', 2000)],
          ),
        ),
      ),
    );
    final chart = tester.widget<LineChart>(find.byType(LineChart));
    final spots = chart.data.lineBarsData.single.spots;
    expect(spots.first.x, 0);
    expect(spots.last.x, 2);
    expect(spots.any((spot) => spot.isNull()), isTrue);
    await tester.tap(find.text('View daily values'));
    await tester.pumpAndSettle();
    expect(find.text('RM 12.50'), findsOneWidget);
    expect(find.text('RM 20.00'), findsOneWidget);
  });

  testWidgets('zero revenue still gives the chart a usable scale', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: RevenueChart(trends: [point('2026-11-01', 0)])),
      ),
    );
    final chart = tester.widget<LineChart>(find.byType(LineChart));
    expect(chart.data.maxY, greaterThan(chart.data.minY));
    expect(tester.takeException(), isNull);
  });

  testWidgets('ranked items show quantity and revenue at narrow widths', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TopItemsList(
            items: [
              TopItem(
                menuItemName: 'Basil chicken rice with a very long name',
                totalQuantity: 12,
                totalRevenueCents: 18000,
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('12 sold'), findsOneWidget);
    expect(find.text('RM 180.00'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
