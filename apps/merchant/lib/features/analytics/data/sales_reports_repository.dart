import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../generated/database.dart';

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

/// Fetches sales report data from Supabase for a given date range.
class SalesReportsRepository {
  SalesReportsRepository(this._supabase);

  final SupabaseClient _supabase;

  Future<SalesReportData> fetchReport({
    required DateTime start,
    required DateTime end,
  }) async {
    final results = await Future.wait([
      _supabase
          .from('orders')
          .select()
          .gte('created_at', start.toIso8601String())
          .lte('created_at', end.toIso8601String())
          .inFilter('status', ['paid', 'completed']),
      _supabase.from('order_items').select(),
      _supabase
          .from('categories')
          .select('id, name')
          .eq('is_active', true),
      _supabase.from('menu_items').select('id, category_id, name'),
    ]);

    final orders =
        (results[0] as List<dynamic>).map((j) => OrdersRow.fromJson(j as Map<String, dynamic>)).toList();
    final orderItems =
        (results[1] as List<dynamic>).map((j) => OrderItemsRow.fromJson(j as Map<String, dynamic>)).toList();
    final categories =
        (results[2] as List<dynamic>).map((j) => CategoriesRow.fromJson(j as Map<String, dynamic>)).toList();
    final menuItems =
        (results[3] as List<dynamic>).map((j) => MenuItemsRow.fromJson(j as Map<String, dynamic>)).toList();

    return SalesReportData(
      orders: orders,
      orderItems: orderItems,
      categories: categories,
      menuItems: menuItems,
    );
  }
}