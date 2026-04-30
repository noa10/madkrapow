import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../../generated/tables/lalamove_shipments.dart';
import '../../../generated/tables/order_items.dart';
import '../../../generated/tables/order_item_modifiers.dart';
import '../../../generated/tables/orders.dart';
import '../models/date_filter.dart';

/// An order item together with its selected modifiers/addons.
class OrderItemWithModifiers {
  final OrderItemsRow item;
  final List<OrderItemModifiersRow> modifiers;

  OrderItemWithModifiers({
    required this.item,
    required this.modifiers,
  });
}

class OrderWithDetails {
  const OrderWithDetails({
    required this.order,
    this.items = const [],
    this.shipment,
  });

  final OrdersRow order;
  final List<OrderItemWithModifiers> items;
  final LalamoveShipmentsRow? shipment;
}

class OrderRepository {
  OrderRepository(this._supabase);
  final SupabaseClient _supabase;

  /// Fetch a single order with its items and shipment.
  Future<OrderWithDetails> fetchOrderDetails(String orderId) async {
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

    LalamoveShipmentsRow? shipment;
    final shipmentRes = await _supabase
        .from('lalamove_shipments')
        .select()
        .eq('order_id', orderId)
        .limit(1);

    if (shipmentRes.isNotEmpty) {
      shipment = LalamoveShipmentsRow.fromJson(shipmentRes.first);
    }

    return OrderWithDetails(
        order: order, items: itemsWithModifiers, shipment: shipment);
  }

  /// Fetch order history for the current user, optionally filtered by date range.
  Future<List<OrdersRow>> fetchOrderHistory(
    String userId, {
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    // Resolve customer_id from auth_user_id
    final customerRes = await _supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();

    if (customerRes == null) return [];

    final customerId = customerRes['id'] as String;

    var query = _supabase
        .from('orders')
        .select()
        .eq('customer_id', customerId);

    if (startDate != null) {
      query = query.gte('created_at', startDate.toIso8601String());
    }
    if (endDate != null) {
      query = query.lte('created_at', endDate.toIso8601String());
    }

    final ordersRes = await query
        .order('created_at', ascending: false)
        .limit(200);

    return ordersRes.map((json) => OrdersRow.fromJson(json)).toList();
  }

  /// Fetch order items for reorder functionality.
  Future<List<OrderItemsRow>> fetchOrderItems(String orderId) async {
    final res = await _supabase
        .from('order_items')
        .select()
        .eq('order_id', orderId);

    return res.map((json) => OrderItemsRow.fromJson(json)).toList();
  }

  /// Subscribe to realtime updates for an order.
  RealtimeChannel subscribeToOrder(
    String orderId, {
    required void Function() onUpdate,
  }) {
    return _supabase.channel('order:$orderId').onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'orders',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: orderId,
          ),
          callback: (_) => onUpdate(),
        ).onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'lalamove_shipments',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'order_id',
            value: orderId,
          ),
          callback: (_) => onUpdate(),
        ).subscribe();
  }

  /// Unsubscribe from realtime updates.
  void unsubscribeFromOrder(RealtimeChannel channel) {
    _supabase.removeChannel(channel);
  }
}

final orderRepositoryProvider = Provider<OrderRepository>((ref) {
  return OrderRepository(ref.watch(supabaseProvider));
});

/// Order detail with realtime updates.
final orderDetailProvider =
    FutureProvider.family<OrderWithDetails, String>((ref, orderId) async {
  final repo = ref.watch(orderRepositoryProvider);
  return repo.fetchOrderDetails(orderId);
});

/// Active date filter for order history. Defaults to today.
final orderDateFilterProvider = StateProvider<DateFilter>((ref) => DateFilter());

/// Order history for the current user, filtered by the selected date.
final orderHistoryProvider = FutureProvider<List<OrdersRow>>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null) return [];
  final repo = ref.watch(orderRepositoryProvider);
  final dateFilter = ref.watch(orderDateFilterProvider);
  return repo.fetchOrderHistory(
    user.id,
    startDate: dateFilter.dayStart,
    endDate: dateFilter.dayEnd,
  );
});

/// Aggregated summary of completed and cancelled orders for the selected date.
final orderSummaryProvider = Provider<OrderSummary>((ref) {
  final ordersAsync = ref.watch(orderHistoryProvider);
  final orders = ordersAsync.valueOrNull ?? <OrdersRow>[];

  final completedCount = orders
      .where((o) => o.status == 'picked_up' || o.status == 'delivered')
      .length;
  final cancelledCount = orders.where((o) => o.status == 'cancelled').length;

  return OrderSummary(
    totalOrders: orders.length,
    completedCount: completedCount,
    cancelledCount: cancelledCount,
  );
});

/// Immutable summary of order counts.
class OrderSummary {
  const OrderSummary({
    required this.totalOrders,
    required this.completedCount,
    required this.cancelledCount,
  });

  final int totalOrders;
  final int completedCount;
  final int cancelledCount;
}
