import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/utils/order_code.dart';
import '../../../../core/widgets/async_value_widget.dart';
import '../../../cart/providers/cart_provider.dart';
import '../../../cart/data/cart_item.dart';
import '../../data/order_repository.dart';
import '../widgets/daily_date_picker.dart';
import '../widgets/order_stats_card.dart';
import '../widgets/provider_badges.dart';

class OrderHistoryScreen extends ConsumerStatefulWidget {
  const OrderHistoryScreen({super.key});

  @override
  ConsumerState<OrderHistoryScreen> createState() => _OrderHistoryScreenState();
}

class _OrderHistoryScreenState extends ConsumerState<OrderHistoryScreen> {
  Timer? _pollingTimer;
  bool _isReordering = false;

  @override
  void initState() {
    super.initState();
    _startPolling();
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    // 5-second polling to auto-refresh order list (status changes + new orders)
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _refreshHistory();
    });
  }

  void _refreshHistory() {
    ref.invalidate(orderHistoryProvider);
  }

  Future<void> _reorderOrder(String orderId) async {
    if (_isReordering) return;
    setState(() => _isReordering = true);

    try {
      final repo = ref.read(orderRepositoryProvider);
      final cartNotifier = ref.read(cartProvider.notifier);
      final itemsWithModifiers = await repo.fetchOrderItemsWithModifiers(
        orderId,
      );

      for (final iw in itemsWithModifiers) {
        final item = iw.item;
        final modifiers = iw.modifiers
            .map(
              (m) => SelectedModifier(
                id: m.modifierId,
                name: m.modifierName,
                priceDeltaCents: m.modifierPriceDeltaCents,
              ),
            )
            .toList();

        cartNotifier.addItem(
          CartItem(
            menuItemId: item.menuItemId,
            unitPrice: item.menuItemPriceCents,
            quantity: item.quantity,
            selectedModifiers: modifiers,
            specialInstructions: item.notes ?? '',
            name: item.menuItemName,
            imageUrl: item.imageUrl,
          ),
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Added ${itemsWithModifiers.length} items to cart'),
            action: SnackBarAction(
              label: 'View Cart',
              onPressed: () => context.push('/cart'),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to reorder: \$e')));
      }
    } finally {
      if (mounted) setState(() => _isReordering = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(orderHistoryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Food Orders')),
      body: RefreshIndicator(
        onRefresh: () async {
          _refreshHistory();
        },
        child: AsyncValueWidget(
          value: ordersAsync,
          data: (orders) => CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(child: DailyDatePicker()),
              const SliverToBoxAdapter(child: OrderStatsCard()),
              const SliverToBoxAdapter(child: SizedBox(height: 8)),
              if (orders.isEmpty)
                SliverFillRemaining(child: _EmptyOrdersState())
              else
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList.builder(
                    itemCount: orders.length,
                    itemBuilder: (context, index) => _OrderCard(
                      orderWithCount: orders[index],
                      onReorder: () => _reorderOrder(orders[index].order.id),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.orderWithCount, required this.onReorder});
  final OrderWithItemCount orderWithCount;
  final VoidCallback onReorder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final order = orderWithCount.order;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => context.push('/orders/${order.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    getOrderDisplayCode(order),
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  _StatusBadge(status: order.status),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    order.deliveryType == 'delivery'
                        ? Icons.delivery_dining
                        : Icons.store,
                    size: 14,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    order.deliveryType == 'delivery'
                        ? 'Delivery'
                        : 'Self Pickup',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${orderWithCount.itemCount} ${orderWithCount.itemCount == 1 ? 'item' : 'items'}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
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
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _formatDate(order.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                  Text(
                    formatPrice(order.totalCents),
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.emberText,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onReorder,
                  icon: const Icon(Icons.replay, size: 16),
                  label: const Text('Reorder'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.primary,
                    side: BorderSide(
                      color: theme.colorScheme.primary.withValues(alpha: 0.3),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    textStyle: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(dynamic date) {
    if (date == null) return '';
    final dt = date is DateTime ? date : DateTime.tryParse(date.toString());
    if (dt == null) return date.toString();
    return '${dt.day}/${dt.month}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

class _EmptyOrdersState extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dateFilter = ref.watch(orderDateFilterProvider);
    final isToday = dateFilter.displayLabel == 'Today';

    return AppEmptyState(
      icon: Icons.receipt_long_outlined,
      title: isToday ? 'No food orders yet' : 'No food orders on this day',
      message: isToday
          ? 'Place your first order to see it here'
          : 'Try selecting a different date',
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    return StatusPill(
      status: status,
      label: status == 'picked_up' ? 'On the way' : null,
      dense: true,
    );
  }
}
