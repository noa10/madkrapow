import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../generated/tables/orders.dart';
import '../../../../core/utils/price_formatter.dart';

class OrderListTile extends StatelessWidget {
  const OrderListTile({super.key, required this.order});

  final OrdersRow order;

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(order.status);

    return ListTile(
      onTap: () => context.push('/orders/${order.id}'),
      title: Row(
        children: [
          Expanded(
            child: Text(
              '#${order.orderNumber}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              order.status.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: statusColor,
              ),
            ),
          ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Text(order.customerName ?? 'Unknown customer'),
          const SizedBox(height: 2),
          Row(
            children: [
              Text(
                formatPrice(order.totalCents),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(width: 8),
              Icon(
                order.deliveryType == 'pickup'
                    ? Icons.store_outlined
                    : Icons.delivery_dining_outlined,
                size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                order.deliveryType == 'pickup' ? 'Pickup' : 'Delivery',
                style: const TextStyle(fontSize: 12),
              ),
              if (order.orderKind == 'bulk') ...[
                const SizedBox(width: 8),
                const Icon(Icons.groups_outlined, size: 16),
                const SizedBox(width: 4),
                const Text('Bulk', style: TextStyle(fontSize: 12)),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Text(
            _formatTime(order.createdAt),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
      isThreeLine: true,
    );
  }

  Color _statusColor(String status) {
    return switch (status) {
      'paid' => Colors.orange,
      'preparing' => Colors.amber,
      'ready' => Colors.green,
      'delivering' => Colors.teal,
      'completed' => Colors.grey,
      'cancelled' => Colors.red,
      _ => Colors.grey,
    };
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour;
    final m = dt.minute.toString().padLeft(2, '0');
    final ampm = h >= 12 ? 'PM' : 'AM';
    final h12 = h > 12 ? h - 12 : h == 0 ? 12 : h;
    return '${dt.day}/${dt.month} $h12:$m $ampm';
  }
}
