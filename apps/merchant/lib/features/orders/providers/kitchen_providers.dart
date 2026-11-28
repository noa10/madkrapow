import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/order_fields.dart';
import '../../../generated/tables/orders.dart';
import '../data/merchant_order_repository.dart';
import 'admin_order_providers.dart';

/// Order statuses the kitchen is actively working on.
///
/// Un-paid (`pending`) tickets are excluded here but still reach the board
/// when they are dine-in or counter orders — see
/// [MerchantOrderRepository.fetchKitchenOrders]. Terminal states
/// (`picked_up`, `delivered`, `cancelled`) never do, except a delivered
/// counter take-away whose kitchen work is still open.
const kitchenActiveStatuses = ['paid', 'accepted', 'preparing', 'ready'];

/// Kitchen progress values that keep a delivered counter take-away on the
/// board. `ready` is the pass — the food is waiting for the customer.
const kitchenOpenStatuses = ['paid', 'preparing'];

/// Whether a ticket belongs on the kitchen board. Mirrors the web
/// `isKitchenActive` helper for any client-side filtering.
///
/// A POS-completed counter take-away is `delivered` before it is cooked, so
/// it stays active while [kitchenStatus] is `paid` or `preparing`.
bool isKitchenActive({
  required String status,
  String? deliveryType,
  String? source,
  String? kitchenStatus,
}) {
  if (kitchenActiveStatuses.contains(status)) return true;
  if (status == 'delivered') {
    return isCounterPickupOrder(source: source, deliveryType: deliveryType) &&
        kitchenOpenStatuses.contains(kitchenStatus);
  }
  if (status != 'pending') return false;
  return deliveryType == 'dine_in' || source == 'counter';
}

/// The tickets to draw, dropping any that finished while the board was open.
///
/// The queue query already excludes them, but a realtime refresh can race a
/// kitchen tap, so the render path filters as well.
List<KitchenOrderCardData> visibleKitchenCards(
  List<KitchenOrderCardData> cards,
) => [
  for (final card in cards)
    if (isKitchenActive(
      status: card.order.status,
      deliveryType: card.order.deliveryType,
      source: card.order.source,
      kitchenStatus: card.order.kitchenStatus,
    ))
      card,
];

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
