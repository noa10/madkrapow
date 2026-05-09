/// Deterministic daily display code for orders.
/// Same order + same date = same code across all platforms.
String generateOrderDisplayCode(String orderId, [DateTime? date]) {
  final now = date ?? DateTime.now();
  // Kuala Lumpur is UTC+8
  final klDate = now.toUtc().add(const Duration(hours: 8));
  final dateStr = '${klDate.year}-${_pad2(klDate.month)}-${_pad2(klDate.day)}';
  final hash = _fnv1a(orderId + dateStr);
  final num_ = hash % 1000;
  return 'MK-${num_.toString().padLeft(3, '0')}';
}

int _fnv1a(String input) {
  const int fnvPrime = 0x01000193;
  const int offsetBasis = 0x811c9dc5;
  int hash = offsetBasis;
  for (int i = 0; i < input.length; i++) {
    hash ^= input.codeUnitAt(i);
    hash = (hash * fnvPrime) & 0xFFFFFFFF;
  }
  return hash;
}

String _pad2(int value) => value.toString().padLeft(2, '0');
