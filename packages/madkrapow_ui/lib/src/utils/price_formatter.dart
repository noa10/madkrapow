import 'package:intl/intl.dart';

/// Formats a price in cents to "RM X.XX".
String formatPrice(int cents) {
  return 'RM ${NumberFormat('#,##0.00').format(cents / 100)}';
}

/// Formats a price in cents to just the number "X.XX" (no currency symbol).
String formatPriceNumber(int cents) {
  return NumberFormat('#,##0.00').format(cents / 100);
}
