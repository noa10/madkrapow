import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../generated/tables/orders.dart';
import '../../providers/admin_order_providers.dart';
import 'order_list_tile.dart';

/// Renders orders in a flat sliver list without date grouping headers.
class FlatOrderList extends StatelessWidget {
  const FlatOrderList({super.key, required this.orders, required this.tab});

  final List<OrdersRow> orders;
  final OrderTab tab;

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return SliverToBoxAdapter(child: _EmptyOrders(tab: tab));
    }

    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) => OrderListTile(order: orders[index]),
          childCount: orders.length,
        ),
      ),
    );
  }
}

class _EmptyOrders extends StatelessWidget {
  const _EmptyOrders({required this.tab});

  final OrderTab tab;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = _emptyContent(tab);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(content.icon, size: 44, color: AppColors.muted),
              const SizedBox(height: 16),
              Text(
                content.title,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppColors.foreground,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                content.body,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  height: 1.5,
                  color: AppColors.muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

({IconData icon, String title, String body}) _emptyContent(OrderTab tab) {
  switch (tab) {
    case OrderTab.preparing:
      return (
        icon: Icons.restaurant_menu,
        title: 'No orders being prepared',
        body:
            'ASAP orders that are pending, paid, or being prepared will appear here.',
      );
    case OrderTab.ready:
      return (
        icon: Icons.inventory_2_outlined,
        title: 'No orders ready',
        body:
            'ASAP orders marked as ready for pickup or delivery will appear here.',
      );
    case OrderTab.upcoming:
      return (
        icon: Icons.event_outlined,
        title: 'No upcoming orders',
        body:
            'Bulk and scheduled orders that are not yet completed will appear here.',
      );
    case OrderTab.history:
      return (
        icon: Icons.history,
        title: 'No orders for this period',
        body:
            'Completed and cancelled orders for the selected date range will appear here.',
      );
  }
}
