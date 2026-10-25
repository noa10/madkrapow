import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/utils/order_code.dart';
import '../../../../generated/tables/orders.dart';
import '../../data/orders_row_billplz.dart';
import '../../providers/admin_order_providers.dart';
import 'provider_badges.dart';

/// Rounded order card matching the web mobile admin order list.
class OrderListTile extends ConsumerWidget {
  const OrderListTile({super.key, required this.order});

  final OrdersRow order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final canMarkReady = order.status == 'preparing';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.surface.withValues(alpha: 0.72),
        shape: const RoundedRectangleBorder(
          borderRadius: AppRadii.mdRadius,
          side: BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/orders/${order.id}'),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          Flexible(
                            child: Text(
                              getOrderDisplayCode(order),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.2,
                                color: AppColors.sesame,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          StatusPill(status: order.status, dense: true),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      formatPrice(order.totalCents),
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.foreground,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  order.customerName ?? 'Guest',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.foreground,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    ProviderBadges(
                      data: ProviderBadgeData(
                        status: order.status,
                        deliveryType: order.deliveryType,
                        stripePaymentIntentId: order.stripePaymentIntentId,
                        stripeSessionId: order.stripeSessionId,
                        billplzBillId: order.billplzBillId,
                        lalamoveOrderId: order.lalamoveOrderId,
                        lalamoveQuoteId: order.lalamoveQuoteId,
                        driverName: order.driverName,
                        driverPhone: order.driverPhone,
                      ),
                      dense: true,
                    ),
                    if (order.orderKind == 'bulk')
                      const _MetaPill(
                        icon: Icons.groups_outlined,
                        label: 'Bulk',
                        color: Color(0xFFA78BFA),
                      ),
                    if (order.includeCutlery)
                      const _MetaPill(
                        icon: Icons.flatware,
                        label: 'Cutlery',
                        color: AppColors.herbText,
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(
                      Icons.schedule,
                      size: 13,
                      color: AppColors.muted,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _formatTime(order.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
                if (canMarkReady) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () => _markReady(context, ref),
                      icon: const Icon(Icons.arrow_forward, size: 18),
                      label: const Text('Mark as Ready'),
                      style: ElevatedButton.styleFrom(
                        textStyle: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
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

class _MetaPill extends StatelessWidget {
  const _MetaPill({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: AppRadii.pillRadius,
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 3),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
