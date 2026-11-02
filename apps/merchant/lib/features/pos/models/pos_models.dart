/// Data models for the counter POS.
///
/// These are deliberately plain Dart (no Supabase row classes): the generated
/// `lib/generated` rows predate migrations 057–064, so the POS reads the raw
/// PostgREST maps and parses only the columns it needs. Money is always integer
/// cents.
library;

/// How a POS sale is fulfilled. Take-away reuses the existing pickup path.
enum PosOrderType {
  dineIn('dine_in', 'Dine-in'),
  takeAway('take_away', 'Take-away');

  const PosOrderType(this.wire, this.label);

  final String wire;
  final String label;
}

/// Payment methods the counter accepts today. Card is intentionally absent
/// until a terminal integration exists.
enum PosPaymentMethod {
  cash('cash', 'Cash'),
  qrPay('qr_pay', 'Company QR');

  const PosPaymentMethod(this.wire, this.label);

  final String wire;
  final String label;
}

class PosCategory {
  const PosCategory({
    required this.id,
    required this.name,
    required this.sortOrder,
  });

  factory PosCategory.fromJson(Map<String, dynamic> json) => PosCategory(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String name;
  final int sortOrder;
}

class PosMenuItem {
  const PosMenuItem({
    required this.id,
    required this.name,
    required this.description,
    required this.imageUrl,
    required this.priceCents,
    required this.isAvailable,
    required this.categoryId,
    required this.sortOrder,
  });

  factory PosMenuItem.fromJson(Map<String, dynamic> json) => PosMenuItem(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    description: json['description'] as String?,
    imageUrl: json['image_url'] as String?,
    priceCents: (json['price_cents'] as num?)?.toInt() ?? 0,
    isAvailable: json['is_available'] as bool? ?? true,
    categoryId: json['category_id'] as String? ?? '',
    sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String name;
  final String? description;
  final String? imageUrl;
  final int priceCents;
  final bool isAvailable;
  final String categoryId;
  final int sortOrder;
}

class PosModifier {
  const PosModifier({
    required this.id,
    required this.name,
    required this.priceDeltaCents,
    required this.modifierGroupId,
    required this.sortOrder,
  });

  factory PosModifier.fromJson(Map<String, dynamic> json) => PosModifier(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    priceDeltaCents: (json['price_delta_cents'] as num?)?.toInt() ?? 0,
    modifierGroupId: json['modifier_group_id'] as String? ?? '',
    sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String name;
  final int priceDeltaCents;
  final String modifierGroupId;
  final int sortOrder;
}

/// A modifier group attached to one dish, in the shape the options sheet uses.
class PosModifierGroup {
  const PosModifierGroup({
    required this.id,
    required this.name,
    required this.minSelections,
    required this.maxSelections,
    required this.isRequired,
    required this.modifiers,
  });

  final String id;
  final String name;
  final int minSelections;
  final int maxSelections;

  /// The per-item junction flag (`menu_item_modifier_groups.is_required`).
  final bool isRequired;
  final List<PosModifier> modifiers;

  /// A group counts as required when either the junction flag or the group's
  /// own minimum says so — the live data uses one or the other.
  bool get required => isRequired || minSelections > 0;

  /// How many picks a required group needs.
  int get requiredCount => minSelections > 1 ? minSelections : 1;

  bool get isSingleChoice => maxSelections == 1;
}

/// An add-on as carried by a cart line.
class PosCartModifier {
  const PosCartModifier({
    required this.id,
    required this.name,
    required this.priceDeltaCents,
  });

  final String id;
  final String name;
  final int priceDeltaCents;
}

/// A physical table as the POS needs it. Deliberately has no `qr_token`:
/// the DB policy lets every staff role read that column, so this class omits
/// it — only the admin/manager management screen asks for the token.
class RestaurantTable {
  const RestaurantTable({
    required this.id,
    required this.label,
    required this.zone,
    required this.seats,
    required this.isActive,
    required this.sortOrder,
  });

  factory RestaurantTable.fromJson(Map<String, dynamic> json) =>
      RestaurantTable(
        id: json['id'] as String,
        label: json['label'] as String? ?? '',
        zone: json['zone'] as String?,
        seats: (json['seats'] as num?)?.toInt() ?? 2,
        isActive: json['is_active'] as bool? ?? true,
        sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      );

  final String id;
  final String label;
  final String? zone;
  final int seats;
  final bool isActive;
  final int sortOrder;

  String get detail => [
    zone,
    '$seats seats',
  ].where((part) => part != null && part.isNotEmpty).join(' · ');
}

/// A table plus its QR capability token — management screen only.
class TableWithToken extends RestaurantTable {
  const TableWithToken({
    required super.id,
    required super.label,
    required super.zone,
    required super.seats,
    required super.isActive,
    required super.sortOrder,
    required this.qrToken,
  });

  factory TableWithToken.fromJson(Map<String, dynamic> json) => TableWithToken(
    id: json['id'] as String,
    label: json['label'] as String? ?? '',
    zone: json['zone'] as String?,
    seats: (json['seats'] as num?)?.toInt() ?? 2,
    isActive: json['is_active'] as bool? ?? true,
    sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
    qrToken: json['qr_token'] as String? ?? '',
  );

  final String qrToken;
}

class PosOrderItemModifier {
  const PosOrderItemModifier({
    required this.name,
    required this.priceDeltaCents,
  });

  factory PosOrderItemModifier.fromJson(Map<String, dynamic> json) =>
      PosOrderItemModifier(
        name: json['modifier_name'] as String? ?? '',
        priceDeltaCents:
            (json['modifier_price_delta_cents'] as num?)?.toInt() ?? 0,
      );

  final String name;
  final int priceDeltaCents;
}

/// A dish on an open POS order (table-card details).
class PosOrderItem {
  const PosOrderItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.lineTotalCents,
    required this.notes,
    required this.modifiers,
  });

  factory PosOrderItem.fromJson(Map<String, dynamic> json) {
    final rawModifiers = json['order_item_modifiers'];
    return PosOrderItem(
      id: json['id'] as String,
      name: json['menu_item_name'] as String? ?? '',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      lineTotalCents: (json['line_total_cents'] as num?)?.toInt() ?? 0,
      notes: json['notes'] as String?,
      modifiers: rawModifiers is List
          ? rawModifiers
                .whereType<Map<String, dynamic>>()
                .map(PosOrderItemModifier.fromJson)
                .toList(growable: false)
          : const [],
    );
  }

  final String id;
  final String name;
  final int quantity;
  final int lineTotalCents;
  final String? notes;
  final List<PosOrderItemModifier> modifiers;
}

/// The subset of an order the POS table board and unpaid queue need.
class PosOpenOrder {
  const PosOpenOrder({
    required this.id,
    required this.displayCode,
    required this.status,
    required this.totalCents,
    required this.createdAt,
    required this.customerName,
    required this.pax,
    required this.tableId,
    required this.tableLabel,
    required this.deliveryType,
    required this.source,
    required this.items,
    this.orderNumber,
  });

  factory PosOpenOrder.fromJson(Map<String, dynamic> json) {
    final rawItems = json['order_items'];
    return PosOpenOrder(
      id: json['id'] as String,
      orderNumber: json['order_number'] as String?,
      displayCode: json['display_code'] as String?,
      status: json['status'] as String? ?? 'pending',
      totalCents: (json['total_cents'] as num?)?.toInt() ?? 0,
      createdAt:
          DateTime.tryParse(json['created_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      customerName: json['customer_name'] as String?,
      pax: (json['pax'] as num?)?.toInt(),
      tableId: json['table_id'] as String?,
      tableLabel: json['table_label'] as String?,
      deliveryType: json['delivery_type'] as String?,
      source: json['source'] as String?,
      items: rawItems is List
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(PosOrderItem.fromJson)
                .toList(growable: false)
          : const [],
    );
  }

  final String id;
  final String? orderNumber;
  final String? displayCode;
  final String status;
  final int totalCents;
  final DateTime createdAt;
  final String? customerName;
  final int? pax;
  final String? tableId;
  final String? tableLabel;
  final String? deliveryType;
  final String? source;
  final List<PosOrderItem> items;

  bool get isPending => status == 'pending';
  bool get isDineIn => deliveryType == 'dine_in';

  String get code {
    if (displayCode != null && displayCode!.isNotEmpty) return displayCode!;
    if (orderNumber != null && orderNumber!.isNotEmpty) return orderNumber!;
    return '—';
  }
}

/// Response of `POST /api/pos/orders`.
class PosCreateOrderResult {
  const PosCreateOrderResult({
    required this.orderId,
    required this.orderNumber,
    required this.displayCode,
    required this.totalCents,
    required this.status,
    required this.tableLabel,
    required this.pax,
  });

  factory PosCreateOrderResult.fromJson(Map<String, dynamic> json) {
    final orderId = json['order_id'];
    final orderNumber = json['order_number'];
    final totalCents = json['total_cents'];
    if (orderId is! String ||
        orderId.isEmpty ||
        orderNumber is! String ||
        orderNumber.isEmpty ||
        totalCents is! int ||
        totalCents < 0 ||
        json['status'] != 'paid') {
      throw const FormatException('Incomplete or unconfirmed POS order');
    }
    return PosCreateOrderResult(
      orderId: orderId,
      orderNumber: orderNumber,
      displayCode: json['display_code'] as String?,
      totalCents: totalCents,
      status: 'paid',
      tableLabel: json['table_label'] as String?,
      pax: (json['pax'] as num?)?.toInt(),
    );
  }

  final String orderId;
  final String orderNumber;
  final String? displayCode;
  final int totalCents;
  final String status;
  final String? tableLabel;
  final int? pax;

  String get code =>
      displayCode == null || displayCode!.isEmpty ? orderNumber : displayCode!;
}

/// Response of the settle routes (single order or grouped table).
class PosSettleResult {
  const PosSettleResult({
    required this.success,
    required this.alreadySettled,
    required this.settledCount,
    required this.amountCents,
  });

  factory PosSettleResult.fromJson(Map<String, dynamic> json) =>
      PosSettleResult(
        success: json['success'] as bool? ?? false,
        alreadySettled: json['already_settled'] as bool? ?? false,
        settledCount: (json['settled_count'] as num?)?.toInt() ?? 1,
        amountCents: (json['amount_cents'] as num?)?.toInt() ?? 0,
      );

  final bool success;
  final bool alreadySettled;
  final int settledCount;
  final int amountCents;
}

/// Response of `POST /api/pos/tables/[id]/close`.
class PosCloseResult {
  const PosCloseResult({required this.success, required this.closed});

  factory PosCloseResult.fromJson(Map<String, dynamic> json) => PosCloseResult(
    success: json['success'] as bool? ?? false,
    closed: (json['closed'] as num?)?.toInt() ?? 0,
  );

  final bool success;
  final int closed;
}
