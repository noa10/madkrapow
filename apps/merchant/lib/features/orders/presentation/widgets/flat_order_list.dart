import 'package:flutter/material.dart';

import '../../../../generated/tables/orders.dart';
import 'order_list_tile.dart';

/// Renders orders in a flat sliver list without date grouping headers.
class FlatOrderList extends StatelessWidget {
  const FlatOrderList({
    super.key,
    required this.orders,
  });

  final List<OrdersRow> orders;

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return const SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Text('No orders found'),
        ),
      );
    }

    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, index) => OrderListTile(order: orders[index]),
        childCount: orders.length,
      ),
    );
  }
}
