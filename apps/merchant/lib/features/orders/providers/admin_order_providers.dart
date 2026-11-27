import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../generated/tables/orders.dart';
import '../../../core/providers/supabase_provider.dart';
import '../data/merchant_api_client.dart';
import '../data/merchant_order_repository.dart';
import '../models/date_filter.dart';

/// Tab categories for the orders screen.
enum OrderTab {
  preparing,
  ready,
  upcoming,
  history,
}

/// Provides the MerchantApiClient instance.
final merchantApiClientProvider = Provider<MerchantApiClient>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return MerchantApiClient(supabase);
});

/// Provides the MerchantOrderRepository instance.
final merchantOrderRepositoryProvider = Provider<MerchantOrderRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  final apiClient = ref.watch(merchantApiClientProvider);
  return MerchantOrderRepository(supabase, apiClient);
});

/// Order ids whose status update is currently in flight.
///
/// The guard lives in the provider scope rather than the row on purpose. The
/// list can rebuild and replace a tile while its request is still running, and
/// a row can be disposed before the request settles; keying the guard by order
/// id means a fresh tile for the same order still sees the request in flight,
/// so a second tap cannot submit the same transition. Keying by id (not by
/// list position) also keeps the guard stable when rows reorder.
class OrderStatusUpdates extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};

  /// Marks [orderId] in flight and returns whether the caller may proceed.
  /// Returns false when a request for the same order is already pending.
  bool begin(String orderId) {
    if (state.contains(orderId)) return false;
    state = {...state, orderId};
    return true;
  }

  /// Clears the in-flight mark so a failed update can be retried.
  void finish(String orderId) {
    if (!state.contains(orderId)) return;
    state = {...state.where((id) => id != orderId)};
  }
}

final orderStatusUpdatesProvider =
    NotifierProvider<OrderStatusUpdates, Set<String>>(OrderStatusUpdates.new);

/// Currently selected date filter for the History tab.
final dateFilterProvider = StateProvider<DateFilter>((ref) => DateFilter());

/// Orders list provider — fetches orders based on the selected tab.
final adminOrdersProvider = FutureProvider.family<List<OrdersRow>, OrderTab>(
  (ref, tab) async {
    final repo = ref.watch(merchantOrderRepositoryProvider);

    switch (tab) {
      case OrderTab.preparing:
        return repo.fetchOrders(
          statuses: ['pending', 'paid', 'accepted', 'preparing'],
          fulfillmentType: 'asap',
        );
      case OrderTab.ready:
        return repo.fetchOrders(
          statuses: ['ready'],
          fulfillmentType: 'asap',
        );
      case OrderTab.upcoming:
        final bulk = await repo.fetchOrders(orderKind: 'bulk');
        final scheduled = await repo.fetchOrders(fulfillmentType: 'schedule');
        final merged = <String, OrdersRow>{};
        for (final o in [...bulk, ...scheduled]) {
          merged[o.id] = o;
        }
        final result = merged.values.toList()
          ..removeWhere(
            (o) => ['picked_up', 'delivered', 'cancelled'].contains(o.status),
          )
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        return result.take(200).toList();
      case OrderTab.history:
        final dateFilter = ref.watch(dateFilterProvider);
        return repo.fetchOrders(
          statuses: ['picked_up', 'delivered', 'cancelled'],
          startDate: dateFilter.dayStart,
          endDate: dateFilter.dayEnd,
        );
    }
  },
);

/// Aggregated summary for the History tab.
final historySummaryProvider = Provider<HistorySummary>((ref) {
  final ordersAsync = ref.watch(adminOrdersProvider(OrderTab.history));
  final orders = ordersAsync.valueOrNull ?? <OrdersRow>[];

  final totalCents = orders.fold<int>(0, (sum, o) => sum + o.totalCents);
  final completedCount = orders
      .where((o) => o.status == 'picked_up' || o.status == 'delivered')
      .length;
  final cancelledCount = orders.where((o) => o.status == 'cancelled').length;

  return HistorySummary(
    totalCents: totalCents,
    orderCount: orders.length,
    completedCount: completedCount,
    cancelledCount: cancelledCount,
  );
});

/// Order detail provider — fetches single order with items and events.
final adminOrderDetailProvider =
    FutureProvider.family<OrderDetail, String>((ref, orderId) async {
  final repo = ref.watch(merchantOrderRepositoryProvider);
  return repo.fetchOrderDetail(orderId);
});

/// Immutable summary of history order totals and counts.
class HistorySummary {
  const HistorySummary({
    required this.totalCents,
    required this.orderCount,
    required this.completedCount,
    required this.cancelledCount,
  });

  /// Sum of order totals in cents.
  final int totalCents;

  /// Total number of orders.
  final int orderCount;

  /// Number of completed orders (picked_up + delivered).
  final int completedCount;

  /// Number of cancelled orders.
  final int cancelledCount;
}
