/// In-memory record of orders opened on this installation.
///
/// The server view table is the source of truth for repeat scheduling; this
/// registry suppresses an in-flight repeat that raced a successful ack.
class ViewedOrderRegistry {
  final _ids = <String>{};

  bool contains(String orderId) => _ids.contains(orderId);

  void add(String orderId) => _ids.add(orderId);

  /// A new account must not inherit the previous session's views.
  void clear() => _ids.clear();
}
