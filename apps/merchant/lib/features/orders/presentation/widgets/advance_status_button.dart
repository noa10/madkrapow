import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/admin_order_providers.dart';
import '../../../../features/auth/providers/admin_auth_providers.dart';
import '../../../../core/constants/roles.dart';

/// Button to advance an order to its next valid status.
/// Server-side VALID_TRANSITIONS enforced by the API route.
/// The only manual forward transition supported is preparing → ready.
class AdvanceStatusButton extends ConsumerWidget {
  const AdvanceStatusButton({super.key, required this.orderId, required this.currentStatus});

  final String orderId;
  final String currentStatus;

  static const _nextStatus = {
    'preparing': 'ready',
  };

  String? _roleAwareNextStatus(StaffRole? role) {
    final next = _nextStatus[currentStatus];
    if (next == null) return null;

    switch (role) {
      case StaffRole.kitchen:
        // Kitchen can only advance to ready
        if (next == 'ready') return next;
        return null;
      case StaffRole.cashier:
      case StaffRole.admin:
      case StaffRole.manager:
      case null:
        return next;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffRole = ref.watch(staffRoleProvider);
    final nextStatus = _roleAwareNextStatus(staffRole);
    final isTerminal = nextStatus == null;

    if (isTerminal) {
      // Terminal state indicator
      if (currentStatus == 'picked_up' || currentStatus == 'delivered') {
        return const Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.task_alt, color: Colors.green),
              SizedBox(width: 8),
              Text('Order Complete', style: TextStyle(color: Colors.green)),
            ],
          ),
        );
      }
      if (currentStatus == 'cancelled') {
        return Center(
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
        );
      }
      return const SizedBox.shrink();
    }

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () => _advanceStatus(context, ref, nextStatus),
        icon: const Icon(Icons.arrow_forward),
        label: Text('Mark ${_label(nextStatus)}'),
      ),
    );
  }

  String _label(String status) {
    return switch (status) {
      'ready' => 'Ready',
      _ => status,
    };
  }

  Future<void> _advanceStatus(
    BuildContext context,
    WidgetRef ref,
    String? nextStatus,
  ) async {
    if (nextStatus == null) return;
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
}
