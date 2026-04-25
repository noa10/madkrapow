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

/// Currently selected date filter for the History tab.
final dateFilterProvider = StateProvider<DateFilter>((ref) => DateFilter());

/// Orders list provider — fetches orders based on the selected tab.
final adminOrdersProvider = FutureProvider.family<List<OrdersRow>, OrderTab>(
  (ref, tab) async {
    final repo = ref.watch(merchantOrderRepositoryProvider);

    switch (tab) {
      case OrderTab.preparing:
        return repo.fetchOrders(
          statuses: ['paid', 'accepted', 'preparing'],
          orderKind: 'standard',
          fulfillmentType: 'asap',
        );
      case OrderTab.ready:
        return repo.fetchOrders(
          statuses: ['ready'],
          orderKind: 'standard',
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
