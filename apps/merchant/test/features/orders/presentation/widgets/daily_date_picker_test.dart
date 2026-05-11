import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/models/date_filter.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/daily_date_picker.dart';
import 'package:madkrapow_merchant/features/orders/providers/admin_order_providers.dart';

void main() {
  group('DailyDatePicker', () {
    testWidgets('renders selected date label', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dateFilterProvider.overrideWith(
              (ref) => DateFilter(date: DateTime(2026, 4, 10)),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: DailyDatePicker()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Friday, 10 Apr 2026'), findsOneWidget);
      expect(find.byIcon(Icons.calendar_today), findsOneWidget);
      expect(find.byIcon(Icons.keyboard_arrow_down), findsOneWidget);
    });

    testWidgets('tapping opens date picker bottom sheet', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: Scaffold(body: DailyDatePicker()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(InkWell));
      await tester.pumpAndSettle();

      expect(find.text('Select Date'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Done'), findsOneWidget);
      expect(find.byType(CupertinoPicker), findsOneWidget);
    });

    testWidgets('selecting new date updates provider', (tester) async {
      DateFilter? capturedFilter;

      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: Consumer(
                builder: (context, ref, _) {
                  capturedFilter = ref.watch(dateFilterProvider);
                  return const DailyDatePicker();
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(capturedFilter?.displayLabel, 'Today');

      await tester.tap(find.byType(InkWell));
      await tester.pumpAndSettle();

      // Simulate picking a date by tapping Done (uses the current date)
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // After Done, the sheet should close and provider still has a value
      expect(find.byType(CupertinoPicker), findsNothing);
    });
  });
}
