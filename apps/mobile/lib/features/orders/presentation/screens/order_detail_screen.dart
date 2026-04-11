import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../data/order_repository.dart';
import '../widgets/status_stepper.dart';

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  RealtimeChannel? _channel;
  Timer? _pollingTimer;

  @override
  void initState() {
    super.initState();
    _setupRealtime();
    _startPolling();
  }

  @override
  void dispose() {
    _channel?.unsubscribe();
    _pollingTimer?.cancel();
    super.dispose();
  }

  void _setupRealtime() {
    final repo = ref.read(orderRepositoryProvider);
    _channel = repo.subscribeToOrder(
      widget.orderId,
      onUpdate: _refreshOrder,
    );
  }

  void _startPolling() {
    // 5-second polling fallback — mirrors web's setInterval
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _refreshOrder();
    });
  }

  void _refreshOrder() {
    ref.invalidate(orderDetailProvider(widget.orderId));
  }

  @override
  Widget build(BuildContext context) {
    final orderAsync = ref.watch(orderDetailProvider(widget.orderId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Order Details')),
      body: orderAsync.when(
        data: (details) {
          final order = details.order;
          final isTerminal = order.status == 'delivered' ||
              order.status == 'cancelled';

          // Stop polling when order is terminal
          if (isTerminal && _pollingTimer != null) {
            _pollingTimer!.cancel();
            _pollingTimer = null;
          }

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(orderDetailProvider(widget.orderId));
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Order number & status
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Order #${order.orderNumber}',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            _StatusChip(status: order.status),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _formatDate(order.createdAt),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Status stepper
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: StatusStepper(currentStatus: order.status),
                  ),
                ),
                const SizedBox(height: 16),

                // Delivery type
                Card(
                  child: ListTile(
                    leading: Icon(
                      order.deliveryType == 'delivery'
                          ? Icons.delivery_dining
                          : Icons.store,
                    ),
                    title: Text(
                      order.deliveryType == 'delivery'
                          ? 'Delivery'
                          : 'Self Pickup',
                    ),
                    subtitle: order.fulfillmentType == 'scheduled' &&
                            order.scheduledFor != null
                        ? Text('Scheduled: ${_formatDate(order.scheduledFor)}')
                        : const Text('ASAP'),
                  ),
                ),
                const SizedBox(height: 16),

                // Driver info
                if (details.shipment?.driverName != null)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Driver',
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (details.shipment!.driverName != null)
                            _infoRow(Icons.person, details.shipment!.driverName!),
                          if (details.shipment!.driverPhone != null)
                            _infoRow(Icons.phone, details.shipment!.driverPhone!),
                          if (details.shipment!.driverPlate != null)
                            _infoRow(Icons.directions_car,
                                details.shipment!.driverPlate!),
                        ],
                      ),
                    ),
                  ),

                // Order items
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Items',
                          style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        const SizedBox(height: 8),
                        ...details.items.map((item) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${item.quantity}x ${item.menuItemName}',
                                    ),
                                  ),
                                  Text(
                                    formatPrice(item.lineTotalCents),
                                  ),
                                ],
                              ),
                            )),
                        const Divider(height: 16),
                        Row(
                          children: [
                            const Expanded(
                              child: Text('Total',
                                  style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                            Text(
                              formatPrice(order.totalCents),
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: theme.colorScheme.primary,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Error: $err')),
      ),
    );
  }

  Widget _infoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
          const SizedBox(width: 8),
          Text(text),
        ],
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

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        _statusLabel,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }

  Color get _statusColor => switch (status) {
        'paid' => Colors.blue,
        'accepted' => Colors.indigo,
        'preparing' => Colors.orange,
        'ready' => Colors.teal,
        'picked_up' => Colors.purple,
        'delivered' => Colors.green,
        'cancelled' => Colors.red,
        _ => Colors.grey,
      };

  String get _statusLabel => switch (status) {
        'paid' => 'Paid',
        'accepted' => 'Accepted',
        'preparing' => 'Preparing',
        'ready' => 'Ready',
        'picked_up' => 'On the way',
        'delivered' => 'Delivered',
        'cancelled' => 'Cancelled',
        _ => status,
      };
}
