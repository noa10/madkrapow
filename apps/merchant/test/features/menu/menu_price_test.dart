import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_price.dart';

void main() {
  test('blank Grab price means fallback and zero remains an override', () {
    expect(parseMenuPrice(''), isNull);
    expect(parseMenuPrice('0'), 0);
    expect(parseMenuPrice('12.05'), 1205);
  });

  test('rejects malformed, negative, excessive or over-precise prices', () {
    for (final value in ['-1', '1.234', '1x', '100000.00', '.50']) {
      expect(() => parseMenuPrice(value), throwsFormatException, reason: value);
    }
  });
}
