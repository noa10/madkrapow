import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_orders/order_status.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../../../core/utils/order_code.dart';
import '../../data/order_repository.dart';
import '../widgets/customer_order_timeline.dart';
import '../widgets/driver_info_card.dart';
import '../widgets/driver_map.dart';
import '../widgets/order_item_card.dart';
import '../widgets/status_stepper.dart';

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen>
    with WidgetsBindingObserver {
  RealtimeChannel? _channel;
  Timer? _pollingTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _setupRealtime();
    _startPolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _channel?.unsubscribe();
    _pollingTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshOrder();
    }
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
      appBar: AppBar(
        title: Text(
          orderAsync.maybeWhen(
            data: (d) => getOrderDisplayCode(d.order),
            orElse: () => generateOrderDisplayCode(widget.orderId),
          ),
        ),
        actions: [
          Text(
            widget.orderId,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              fontSize: 10,
            ),
          ),
          const SizedBox(width: 12),
        ],
      ),
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
                              getOrderDisplayCode(order),
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            _StatusChip(
                              status: order.status,
                              deliveryType: order.deliveryType == 'self_pickup'
                                  ? DeliveryType.selfPickup
                                  : DeliveryType.delivery,
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'System ID: ${widget.orderId}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                            fontSize: 12,
                          ),
                        ),
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

                // Bulk-order approval banner (mirrors web /order/[id]).
                if (order.orderKind == 'bulk')
                  _BulkApprovalBanner(approvalStatus: order.approvalStatus),

                // Dispatch trouble banner — read-only on customer side.
                if (details.shipment != null)
                  _DispatchBanner(dispatchStatus: details.shipment!.dispatchStatus),

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
                if (order.deliveryType == 'delivery')
                  DriverInfoCard(
                    driverName: details.shipment?.driverName,
                    driverPhone: details.shipment?.driverPhone,
                    driverPlate: details.shipment?.driverPlate,
                    driverPhotoUrl: details.shipment?.driverPhotoUrl,
                    driverLocationUpdatedAt:
                        details.shipment?.driverLocationUpdatedAt,
                    shareLink: details.shipment?.shareLink,
                    lalamoveOrderId: order.lalamoveOrderId,
                  ),
                if (details.shipment?.driverLatitude != null &&
                    details.shipment?.driverLongitude != null &&
                    order.deliveryAddressJson != null &&
                    order.deliveryAddressJson!['latitude'] != null &&
                    order.deliveryAddressJson!['longitude'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: DriverMap(
                      driverLatitude: details.shipment!.driverLatitude,
                      driverLongitude: details.shipment!.driverLongitude,
                      destinationLatitude:
                          (order.deliveryAddressJson!['latitude'] as num)
                              .toDouble(),
                      destinationLongitude:
                          (order.deliveryAddressJson!['longitude'] as num)
                              .toDouble(),
                    ),
                  ),

                // Customer-facing timeline (mirrors merchant timeline copy)
                if (details.events.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: CustomerOrderTimeline(
                      events: details.events,
                      deliveryType: order.deliveryType == 'self_pickup'
                          ? DeliveryType.selfPickup
                          : DeliveryType.delivery,
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
                        ...details.items.map((item) => OrderItemCard(
                              itemWithModifiers: item,
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

  String _formatDate(dynamic date) {
    if (date == null) return '';
    final dt = date is DateTime ? date : DateTime.tryParse(date.toString());
    if (dt == null) return date.toString();
    return '${dt.day}/${dt.month}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status, this.deliveryType = DeliveryType.delivery});
  final String status;
  final DeliveryType deliveryType;

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

  Color get _statusColor {
    switch (colorRoleFromWire(status)) {
      case OrderStatusColorRole.primary:
        return Colors.orange;
      case OrderStatusColorRole.success:
        return Colors.green;
      case OrderStatusColorRole.info:
        return Colors.blue;
      case OrderStatusColorRole.warning:
        return Colors.amber.shade700;
      case OrderStatusColorRole.danger:
        return Colors.red;
      case OrderStatusColorRole.neutral:
        return Colors.grey;
    }
  }

  String get _statusLabel => customerLabelFromWire(status, deliveryType);
}

class _DispatchBanner extends StatelessWidget {
  const _DispatchBanner({required this.dispatchStatus});
  final String dispatchStatus;

  @override
  Widget build(BuildContext context) {
    final copy = dispatchBanner(dispatchStatus);
    if (copy == null || copy.severity == 'info') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        color: Theme.of(context).colorScheme.errorContainer.withValues(alpha: 0.4),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline,
                  color: Theme.of(context).colorScheme.error),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(copy.title,
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(copy.customerBody),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BulkApprovalBanner extends StatelessWidget {
  const _BulkApprovalBanner({required this.approvalStatus});
  final String approvalStatus;

  @override
  Widget build(BuildContext context) {
    String? title;
    String? body;
    Color color = Theme.of(context).colorScheme.primary;
    switch (approvalStatus) {
      case 'pending_review':
        title = 'Your bulk order is being reviewed';
        body = 'Our team will respond within 24 hours.';
        color = Colors.amber.shade700;
        break;
      case 'approved':
        title = 'Your bulk order has been approved';
        body = 'Please complete payment to confirm your order.';
        color = Colors.green;
        break;
      case 'rejected':
        title = 'Your bulk order was not approved';
        body = 'Reach out to our team for next steps.';
        color = Theme.of(context).colorScheme.error;
        break;
      default:
        return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        color: color.withValues(alpha: 0.12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700, color: color)),
              const SizedBox(height: 4),
              Text(body),
            ],
          ),
        ),
      ),
    );
  }
}
