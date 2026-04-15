import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/admin_order_providers.dart';
import '../widgets/order_list_tile.dart';
import '../widgets/status_filter_bar.dart';

class AdminOrdersScreen extends ConsumerStatefulWidget {
  const AdminOrdersScreen({super.key});

  @override
  ConsumerState<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends ConsumerState<AdminOrdersScreen> {
  String? _statusFilter;
  RealtimeChannel? _realtimeChannel;

  @override
  void initState() {
    super.initState();
    // Subscribe to realtime new-order notifications
    final repo = ref.read(merchantOrderRepositoryProvider);
    _realtimeChannel = repo.subscribeToNewOrders(
      onNewOrder: () {
        if (!mounted) return;
        // Invalidate current filter to refresh list
        ref.invalidate(adminOrdersProvider(_statusFilter));
      },
    );
  }

  @override
  void dispose() {
    if (_realtimeChannel != null) {
      _realtimeChannel!.unsubscribe();
      _realtimeChannel = null;
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(adminOrdersProvider(_statusFilter));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(adminOrdersProvider(_statusFilter));
      },
      child: Column(
        children: [
          // Status filter bar
          StatusFilterBar(
            selectedStatus: _statusFilter,
            onStatusSelected: (status) {
              setState(() => _statusFilter = status);
            },
          ),
          const SizedBox(height: 8),

          // Orders list
          Expanded(
            child: ordersAsync.when(
              data: (orders) {
                if (orders.isEmpty) {
                  return const Center(
                    child: Text('No orders found'),
                  );
                }
                return ListView.builder(
                  itemCount: orders.length,
                  itemBuilder: (context, index) {
                    return OrderListTile(order: orders[index]);
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(err.toString()),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () =>
                          ref.invalidate(adminOrdersProvider(_statusFilter)),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
