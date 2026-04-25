import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../generated/tables/orders.dart';
import 'order_list_tile.dart';

/// Groups a list of orders by their creation date and renders them with
/// section headers. Uses slivers for efficient scrolling.
class GroupedOrderList extends StatelessWidget {
  const GroupedOrderList({
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

    final groups = _groupByDate(orders);

    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, index) {
          final group = groups[index];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _DateHeader(date: group.date),
              ...group.orders.map((order) => OrderListTile(order: order)),
            ],
          );
        },
        childCount: groups.length,
      ),
    );
  }

  List<_DateGroup> _groupByDate(List<OrdersRow> orders) {
    final map = <DateTime, List<OrdersRow>>{};

    for (final order in orders) {
      final date = DateTime(
        order.createdAt.year,
        order.createdAt.month,
        order.createdAt.day,
      );
      map.putIfAbsent(date, () => []).add(order);
    }

    // Sort dates descending (most recent first)
    final sortedDates = map.keys.toList()..sort((a, b) => b.compareTo(a));

    return sortedDates
        .map((date) => _DateGroup(
              date: date,
              orders: map[date]!,
            ))
        .toList();
  }
}

class _DateGroup {
  const _DateGroup({required this.date, required this.orders});

  final DateTime date;
  final List<OrdersRow> orders;
}

class _DateHeader extends StatelessWidget {
  const _DateHeader({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final headerDate = DateTime(date.year, date.month, date.day);

    final String label;
    if (headerDate == today) {
      label = 'Today';
    } else if (headerDate == yesterday) {
      label = 'Yesterday';
    } else {
      label = DateFormat('dd MMM yyyy').format(date);
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(
        label,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: Theme.of(context).colorScheme.primary,
            ),
      ),
    );
  }
}
