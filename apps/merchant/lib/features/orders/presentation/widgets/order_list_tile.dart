import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../generated/tables/orders.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/utils/order_code.dart';
import '../../providers/admin_order_providers.dart';

class OrderListTile extends ConsumerWidget {
  const OrderListTile({super.key, required this.order});

  final OrdersRow order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusColor = _statusColor(order.status);
    final canMarkReady = order.status == 'preparing';

    return ListTile(
      onTap: () => context.push('/orders/${order.id}'),
      title: Row(
        children: [
          Expanded(
            child: Text(
              getOrderDisplayCode(order),
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
              const SizedBox(width: 8),
              Icon(
                Icons.flatware,
                size: 16,
                color: order.includeCutlery ? Colors.green : Colors.grey,
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            _formatTime(order.createdAt),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (canMarkReady) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _markReady(context, ref),
                icon: const Icon(Icons.arrow_forward, size: 16),
                label: const Text('Mark as Ready'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ],
      ),
      isThreeLine: true,
    );
  }

  Future<void> _markReady(BuildContext context, WidgetRef ref) async {
    try {
      final repo = ref.read(merchantOrderRepositoryProvider);
      await repo.updateOrderStatus(order.id, 'ready');
      ref.invalidate(adminOrderDetailProvider(order.id));
      ref.invalidate(adminOrdersProvider(OrderTab.preparing));
      ref.invalidate(adminOrdersProvider(OrderTab.ready));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
        );
      }
    }
  }

  Color _statusColor(String status) {
    return switch (status) {
      'pending' => Colors.yellow.shade700,
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
