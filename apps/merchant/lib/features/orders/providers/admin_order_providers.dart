import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../generated/tables/orders.dart';
// ignore: unused_import — re-exported for consuming screens
import '../../../generated/tables/order_items.dart';
// ignore: unused_import — re-exported for consuming screens
import '../../../generated/tables/order_events.dart';

import '../../../core/providers/supabase_provider.dart';
import '../data/merchant_api_client.dart';
import '../data/merchant_order_repository.dart';

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

/// Orders list provider — fetches all orders with optional status filter.
final adminOrdersProvider =
    FutureProvider.family<List<OrdersRow>, String?>((ref, statusFilter) async {
  final repo = ref.watch(merchantOrderRepositoryProvider);
  return repo.fetchOrders(statusFilter: statusFilter);
});

/// Order detail provider — fetches single order with items and events.
final adminOrderDetailProvider =
    FutureProvider.family<OrderDetail, String>((ref, orderId) async {
  final repo = ref.watch(merchantOrderRepositoryProvider);
  return repo.fetchOrderDetail(orderId);
});
