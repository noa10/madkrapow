/// Parses an optional RM amount into cents. Empty means the regular price.
int? parseMenuPrice(String input) {
  final value = input.trim();
  if (value.isEmpty) return null;
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(value)) {
    throw const FormatException('Enter a valid price');
  }
  final parts = value.split('.');
  final whole = int.tryParse(parts[0]);
  if (whole == null || whole > 99999) {
    throw const FormatException('Price must be at most RM 99999.99');
  }
  return whole * 100 +
      (parts.length == 1 ? 0 : int.parse(parts[1].padRight(2, '0')));
}
