import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_orders/order_status.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../providers/admin_order_providers.dart';
import '../../providers/kitchen_providers.dart';
import '../../../../features/auth/providers/admin_auth_providers.dart';
import '../../../../core/constants/roles.dart';
import '../../../../core/utils/order_fields.dart';

/// Button to advance an order to its next valid status. Forward transitions
/// and role gating come from the shared `madkrapow_orders` package; the API
/// route enforces the same map server-side.
class AdvanceStatusButton extends ConsumerWidget {
  const AdvanceStatusButton({
    super.key,
    required this.orderId,
    required this.currentStatus,
    this.source,
    this.deliveryType,
  });

  final String orderId;
  final String currentStatus;

  /// Fulfilment facts. A ready counter take-away can be completed by staff;
  /// every other fulfilment completes through its own flow.
  final String? source;
  final String? deliveryType;

  StaffRoleForOrders? _mapRole(StaffRole? role) {
    switch (role) {
      case StaffRole.kitchen:
        return StaffRoleForOrders.kitchen;
      case StaffRole.cashier:
        return StaffRoleForOrders.cashier;
      case StaffRole.admin:
        return StaffRoleForOrders.admin;
      case StaffRole.manager:
        return StaffRoleForOrders.manager;
      case null:
        return null;
    }
  }

  String? _roleAwareNextStatus(StaffRole? role) {
    final current = parseOrderStatus(currentStatus);
    if (current == null) return null;
    final next = OrderStatusFlow.nextForwardForAdmin(current, _mapRole(role));
    return next?.wire;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffRole = ref.watch(staffRoleProvider);
    final nextStatus = _roleAwareNextStatus(staffRole);
    final isTerminal = nextStatus == null;
    // The shared status map has no ready → delivered step; staff close a ready
    // counter take-away explicitly because no provider will do it.
    final canCompleteCounterPickup =
        currentStatus == 'ready' &&
        isCounterPickupOrder(source: source, deliveryType: deliveryType);

    if (nextStatus == null && canCompleteCounterPickup) {
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () => _advanceStatus(context, ref, 'delivered'),
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Complete Order'),
        ),
      );
    }

    if (isTerminal) {
      if (currentStatus == 'picked_up' || currentStatus == 'delivered') {
        return const Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.task_alt, color: AppColors.herbText),
              SizedBox(width: 8),
              Text(
                'Order Complete',
                style: TextStyle(color: AppColors.herbText),
              ),
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
    final parsed = parseOrderStatus(status);
    return parsed == null ? status : adminLabel(parsed);
  }

  Future<void> _advanceStatus(
    BuildContext context,
    WidgetRef ref,
    String? nextStatus,
  ) async {
    if (nextStatus == null) return;
    try {
      final repo = ref.read(merchantOrderRepositoryProvider);
      final container = ProviderScope.containerOf(context, listen: false);
      await repo.updateOrderStatus(orderId, nextStatus);
      container.invalidate(adminOrderDetailProvider(orderId));
      container.invalidate(adminOrdersProvider);
      container.invalidate(kitchenOrderCardsProvider);
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
}
