import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../generated/tables/orders.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/utils/order_code.dart';
import '../../providers/admin_order_providers.dart';
import 'provider_badges.dart';

class OrderListTile extends ConsumerWidget {
  const OrderListTile({super.key, required this.order});

  final OrdersRow order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
          StatusPill(status: order.status, dense: true),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Text(order.customerName ?? 'Unknown customer'),
          const SizedBox(height: 6),
          ProviderBadges(
            data: ProviderBadgeData(
              status: order.status,
              deliveryType: order.deliveryType,
              stripePaymentIntentId: order.stripePaymentIntentId,
              stripeSessionId: order.stripeSessionId,
              lalamoveOrderId: order.lalamoveOrderId,
              lalamoveQuoteId: order.lalamoveQuoteId,
              driverName: order.driverName,
              driverPhone: order.driverPhone,
            ),
            dense: true,
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                formatPrice(order.totalCents),
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: AppColors.emberText,
                ),
              ),
              const SizedBox(width: 8),
              if (order.orderKind == 'bulk') ...[
                const Icon(Icons.groups_outlined, size: 16),
                const SizedBox(width: 4),
                const Text('Bulk', style: TextStyle(fontSize: 12)),
                const SizedBox(width: 8),
              ],
              Icon(
                Icons.flatware,
                size: 16,
                color: order.includeCutlery
                    ? AppColors.herbText
                    : AppColors.muted,
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
                  textStyle: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
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
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour;
    final m = dt.minute.toString().padLeft(2, '0');
    final ampm = h >= 12 ? 'PM' : 'AM';
    final h12 = h > 12
        ? h - 12
        : h == 0
        ? 12
        : h;
    return '${dt.day}/${dt.month} $h12:$m $ampm';
  }
}
