import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/admin_order_providers.dart';

/// Button to advance an order to its next valid status.
/// Server-side VALID_TRANSITIONS enforced by the API route.
class AdvanceStatusButton extends ConsumerWidget {
  const AdvanceStatusButton({super.key, required this.orderId, required this.currentStatus});

  final String orderId;
  final String currentStatus;

  static const _nextStatus = {
    'paid': 'accepted',
    'accepted': 'preparing',
    'preparing': 'ready',
    'ready': 'picked_up',
    'picked_up': 'delivered',
  };

  static const _cancelableStatuses = {'paid', 'accepted', 'preparing'};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nextStatus = _nextStatus[currentStatus];
    final canCancel = _cancelableStatuses.contains(currentStatus);
    final isTerminal = nextStatus == null;

    return Row(
      children: [
        // Advance button
        if (!isTerminal)
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _advanceStatus(context, ref, nextStatus),
              icon: const Icon(Icons.arrow_forward),
              label: Text('Mark ${_label(nextStatus)}'),
            ),
          ),
        if (!isTerminal && canCancel) const SizedBox(width: 8),

        // Cancel button
        if (canCancel)
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _cancelOrder(context, ref),
              icon: Icon(
                Icons.cancel_outlined,
                color: Theme.of(context).colorScheme.error,
              ),
              label: Text(
                'Cancel Order',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ),

        // Terminal state indicator
        if (isTerminal && currentStatus == 'delivered')
          const Expanded(
            child: Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.task_alt, color: Colors.green),
                  SizedBox(width: 8),
                  Text('Order Complete', style: TextStyle(color: Colors.green)),
                ],
              ),
            ),
          ),

        // Cancelled terminal state indicator
        if (isTerminal && currentStatus == 'cancelled')
          Expanded(
            child: Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.cancel, color: Theme.of(context).colorScheme.error),
                  const SizedBox(width: 8),
                  Text(
                    'Order Cancelled',
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  String _label(String status) {
    return switch (status) {
      'accepted' => 'Accepted',
      'preparing' => 'Preparing',
      'ready' => 'Ready',
      'picked_up' => 'Picked Up',
      'delivered' => 'Delivered',
      _ => status,
    };
  }

  Future<void> _advanceStatus(
    BuildContext context,
    WidgetRef ref,
    String nextStatus,
  ) async {
    try {
      final repo = ref.read(merchantOrderRepositoryProvider);
      await repo.updateOrderStatus(orderId, nextStatus);
      ref.invalidate(adminOrderDetailProvider(orderId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _cancelOrder(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Order?'),
        content: const Text('This action cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final repo = ref.read(merchantOrderRepositoryProvider);
      await repo.cancelOrder(orderId);
      ref.invalidate(adminOrderDetailProvider(orderId));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
        );
      }
    }
  }
}
