import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../generated/database.dart';
import 'merchant_api_client.dart';

/// PostgREST carries an `in.(...)` filter in the request URL, so an id list
/// built from data can outgrow proxy URL limits. Batching keeps every request
/// comfortably small; because the filter is by `order_item_id`, all modifiers
/// for a given item still land in the same batch, so per-item ordering holds.
const _idBatchSize = 150;

/// Splits [ids] into consecutive batches of at most [size] entries.
///
/// Order and contents are preserved, so concatenating the results of a batched
/// query yields the same rows as one unbounded query would have.
List<List<T>> batchIds<T>(List<T> ids, int size) {
  assert(size > 0, 'batch size must be positive');

  final batches = <List<T>>[];
  for (var start = 0; start < ids.length; start += size) {
    batches.add(ids.sublist(start, (start + size).clamp(0, ids.length)));
  }
  return batches;
}

/// An order item together with its selected modifiers/addons.
class OrderItemWithModifiers {
  final OrderItemsRow item;
  final List<OrderItemModifiersRow> modifiers;

  OrderItemWithModifiers({
    required this.item,
    required this.modifiers,
  });
}

/// Groups flat `order_items` and `order_item_modifiers` rows by order.
///
/// Both inputs are expected to arrive ordered by `created_at`, and that order is
/// preserved: modifiers keep their relative order within an item, and items keep
/// theirs within an order. Modifiers whose item is absent from [items] are
/// dropped rather than creating a phantom entry.
Map<String, List<OrderItemWithModifiers>> groupItemsAndModifiers(
  List<OrderItemsRow> items,
  List<OrderItemModifiersRow> modifiers,
) {
  final modifiersByItemId = <String, List<OrderItemModifiersRow>>{};
  for (final modifier in modifiers) {
    modifiersByItemId.putIfAbsent(modifier.orderItemId, () => []).add(modifier);
  }

  final byOrderId = <String, List<OrderItemWithModifiers>>{};
  for (final item in items) {
    byOrderId.putIfAbsent(item.orderId, () => []).add(
          OrderItemWithModifiers(
            item: item,
            modifiers: modifiersByItemId[item.id] ?? const [],
          ),
        );
  }

  return byOrderId;
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
    final itemsWithModifiers =
        groupItemsAndModifiers(items, modifiers)[orderId] ?? const [];

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

  /// Fetch items (with their modifiers) for many orders at once.
  ///
  /// Costs a small, bounded number of queries regardless of how many orders are
  /// requested, so list screens don't pay a query per row. Grouped by
  /// `order_id`; orders with no items are absent from the map rather than
  /// present with an empty list.
  ///
  /// [orderIds] is expected to be a page of orders (the caller's own limit
  /// bounds the first filter). Item ids are batched — see [_idBatchSize].
  Future<Map<String, List<OrderItemWithModifiers>>> fetchItemsForOrders(
    List<String> orderIds,
  ) async {
    if (orderIds.isEmpty) return const {};

    final itemsRes = await _supabase
        .from('order_items')
        .select()
        .inFilter('order_id', orderIds)
        .order('created_at');

    final items = itemsRes.map((json) => OrderItemsRow.fromJson(json)).toList();
    if (items.isEmpty) return const {};

    final itemIds = items.map((item) => item.id).toList();
    final modifiers = <OrderItemModifiersRow>[];

    for (final batch in batchIds(itemIds, _idBatchSize)) {
      final modifiersRes = await _supabase
          .from('order_item_modifiers')
          .select()
          .inFilter('order_item_id', batch)
          .order('created_at');

      modifiers.addAll(
        modifiersRes.map((json) => OrderItemModifiersRow.fromJson(json)),
      );
    }

    return groupItemsAndModifiers(items, modifiers);
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
