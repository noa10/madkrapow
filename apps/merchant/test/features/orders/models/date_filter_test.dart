import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/models/date_filter.dart';

void main() {
  group('DateFilter', () {
    test('defaults to today when no date provided', () {
      final filter = DateFilter();
      final today = DateTime(
        DateTime.now().year,
        DateTime.now().month,
        DateTime.now().day,
      );
      expect(filter.selectedDate, today);
    });

    test('uses provided date stripped of time', () {
      final filter = DateFilter(date: DateTime(2026, 4, 10, 14, 30));
      expect(filter.selectedDate, DateTime(2026, 4, 10));
    });

    test('dayStart is midnight of selected date', () {
      final filter = DateFilter(date: DateTime(2026, 4, 10));
      expect(filter.dayStart, DateTime(2026, 4, 10));
    });

    test('dayEnd is 23:59:59 of selected date', () {
      final filter = DateFilter(date: DateTime(2026, 4, 10));
      expect(filter.dayEnd, DateTime(2026, 4, 10, 23, 59, 59));
    });

    group('displayLabel', () {
      test('shows Today for current date', () {
        final filter = DateFilter();
        expect(filter.displayLabel, 'Today');
      });

      test('shows Yesterday for previous date', () {
        final yesterday = DateTime.now().subtract(const Duration(days: 1));
        final filter = DateFilter(date: yesterday);
        expect(filter.displayLabel, 'Yesterday');
      });

      test('shows formatted date for other days', () {
        final filter = DateFilter(date: DateTime(2026, 4, 10));
        expect(filter.displayLabel, 'Friday, 10 Apr 2026');
      });
    });

    test('summaryLabel formats with day and month', () {
      final filter = DateFilter(date: DateTime(2026, 4, 10));
      expect(filter.summaryLabel, 'Total Sales (10 Apr)');
    });

    group('equality', () {
      test('same date are equal', () {
        final a = DateFilter(date: DateTime(2026, 4, 10));
        final b = DateFilter(date: DateTime(2026, 4, 10));
        expect(a, b);
      });

      test('different dates are not equal', () {
        final a = DateFilter(date: DateTime(2026, 4, 10));
        final b = DateFilter(date: DateTime(2026, 4, 11));
        expect(a, isNot(b));
      });
    });
  });
}
