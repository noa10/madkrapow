// ignore_for_file: dangling_library_doc_comments
/// Data models for analytics API responses.

class DailyPulse {
  final int orderCount;
  final int revenueCents;
  final int avgOrderCents;
  final int deliveryCount;
  final int pickupCount;

  const DailyPulse({
    required this.orderCount,
    required this.revenueCents,
    required this.avgOrderCents,
    required this.deliveryCount,
    required this.pickupCount,
  });

  factory DailyPulse.fromJson(Map<String, dynamic> json) => DailyPulse(
        orderCount: json['order_count'] as int? ?? 0,
        revenueCents: json['revenue_cents'] as int? ?? 0,
        avgOrderCents: json['avg_order_cents'] as int? ?? 0,
        deliveryCount: json['delivery_count'] as int? ?? 0,
        pickupCount: json['pickup_count'] as int? ?? 0,
      );
}

class TrendPoint {
  final String orderDate;
  final int orderCount;
  final int revenueCents;
  final int subtotalCents;
  final int deliveryFeesCents;
  final int discountsCents;
  final int deliveryCount;
  final int pickupCount;

  const TrendPoint({
    required this.orderDate,
    required this.orderCount,
    required this.revenueCents,
    required this.subtotalCents,
    required this.deliveryFeesCents,
    required this.discountsCents,
    required this.deliveryCount,
    required this.pickupCount,
  });

  factory TrendPoint.fromJson(Map<String, dynamic> json) => TrendPoint(
        orderDate: json['order_date'] as String,
        orderCount: json['order_count'] as int? ?? 0,
        revenueCents: json['revenue_cents'] as int? ?? 0,
        subtotalCents: json['subtotal_cents'] as int? ?? 0,
        deliveryFeesCents: json['delivery_fees_cents'] as int? ?? 0,
        discountsCents: json['discounts_cents'] as int? ?? 0,
        deliveryCount: json['delivery_count'] as int? ?? 0,
        pickupCount: json['pickup_count'] as int? ?? 0,
      );
}

class TopItem {
  final String menuItemName;
  final String? menuItemId;
  final int totalQuantity;
  final int totalRevenueCents;

  const TopItem({
    required this.menuItemName,
    this.menuItemId,
    required this.totalQuantity,
    required this.totalRevenueCents,
  });

  factory TopItem.fromJson(Map<String, dynamic> json) => TopItem(
        menuItemName: json['menu_item_name'] as String,
        menuItemId: json['menu_item_id'] as String?,
        totalQuantity: json['total_quantity'] as int? ?? 0,
        totalRevenueCents: json['total_revenue_cents'] as int? ?? 0,
      );
}

class AnalyticsData {
  final DailyPulse pulse;
  final List<TrendPoint> trends;
  final List<TopItem> topItems;

  const AnalyticsData({
    required this.pulse,
    required this.trends,
    required this.topItems,
  });

  factory AnalyticsData.fromJson(Map<String, dynamic> json) => AnalyticsData(
        pulse: DailyPulse.fromJson(json['pulse'] as Map<String, dynamic>),
        trends: (json['trends'] as List<dynamic>?)
                ?.map((e) => TrendPoint.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        topItems: (json['top_items'] as List<dynamic>?)
                ?.map((e) => TopItem.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

/// Format cents as Malaysian Ringgit string.
String formatCents(int cents) => 'RM ${(cents / 100).toStringAsFixed(2)}';
