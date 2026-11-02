import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../generated/tables/orders.dart';
import '../data/merchant_order_repository.dart';
import 'admin_order_providers.dart';

/// Order statuses the kitchen is actively working on.
///
/// Un-paid (`pending`) tickets are excluded here but still reach the board
/// when they are dine-in or counter orders — see
/// [MerchantOrderRepository.fetchKitchenOrders]. Terminal states
/// (`picked_up`, `delivered`, `cancelled`) never do.
const kitchenActiveStatuses = ['paid', 'accepted', 'preparing', 'ready'];

/// Whether a ticket belongs on the kitchen board. Mirrors the web
/// `isKitchenActive` helper for any client-side filtering.
bool isKitchenActive({
  required String status,
  String? deliveryType,
  String? source,
}) {
  if (kitchenActiveStatuses.contains(status)) return true;
  if (status != 'pending') return false;
  return deliveryType == 'dine_in' || source == 'counter';
}

/// An active kitchen ticket: the order plus the items and addons to cook.
class KitchenOrderCardData {
  const KitchenOrderCardData({required this.order, required this.items});

  final OrdersRow order;
  final List<OrderItemWithModifiers> items;
}

/// Active kitchen tickets, each with its items and addons.
///
/// Items for every order are fetched in two batched queries rather than one per
/// order, so the cost stays flat as the number of tickets grows.
final kitchenOrderCardsProvider =
    FutureProvider<List<KitchenOrderCardData>>((ref) async {
  final repo = ref.watch(merchantOrderRepositoryProvider);

  final orders = await repo.fetchKitchenOrders();
  if (orders.isEmpty) return const [];

  final itemsByOrderId = await repo.fetchItemsForOrders(
    orders.map((order) => order.id).toList(),
  );

  return [
    for (final order in orders)
      KitchenOrderCardData(
        order: order,
        items: itemsByOrderId[order.id] ?? const [],
      ),
  ];
});
