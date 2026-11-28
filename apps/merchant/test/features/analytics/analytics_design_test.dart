import 'dart:ui' show SemanticsAction;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/analytics/data/analytics_models.dart';
import 'package:madkrapow_merchant/features/analytics/presentation/widgets/revenue_chart.dart';
import 'package:madkrapow_merchant/features/analytics/presentation/widgets/top_items_list.dart';

TrendPoint point(String date, int cents, [int orders = 0]) =>
    TrendPoint.fromJson({
      'order_date': date,
      'revenue_cents': cents,
      'order_count': orders,
    });

void main() {
  testWidgets(
    'daily values include zero-order dates across the returned range',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: RevenueChart(
                fromDate: '2026-10-31',
                toDate: '2026-11-04',
                trends: [
                  point('2026-11-01', 1250, 2),
                  point('2026-11-03', 2000, 5),
                ],
              ),
            ),
          ),
        ),
      );
      final chart = tester.widget<BarChart>(find.byType(BarChart));
      expect(chart.data.barGroups.length, 5);
      expect(chart.data.barGroups[2].width, chart.data.barGroups[1].width);
      expect(chart.data.barGroups[2].barRods.single.color, Colors.transparent);
      await tester.tap(find.text('View daily values'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Nov 2, 2026'));
      await tester.tap(find.text('Nov 2, 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Selected day · Nov 2, 2026'), findsOneWidget);
      expect(find.text('RM 0.00'), findsWidgets);
      expect(find.text('0 orders'), findsWidgets);
      await tester.ensureVisible(find.text('Nov 3, 2026'));
      await tester.tap(find.text('Nov 3, 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Selected day · Nov 3, 2026'), findsOneWidget);
      expect(find.text('RM 20.00'), findsWidgets);
      expect(find.text('5 orders'), findsWidgets);
      final selectedChart = tester.widget<BarChart>(find.byType(BarChart));
      expect(
        selectedChart.data.barGroups[1].barRods.single.color,
        isNot(selectedChart.data.barGroups[3].barRods.single.color),
      );
    },
  );

  testWidgets('an empty returned range shows each day as zero', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RevenueChart(
            fromDate: '2026-11-01',
            toDate: '2026-11-03',
            trends: [],
          ),
        ),
      ),
    );
    final chart = tester.widget<BarChart>(find.byType(BarChart));
    expect(chart.data.barGroups, hasLength(3));
    expect(
      chart.data.barGroups.every((group) => group.barRods.single.toY == 0),
      isTrue,
    );
    expect(find.text('Selected day · Nov 1, 2026'), findsOneWidget);
    expect(find.text('RM 0.00'), findsWidgets);
    expect(find.text('0 orders'), findsWidgets);
  });

  testWidgets('empty data without period totals does not invent zero sales', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: RevenueChart(trends: [])),
      ),
    );
    expect(
      find.text('No revenue data available for this period.'),
      findsOneWidget,
    );
    expect(find.text('RM 0.00'), findsNothing);
    expect(find.text('0 orders'), findsNothing);
  });

  testWidgets('long charts keep nearby dates labeled while scrolling', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RevenueChart(
            trends: [point('2026-01-01', 1000), point('2026-03-31', 2000)],
          ),
        ),
      ),
    );
    expect(find.text('Jan 4'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('daily details can be selected using accessibility actions', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: RevenueChart(
              trends: [point('2026-11-01', 1250, 2), point('2026-11-03', 0, 5)],
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('View daily values'));
    await tester.pumpAndSettle();
    final day = find.widgetWithText(ListTile, 'Nov 3, 2026');
    final node = tester.getSemantics(day);
    expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
    node.owner!.performAction(node.id, SemanticsAction.tap);
    await tester.pumpAndSettle();
    expect(find.text('Selected day · Nov 3, 2026'), findsOneWidget);
    expect(find.text('RM 0.00'), findsWidgets);
    expect(find.text('5 orders'), findsWidgets);
    semantics.dispose();
  });

  testWidgets('tapping a bar selects its daily summary', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: RevenueChart(
            trends: [
              point('2026-11-01', 1000, 1),
              point('2026-11-02', 2000, 3),
            ],
          ),
        ),
      ),
    );
    final bounds = tester.getRect(find.byType(BarChart));
    await tester.tapAt(
      Offset(bounds.left + 45 + (bounds.width - 45) * .75, bounds.top + 100),
    );
    await tester.pumpAndSettle();
    expect(find.text('Selected day · Nov 2, 2026'), findsOneWidget);
    expect(find.text('RM 20.00'), findsOneWidget);
    expect(find.text('3 orders'), findsOneWidget);
  });

  testWidgets('zero revenue still gives the chart a usable scale', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: RevenueChart(trends: [point('2026-11-01', 0)])),
      ),
    );
    final chart = tester.widget<BarChart>(find.byType(BarChart));
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
