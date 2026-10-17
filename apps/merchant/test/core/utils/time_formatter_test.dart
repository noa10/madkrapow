import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/utils/time_formatter.dart';

void main() {
  group('formatRelativeTimeAt', () {
    final now = DateTime(2026, 10, 17, 19, 42);

    test('returns "Just now" under 5 seconds', () {
      expect(
        formatRelativeTimeAt(now.subtract(const Duration(seconds: 4)), now),
        'Just now',
      );
    });

    test('returns seconds under a minute', () {
      expect(
        formatRelativeTimeAt(now.subtract(const Duration(seconds: 30)), now),
        '30s ago',
      );
    });

    test('returns minutes under an hour', () {
      expect(
        formatRelativeTimeAt(now.subtract(const Duration(minutes: 12)), now),
        '12 min ago',
      );
    });

    test('returns hours under a day', () {
      expect(
        formatRelativeTimeAt(now.subtract(const Duration(hours: 3)), now),
        '3h ago',
      );
    });

    test('returns days under 30 days', () {
      expect(
        formatRelativeTimeAt(now.subtract(const Duration(days: 2)), now),
        '2d ago',
      );
    });

    test('returns months beyond 30 days', () {
      expect(
        formatRelativeTimeAt(now.subtract(const Duration(days: 65)), now),
        '2mo ago',
      );
    });
  });

  group('formatRelativeTime', () {
    test('returns empty string for null', () {
      expect(formatRelativeTime(null), '');
    });

    test('reads the wall clock', () {
      expect(
        formatRelativeTime(DateTime.now().subtract(const Duration(minutes: 5))),
        '5 min ago',
      );
    });
  });
}
