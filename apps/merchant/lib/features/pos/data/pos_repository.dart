import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/pos_models.dart';
import '../models/pos_tables.dart';
import 'pos_api_client.dart';

/// Everything the sale screen needs from the menu.
class PosMenuData {
  const PosMenuData({
    required this.categories,
    required this.menuItems,
    required this.modifierGroupsByItem,
  });

  final List<PosCategory> categories;
  final List<PosMenuItem> menuItems;
  final Map<String, List<PosModifierGroup>> modifierGroupsByItem;
}

/// The live floor: active tables plus every open order the POS acts on.
class PosBoardData {
  const PosBoardData({required this.tables, required this.openOrders});

  final List<RestaurantTable> tables;
  final List<PosOpenOrder> openOrders;

  List<TableSummary> get summaries => [
    for (final table in tables)
      summarizeTable(
        table,
        openOrders.where((order) => order.tableId == table.id),
      ),
  ];

  List<PosOpenOrder> get unpaidTakeaway => openOrders
      .where(
        (order) => order.isPending && order.deliveryType == 'self_pickup',
      )
      .toList(growable: false);
}

/// Hybrid POS repository, matching the merchant app's conventions:
/// - Reads: Supabase directly (RLS with the staff JWT)
/// - Writes: the web API routes (server-side re-pricing + audit trail)
class PosRepository {
  PosRepository(this._supabase, this._apiClient);

  final SupabaseClient _supabase;
  final PosApiClient _apiClient;

  /// Dishes already confirmed to have no modifier groups, so tapping them
  /// repeatedly does not re-query the junction table (the web POS caches the
  /// same set). Cleared whenever the menu is refetched.
  final _noModifierItems = <String>{};

  static const _orderColumns =
      'id, order_number, display_code, status, total_cents, created_at, '
      'customer_name, pax, table_id, table_label, delivery_type, source';

  /// Dine-in cards expand to show dishes; take-away rows do not, so the embed
  /// is only requested where it is rendered.
  static const _orderColumnsWithItems =
      '$_orderColumns, order_items(id, menu_item_name, quantity, '
      'line_total_cents, notes, order_item_modifiers(modifier_name, '
      'modifier_price_delta_cents))';

  Future<PosMenuData> fetchMenu() async {
    _noModifierItems.clear();
    final results = await Future.wait([
      _supabase
          .from('categories')
          .select('id, name, sort_order')
          .eq('is_active', true)
          .order('sort_order', ascending: true),
      _supabase
          .from('menu_items')
          .select(
            'id, name, description, image_url, price_cents, is_available, '
            'category_id, sort_order',
          )
          .order('sort_order', ascending: true),
      _supabase
          .from('menu_item_modifier_groups')
          .select('menu_item_id, modifier_group_id, is_required'),
    ]);

    final categories = (results[0] as List)
        .cast<Map<String, dynamic>>()
        .map(PosCategory.fromJson)
        .toList(growable: false);
    final menuItems = (results[1] as List)
        .cast<Map<String, dynamic>>()
        .map(PosMenuItem.fromJson)
        .toList(growable: false);
    final junctions = (results[2] as List).cast<Map<String, dynamic>>();

    final groupIds = junctions
        .map((row) => row['modifier_group_id'] as String)
        .toSet()
        .toList(growable: false);

    var groups = const <Map<String, dynamic>>[];
    var modifiers = const <Map<String, dynamic>>[];

    if (groupIds.isNotEmpty) {
      final groupResults = await Future.wait([
        _supabase
            .from('modifier_groups')
            .select('id, name, min_selections, max_selections')
            .inFilter('id', groupIds)
            .order('sort_order', ascending: true),
        _supabase
            .from('modifiers')
            .select(
              'id, name, price_delta_cents, modifier_group_id, sort_order',
            )
            .inFilter('modifier_group_id', groupIds)
            .eq('is_available', true)
            .order('sort_order', ascending: true),
      ]);
      groups = (groupResults[0] as List).cast<Map<String, dynamic>>();
      modifiers = (groupResults[1] as List).cast<Map<String, dynamic>>();
    }

    final groupsById = {
      for (final group in groups) group['id'] as String: group,
    };
    final modifiersByGroup = <String, List<PosModifier>>{};
    for (final row in modifiers) {
      final modifier = PosModifier.fromJson(row);
      modifiersByGroup.putIfAbsent(modifier.modifierGroupId, () => []).add(
        modifier,
      );
    }

    final byItem = <String, List<PosModifierGroup>>{};
    for (final junction in junctions) {
      final group = groupsById[junction['modifier_group_id']];
      if (group == null) continue;
      final groupId = group['id'] as String;
      byItem.putIfAbsent(junction['menu_item_id'] as String, () => []).add(
        PosModifierGroup(
          id: groupId,
          name: group['name'] as String? ?? '',
          minSelections: (group['min_selections'] as num?)?.toInt() ?? 0,
          maxSelections: (group['max_selections'] as num?)?.toInt() ?? 1,
          isRequired: junction['is_required'] as bool? ?? false,
          modifiers: modifiersByGroup[groupId] ?? const [],
        ),
      );
    }

    return PosMenuData(
      categories: categories,
      menuItems: menuItems,
      modifierGroupsByItem: byItem,
    );
  }

  /// Live fallback for one dish when the prefetched index is stale or empty.
  ///
  /// Returns null on a query error so the caller can refuse to add a dish that
  /// may have required options; an empty list means "confirmed no options".
  Future<List<PosModifierGroup>?> fetchModifierGroupsForItem(
    String itemId,
  ) async {
    if (_noModifierItems.contains(itemId)) return const [];
    try {
      final junctionRows = await _supabase
          .from('menu_item_modifier_groups')
          .select('menu_item_id, modifier_group_id, is_required')
          .eq('menu_item_id', itemId);

      if (junctionRows.isEmpty) {
        _noModifierItems.add(itemId);
        return const [];
      }

      final groupIds = junctionRows
          .map((row) => row['modifier_group_id'] as String)
          .toSet()
          .toList(growable: false);

      final results = await Future.wait([
        _supabase
            .from('modifier_groups')
            .select('id, name, min_selections, max_selections')
            .inFilter('id', groupIds)
            .order('sort_order', ascending: true),
        _supabase
            .from('modifiers')
            .select(
              'id, name, price_delta_cents, modifier_group_id, sort_order',
            )
            .inFilter('modifier_group_id', groupIds)
            .eq('is_available', true)
            .order('sort_order', ascending: true),
      ]);

      final groups = results[0].cast<Map<String, dynamic>>();
      final modifiers = results[1].cast<Map<String, dynamic>>();

      final modifiersByGroup = <String, List<PosModifier>>{};
      for (final row in modifiers) {
        final modifier = PosModifier.fromJson(row);
        modifiersByGroup.putIfAbsent(modifier.modifierGroupId, () => []).add(
          modifier,
        );
      }

      final groupsById = {
        for (final group in groups) group['id'] as String: group,
      };
      final loaded = <PosModifierGroup>[];
      for (final row in junctionRows) {
        final group = groupsById[row['modifier_group_id']];
        if (group == null) continue;
        final groupId = group['id'] as String;
        loaded.add(
          PosModifierGroup(
            id: groupId,
            name: group['name'] as String? ?? '',
            minSelections: (group['min_selections'] as num?)?.toInt() ?? 0,
            maxSelections: (group['max_selections'] as num?)?.toInt() ?? 1,
            isRequired: row['is_required'] as bool? ?? false,
            modifiers: modifiersByGroup[groupId] ?? const [],
          ),
        );
      }
      return loaded;
    } catch (_) {
      return null;
    }
  }

  /// Active tables for the sale picker and board. Never selects `qr_token`.
  Future<List<RestaurantTable>> fetchActiveTables() async {
    final rows = await _supabase
        .from('restaurant_tables')
        .select('id, label, zone, seats, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', ascending: true)
        .order('label', ascending: true);
    return rows.map(RestaurantTable.fromJson).toList(growable: false);
  }

  /// Every table including inactive ones, with its QR token — management only.
  Future<List<TableWithToken>> fetchAllTables() async {
    final rows = await _supabase
        .from('restaurant_tables')
        .select('id, label, zone, seats, qr_token, is_active, sort_order')
        .order('sort_order', ascending: true)
        .order('label', ascending: true);
    return rows.map(TableWithToken.fromJson).toList(growable: false);
  }

  /// Open dine-in orders plus pending counter take-away tickets.
  Future<List<PosOpenOrder>> fetchOpenOrders() async {
    final results = await Future.wait([
      _supabase
          .from('orders')
          .select(_orderColumnsWithItems)
          .eq('delivery_type', 'dine_in')
          .inFilter('status', openDineInStatuses)
          .order('created_at', ascending: true),
      _supabase
          .from('orders')
          .select(_orderColumns)
          .eq('source', 'counter')
          .eq('delivery_type', 'self_pickup')
          .eq('status', 'pending')
          .order('created_at', ascending: true),
    ]);

    return [
      for (final row in results[0]) PosOpenOrder.fromJson(row),
      for (final row in results[1]) PosOpenOrder.fromJson(row),
    ];
  }

  Future<PosBoardData> fetchBoard() async {
    final results = await Future.wait([fetchActiveTables(), fetchOpenOrders()]);
    return PosBoardData(
      tables: results[0] as List<RestaurantTable>,
      openOrders: results[1] as List<PosOpenOrder>,
    );
  }

  /// Any `orders` change can affect the board (a new round, a settle, a void),
  /// so the callback is unfiltered and the caller debounces.
  RealtimeChannel subscribeToOrderChanges({required void Function() onChange}) {
    return _supabase
        .channel('pos-open-orders')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'orders',
          callback: (_) => onChange(),
        )
        .subscribe();
  }

  void unsubscribe(RealtimeChannel channel) {
    _supabase.removeChannel(channel);
  }

  // Mutations — the API re-validates prices and writes the ledger/audit rows.
  Future<PosCreateOrderResult> createOrder({
    required List<Map<String, dynamic>> items,
    required PosOrderType orderType,
    required PosPaymentMethod paymentMethod,
    String? tableId,
    int? pax,
    String? customerName,
  }) => _apiClient.createOrder(
    items: items,
    orderType: orderType,
    paymentMethod: paymentMethod,
    tableId: tableId,
    pax: pax,
    customerName: customerName,
  );

  Future<PosSettleResult> settleOrder(
    String orderId,
    PosPaymentMethod method,
  ) => _apiClient.settleOrder(orderId, method);

  Future<PosSettleResult> settleTable(
    String tableId,
    PosPaymentMethod method,
    List<String> orderIds,
  ) => _apiClient.settleTable(tableId, method, orderIds);

  Future<PosCloseResult> closeTable(String tableId, List<String> orderIds) =>
      _apiClient.closeTable(tableId, orderIds);

  Future<void> voidOrder(String orderId) => _apiClient.voidOrder(orderId);

  Future<TableWithToken> createTable({
    required String label,
    String? zone,
    int seats = 2,
    int sortOrder = 0,
    bool isActive = true,
  }) => _apiClient.createTable(
    label: label,
    zone: zone,
    seats: seats,
    sortOrder: sortOrder,
    isActive: isActive,
  );

  Future<TableWithToken> updateTable(
    String tableId,
    Map<String, dynamic> changes,
  ) => _apiClient.updateTable(tableId, changes);

  Future<String> rotateTableToken(String tableId) =>
      _apiClient.rotateTableToken(tableId);
}
