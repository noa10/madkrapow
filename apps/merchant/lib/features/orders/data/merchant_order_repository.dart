import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../generated/database.dart';
import 'merchant_api_client.dart';

/// Hybrid order repository:
/// - Reads: Supabase client directly (RLS-enforced, admin SELECT policies)
/// - Writes: Via MerchantApiClient -> webapp API route (validation + audit trail)
class MerchantOrderRepository {
  MerchantOrderRepository(this._supabase, this._apiClient);

  final SupabaseClient _supabase;
  final MerchantApiClient _apiClient;

  /// Fetch orders, optionally filtered by status.
  Future<List<OrdersRow>> fetchOrders({String? statusFilter}) async {
    var query = _supabase.from('orders').select();

    if (statusFilter != null) {
      query = query.eq('status', statusFilter);
    }

    final response = await query
        .order('created_at', ascending: false)
        .limit(100);
    return response.map(OrdersRow.fromJson).toList();
  }

  /// Fetch a single order with items, modifiers, and events.
  Future<OrderDetail> fetchOrderDetail(String orderId) async {
    final orderRes = await _supabase
        .from('orders')
        .select()
        .eq('id', orderId)
        .single();

    final order = OrdersRow.fromJson(orderRes);

    final itemsRes = await _supabase
        .from('order_items')
        .select()
        .eq('order_id', orderId)
        .order('created_at');

    final items = itemsRes.map((json) => OrderItemsRow.fromJson(json)).toList();

    final eventsRes = await _supabase
        .from('order_events')
        .select()
        .eq('order_id', orderId)
        .order('created_at', ascending: true);

    final events =
        eventsRes.map((json) => OrderEventsRow.fromJson(json)).toList();

    return OrderDetail(order: order, items: items, events: events);
  }

  /// Advance order status via the API route (server-side validation).
  Future<void> updateOrderStatus(String orderId, String newStatus) async {
    await _apiClient.updateOrderStatus(orderId, newStatus);
  }

  /// Cancel an order via the API route.
  Future<void> cancelOrder(String orderId) async {
    await _apiClient.cancelOrder(orderId);
  }

  /// Approve a bulk order.
  Future<ApproveResult> approveOrder({
    required String orderId,
    required int approvedTotalCents,
    String? reviewNotes,
  }) async {
    return _apiClient.approveOrder(
      orderId: orderId,
      action: 'approve',
      approvedTotalCents: approvedTotalCents,
      reviewNotes: reviewNotes,
    );
  }

  /// Reject a bulk order.
  Future<ApproveResult> rejectOrder({
    required String orderId,
    String? reviewNotes,
  }) async {
    return _apiClient.approveOrder(
      orderId: orderId,
      action: 'reject',
      reviewNotes: reviewNotes,
    );
  }

  /// Subscribe to realtime updates for a specific order.
  RealtimeChannel subscribeToOrder(
    String orderId, {
    required void Function() onUpdate,
  }) {
    return _supabase
        .channel('order:$orderId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'orders',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: orderId,
          ),
          callback: (_) => onUpdate(),
        )
        .subscribe();
  }

  /// Subscribe to realtime updates for new orders.
  RealtimeChannel subscribeToNewOrders({
    required void Function() onNewOrder,
  }) {
    return _supabase
        .channel('admin-new-orders')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'orders',
          callback: (_) => onNewOrder(),
        )
        .subscribe();
  }

  /// Unsubscribe from a realtime channel.
  void unsubscribeFromChannel(RealtimeChannel channel) {
    _supabase.removeChannel(channel);
  }
}

/// Aggregated order detail with items and events.
class OrderDetail {
  final OrdersRow order;
  final List<OrderItemsRow> items;
  final List<OrderEventsRow> events;

  OrderDetail({
    required this.order,
    required this.items,
    required this.events,
  });
}
