import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../generated/database.dart';
import 'merchant_api_client.dart';

/// An order item together with its selected modifiers/addons.
class OrderItemWithModifiers {
  final OrderItemsRow item;
  final List<OrderItemModifiersRow> modifiers;

  OrderItemWithModifiers({
    required this.item,
    required this.modifiers,
  });
}

/// Hybrid order repository:
/// - Reads: Supabase client directly (RLS-enforced, admin SELECT policies)
/// - Writes: Via MerchantApiClient -> webapp API route (validation + audit trail)
class MerchantOrderRepository {
  MerchantOrderRepository(this._supabase, this._apiClient);

  final SupabaseClient _supabase;
  final MerchantApiClient _apiClient;

  /// Fetch orders, optionally filtered by statuses and date range.
  Future<List<OrdersRow>> fetchOrders({
    List<String>? statuses,
    DateTime? startDate,
    DateTime? endDate,
    String? orderKind,
    String? fulfillmentType,
  }) async {
    var query = _supabase.from('orders').select();

    if (statuses != null && statuses.isNotEmpty) {
      if (statuses.length == 1) {
        query = query.eq('status', statuses.first);
      } else {
        query = query.inFilter('status', statuses);
      }
    }

    if (startDate != null) {
      query = query.gte('created_at', startDate.toIso8601String());
    }

    if (endDate != null) {
      query = query.lte('created_at', endDate.toIso8601String());
    }

    if (orderKind != null) {
      query = query.eq('order_kind', orderKind);
    }

    if (fulfillmentType != null) {
      query = query.eq('fulfillment_type', fulfillmentType);
    }

    final response = await query
        .order('created_at', ascending: false)
        .limit(200);
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

    // Fetch modifiers for all items in this order
    final itemIds = items.map((i) => i.id).toList();
    List<OrderItemModifiersRow> modifiers = [];
    if (itemIds.isNotEmpty) {
      final modifiersRes = await _supabase
          .from('order_item_modifiers')
          .select()
          .inFilter('order_item_id', itemIds)
          .order('created_at');

      modifiers = modifiersRes
          .map((json) => OrderItemModifiersRow.fromJson(json))
          .toList();
    }

    // Group modifiers by order_item_id
    final modifiersByItemId = <String, List<OrderItemModifiersRow>>{};
    for (final m in modifiers) {
      modifiersByItemId.putIfAbsent(m.orderItemId, () => []).add(m);
    }

    final itemsWithModifiers = items
        .map((item) => OrderItemWithModifiers(
              item: item,
              modifiers: modifiersByItemId[item.id] ?? [],
            ))
        .toList();

    final eventsRes = await _supabase
        .from('order_events')
        .select()
        .eq('order_id', orderId)
        .order('created_at', ascending: true);

    final events =
        eventsRes.map((json) => OrderEventsRow.fromJson(json)).toList();

    final shipmentRes = await _supabase
        .from('lalamove_shipments')
        .select()
        .eq('order_id', orderId)
        .order('created_at', ascending: false)
        .limit(1);

    final LalamoveShipmentsRow? shipment =
        shipmentRes.isNotEmpty
            ? LalamoveShipmentsRow.fromJson(shipmentRes.first)
            : null;

    return OrderDetail(
        order: order,
        items: itemsWithModifiers,
        events: events,
        shipment: shipment);
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
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'lalamove_shipments',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'order_id',
            value: orderId,
          ),
          callback: (_) => onUpdate(),
        )
        .subscribe();
  }

  /// Subscribe to realtime updates for new orders and status changes.
  RealtimeChannel subscribeToNewOrders({
    required void Function() onNewOrder,
  }) {
    return _supabase
        .channel('admin-orders')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'orders',
          callback: (_) => onNewOrder(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
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

/// Aggregated order detail with items, events, and optional shipment.
class OrderDetail {
  final OrdersRow order;
  final List<OrderItemWithModifiers> items;
  final List<OrderEventsRow> events;
  final LalamoveShipmentsRow? shipment;

  OrderDetail({
    required this.order,
    required this.items,
    required this.events,
    this.shipment,
  });
}
