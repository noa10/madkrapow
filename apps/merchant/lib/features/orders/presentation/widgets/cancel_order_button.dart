import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/admin_order_providers.dart';
import '../../../../features/auth/providers/admin_auth_providers.dart';
import '../../../../core/constants/roles.dart';

/// Cancel order button placed at the bottom of the order detail screen.
/// Only visible to cashier/admin/manager for orders in cancellable statuses.
class CancelOrderButton extends ConsumerWidget {
  const CancelOrderButton({super.key, required this.orderId, required this.currentStatus});

  final String orderId;
  final String currentStatus;

  static const _cancelableStatuses = {'pending', 'paid', 'accepted', 'preparing', 'ready'};

  bool _canCancel(StaffRole? role) {
    if (!_cancelableStatuses.contains(currentStatus)) return false;
    switch (role) {
      case StaffRole.kitchen:
        return false;
      case StaffRole.cashier:
      case StaffRole.admin:
      case StaffRole.manager:
      case null:
        return true;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffRole = ref.watch(staffRoleProvider);
    if (!_canCancel(staffRole)) return const SizedBox.shrink();

    return SizedBox(
      width: double.infinity,
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
          padding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
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
