import 'package:flutter/material.dart';

import '../../../../generated/tables/order_events.dart';

class OrderEventTimeline extends StatelessWidget {
  const OrderEventTimeline({super.key, required this.events});

  final List<OrderEventsRow> events;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Text('No events recorded'),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: events.map((event) {
        final eventType = event.eventType;
        final newValue = event.newValue;

        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Timeline dot
              Column(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: _eventColor(eventType),
                      shape: BoxShape.circle,
                    ),
                  ),
                  Container(
                    width: 2,
                    height: 28,
                    color: Colors.grey.shade300,
                  ),
                ],
              ),
              const SizedBox(width: 12),

              // Event content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _eventLabel(eventType),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    if (newValue != null)
                      Text(
                          _formatValue(newValue),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                    Text(
                      _formatTime(event.createdAt),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Color _eventColor(String eventType) {
    return switch (eventType) {
      'status_changed' => Colors.blue,
      'bulk_approved' => Colors.green,
      'bulk_rejected' => Colors.red,
      _ => Colors.grey,
    };
  }

  String _eventLabel(String eventType) {
    return switch (eventType) {
      'status_changed' => 'Status Changed',
      'bulk_approved' => 'Bulk Order Approved',
      'bulk_rejected' => 'Bulk Order Rejected',
      _ => eventType.replaceAll('_', ' ').toUpperCase(),
    };
  }

  String _formatValue(Map<String, dynamic> value) {
    if (value.containsKey('status')) {
      return 'Status: ${value['status']}';
    }
    if (value.containsKey('reason')) {
      return 'Reason: ${value['reason']}';
    }
    if (value.containsKey('approved_total_cents')) {
      return 'Approved total: RM ${(value['approved_total_cents'] as int) / 100}';
    }
    return value.toString();
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour;
    final m = dt.minute.toString().padLeft(2, '0');
    final ampm = h >= 12 ? 'PM' : 'AM';
    final h12 = h > 12 ? h - 12 : h == 0 ? 12 : h;
    return '${dt.day}/${dt.month} $h12:$m $ampm';
  }
}
