import 'package:flutter/material.dart';
import 'package:madkrapow_orders/order_status.dart';

import '../../../../generated/tables/order_events.dart';

/// Minimal customer-facing order timeline. Renders only `status_changed`
/// events with the customer-facing label so the timeline mirrors what the
/// merchant sees without exposing internal event types.
class CustomerOrderTimeline extends StatelessWidget {
  const CustomerOrderTimeline({
    super.key,
    required this.events,
    required this.deliveryType,
  });

  final List<OrderEventsRow> events;
  final DeliveryType deliveryType;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusEvents = events
        .where((e) => e.eventType == 'status_changed')
        .toList(growable: false);
    if (statusEvents.isEmpty) {
      return const SizedBox.shrink();
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Timeline',
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            for (final e in statusEvents)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.fiber_manual_record,
                        size: 10, color: theme.colorScheme.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _labelFor(e),
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                    Text(
                      _formatTime(e.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.6),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _labelFor(OrderEventsRow event) {
    final dynamic newValue = event.newValue;
    String? newStatus;
    if (newValue is Map) {
      final dynamic v = newValue['status'];
      if (v is String) newStatus = v;
    }
    if (newStatus == null) return 'Status updated';
    return customerLabelFromWire(newStatus, deliveryType);
  }

  String _formatTime(DateTime? createdAt) {
    if (createdAt == null) return '';
    final h = createdAt.hour.toString().padLeft(2, '0');
    final m = createdAt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}
