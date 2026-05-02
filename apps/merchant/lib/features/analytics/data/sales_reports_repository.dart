import 'dart:developer' as developer;

import '../../../generated/database.dart';
import '../../orders/data/merchant_api_client.dart';

/// Holds raw data fetched for the sales report.
class SalesReportData {
  final List<OrdersRow> orders;
  final List<OrderItemsRow> orderItems;
  final List<CategoriesRow> categories;
  final List<MenuItemsRow> menuItems;

  const SalesReportData({
    required this.orders,
    required this.orderItems,
    required this.categories,
    required this.menuItems,
  });
}

/// Fetches sales report data from the server-side admin API.
/// Uses the service-role client on the server to bypass RLS.
class SalesReportsRepository {
  SalesReportsRepository(this._apiClient);

  final MerchantApiClient _apiClient;

  /// [preset] must be one of: today, yesterday, last7days, last30days, thisWeek,
  /// thisMonth, custom. [customStart] / [customEnd] are required when preset is 'custom'.
  Future<SalesReportData> fetchReport({
    required String preset,
    DateTime? customStart,
    DateTime? customEnd,
  }) async {
    final queryParams = <String, String>{
      'preset': preset,
    };
    if (preset == 'custom') {
      if (customStart != null) {
        queryParams['start'] =
            '${customStart.year}-${customStart.month.toString().padLeft(2, '0')}-${customStart.day.toString().padLeft(2, '0')}';
      }
      if (customEnd != null) {
        queryParams['end'] =
            '${customEnd.year}-${customEnd.month.toString().padLeft(2, '0')}-${customEnd.day.toString().padLeft(2, '0')}';
      }
    }

    developer.log('[SalesReports] Fetching with params: $queryParams',
        name: 'SalesReportsRepository');
    final response = await _apiClient.get('/admin/sales-reports', queryParams);
    developer.log('[SalesReports] Response keys: ${response.keys.toList()}',
        name: 'SalesReportsRepository');

    final orders = _parseList(response, 'orders', OrdersRow.fromJson);
    final orderItems = _parseList(response, 'orderItems', OrderItemsRow.fromJson);
    final categories = _parseList(response, 'categories', CategoriesRow.fromJson);
    final menuItems = _parseList(response, 'menuItems', MenuItemsRow.fromJson);

    developer.log(
        '[SalesReports] Parsed: ${orders.length} orders, ${orderItems.length} items, ${categories.length} categories, ${menuItems.length} menuItems',
        name: 'SalesReportsRepository');

    return SalesReportData(
      orders: orders,
      orderItems: orderItems,
      categories: categories,
      menuItems: menuItems,
    );
  }

  List<T> _parseList<T>(
    Map<String, dynamic> json,
    String key,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final list = json[key];
    if (list is! List) return [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(fromJson)
        .toList();
  }
}
