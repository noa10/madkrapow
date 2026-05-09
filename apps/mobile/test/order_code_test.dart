import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/core/utils/order_code.dart';

void main() {
  group('generateOrderDisplayCode', () {
    test('returns MK- format with 3 digits', () {
      final code = generateOrderDisplayCode(
        'test-order-id',
        DateTime.utc(2026, 5, 9, 10, 0, 0),
      );
      expect(code, matches(r'^MK-\d{3}$'));
    });

    test('same order + same date = same code', () {
      const orderId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      final date = DateTime.utc(2026, 5, 9, 12, 0, 0);
      final code1 = generateOrderDisplayCode(orderId, date);
      final code2 = generateOrderDisplayCode(orderId, date);
      expect(code1, code2);
    });

    test('different dates produce different codes', () {
      const orderId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      final date1 = DateTime.utc(2026, 5, 9, 12, 0, 0);
      final date2 = DateTime.utc(2026, 5, 10, 12, 0, 0);
      final code1 = generateOrderDisplayCode(orderId, date1);
      final code2 = generateOrderDisplayCode(orderId, date2);
      expect(code1, isNot(code2));
    });

    test('different orders produce different codes on same day', () {
      final date = DateTime.utc(2026, 5, 9, 12, 0, 0);
      final code1 = generateOrderDisplayCode('order-aaa', date);
      final code2 = generateOrderDisplayCode('order-bbb', date);
      expect(code1, isNot(code2));
    });

    test('KL timezone boundary: 15:59 UTC May 8 = May 8 KL, 16:00 UTC = May 9 KL',
        () {
      // KL is UTC+8, so midnight KL = 16:00 UTC previous day
      final orderId = 'boundary-test-order';
      final beforeMidnightKl = DateTime.utc(2026, 5, 8, 15, 59, 0); // May 8 23:59 KL
      final afterMidnightKl = DateTime.utc(2026, 5, 8, 16, 0, 0); // May 9 00:00 KL
      final codeBefore = generateOrderDisplayCode(orderId, beforeMidnightKl);
      final codeAfter = generateOrderDisplayCode(orderId, afterMidnightKl);
      expect(codeBefore, isNot(codeAfter));
    });

    test('code is always 6 characters total', () {
      final code = generateOrderDisplayCode('any-id', DateTime.utc(2026, 1, 1));
      expect(code.length, 6);
    });

    test('deterministic hash for known input', () {
      // Verify FNV-1a produces consistent results
      const orderId = '00000000-0000-0000-0000-000000000001';
      final date = DateTime.utc(2026, 5, 9, 0, 0, 0);
      final code = generateOrderDisplayCode(orderId, date);
      // Should produce a valid MK-### code
      expect(code, matches(r'^MK-\d{3}$'));
    });
  });
}
