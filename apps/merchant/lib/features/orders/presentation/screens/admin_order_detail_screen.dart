import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/admin_order_providers.dart';
import '../../data/merchant_order_repository.dart';
import '../widgets/admin_status_stepper.dart';
import '../widgets/advance_status_button.dart';
import '../widgets/driver_info_card.dart';
import '../widgets/driver_map.dart';
import '../widgets/order_event_timeline.dart';
import '../widgets/order_item_card.dart';
import '../widgets/cancel_order_button.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/utils/order_code.dart';
import '../../../../core/widgets/async_value_widget.dart';

class AdminOrderDetailScreen extends ConsumerStatefulWidget {
  const AdminOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<AdminOrderDetailScreen> createState() =>
      _AdminOrderDetailScreenState();
}

class _AdminOrderDetailScreenState
    extends ConsumerState<AdminOrderDetailScreen> {
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _subscribeToOrder();
  }

  void _subscribeToOrder() {
    final repo = ref.read(merchantOrderRepositoryProvider);
    _channel = repo.subscribeToOrder(
      widget.orderId,
      onUpdate: () {
        if (!mounted) return;
        ref.invalidate(adminOrderDetailProvider(widget.orderId));
      },
    );
  }

  @override
  void dispose() {
    if (_channel != null) {
      _channel!.unsubscribe();
      _channel = null;
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(adminOrderDetailProvider(widget.orderId));

    return Scaffold(
      appBar: AppBar(
        title: Text(generateOrderDisplayCode(widget.orderId)),
      ),
      body: AsyncValueWidget<OrderDetail>(
        value: detailAsync,
        data: (detail) => _OrderDetailContent(detail: detail),
      ),
    );
  }
}

class _OrderDetailContent extends StatelessWidget {
  const _OrderDetailContent({required this.detail});

  final OrderDetail detail;

  @override
  Widget build(BuildContext context) {
    final order = detail.order;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Order header
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          generateOrderDisplayCode(order.id),
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        Text(
                          'System ID: ${order.id}',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Colors.grey[600],
                                fontSize: 12,
                              ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    if (order.orderKind == 'bulk')
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.purple.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          'BULK',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.purple,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('Customer: ${order.customerName ?? 'Unknown'}'),
                if (order.customerPhone != null)
                  Text('Phone: ${order.customerPhone}'),
                Text(
                  'Total: ${formatPrice(order.totalCents)}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  'Type: ${order.deliveryType == 'pickup' ? 'Pickup' : 'Delivery'}',
                ),
                if (order.notes != null)
                  Text('Notes: ${order.notes}'),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(
                      Icons.flatware,
                      size: 16,
                      color: order.includeCutlery ? Colors.green : Colors.grey,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      order.includeCutlery
                          ? 'Cutlery: Yes'
                          : 'Cutlery: No — customer requested no cutlery',
                      style: TextStyle(
                        color: order.includeCutlery ? Colors.green : Colors.grey,
                      ),
                    ),
                  ],
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Status',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(height: 8),
                AdminStatusStepper(currentStatus: order.status),
                const SizedBox(height: 12),
                AdvanceStatusButton(
                  orderId: order.id,
                  currentStatus: order.status,
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 16),

        // Driver info & map (only for delivery orders)
        if (order.deliveryType == 'delivery') ...[
          DriverInfoCard(
            driverName: detail.shipment?.driverName,
            driverPhone: detail.shipment?.driverPhone,
            driverPlate: detail.shipment?.driverPlate,
            driverPhotoUrl: detail.shipment?.driverPhotoUrl,
            driverLocationUpdatedAt: detail.shipment?.driverLocationUpdatedAt,
            shareLink: detail.shipment?.shareLink,
            lalamoveOrderId: order.lalamoveOrderId,
          ),
          if (detail.shipment?.driverLatitude != null &&
              detail.shipment?.driverLongitude != null &&
              order.deliveryAddressJson != null &&
              order.deliveryAddressJson!['latitude'] != null &&
              order.deliveryAddressJson!['longitude'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: DriverMap(
                driverLatitude: detail.shipment!.driverLatitude,
                driverLongitude: detail.shipment!.driverLongitude,
                destinationLatitude:
                    (order.deliveryAddressJson!['latitude'] as num)
                        .toDouble(),
                destinationLongitude:
                    (order.deliveryAddressJson!['longitude'] as num)
                        .toDouble(),
              ),
            ),
          const SizedBox(height: 16),
        ],

        // Order items
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Items (${detail.items.fold<int>(0, (sum, i) => sum + i.item.quantity)})',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(height: 8),
                ...detail.items.map((item) => OrderItemCard(
                      itemWithModifiers: item,
                    )),
              ],
            ),
          ),
        ),

        const SizedBox(height: 16),

        // Events timeline
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Events',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(height: 8),
                OrderEventTimeline(events: detail.events),
              ],
            ),
          ),
        ),

        const SizedBox(height: 16),

        CancelOrderButton(
          orderId: order.id,
          currentStatus: order.status,
        ),
      ],
    );
  }
}
