import 'package:flutter/material.dart';
import 'package:madkrapow_orders/order_status.dart';

const Map<OrderStatus, IconData> _stepIcons = {
  OrderStatus.pending: Icons.schedule,
  OrderStatus.paid: Icons.payment,
  OrderStatus.preparing: Icons.restaurant,
  OrderStatus.ready: Icons.done_all,
  OrderStatus.pickedUp: Icons.delivery_dining,
  OrderStatus.delivered: Icons.task_alt,
};

class StatusStepper extends StatelessWidget {
  const StatusStepper({
    super.key,
    required this.currentStatus,
    this.deliveryType = DeliveryType.delivery,
  });

  final String currentStatus;
  final DeliveryType deliveryType;

  int get _currentStepIndex {
    final parsed = parseOrderStatus(currentStatus);
    if (parsed == null) return -1;
    final steps = OrderStatusFlow.steps;
    return steps.indexOf(parsed);
  }

  @override
  Widget build(BuildContext context) {
    final currentIndex = _currentStepIndex;
    if (currentIndex < 0) {
      return Padding(
        padding: const EdgeInsets.all(8),
        child: Text(
          'Status: ${customerLabelFromWire(currentStatus, deliveryType)}',
          style: TextStyle(
            color: Theme.of(context).colorScheme.error,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    final steps = OrderStatusFlow.steps;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < steps.length; i++)
          _StepTile(
            status: steps[i],
            label: customerLabel(steps[i], deliveryType),
            icon: _stepIcons[steps[i]] ?? Icons.circle_outlined,
            isCompleted: i < currentIndex,
            isCurrent: i == currentIndex,
            isLast: i == steps.length - 1,
          ),
      ],
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({
    required this.status,
    required this.label,
    required this.icon,
    required this.isCompleted,
    required this.isCurrent,
    required this.isLast,
  });

  final OrderStatus status;
  final String label;
  final IconData icon;
  final bool isCompleted;
  final bool isCurrent;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = theme.colorScheme.primary;

    return IntrinsicHeight(
      child: Row(
        children: [
          // Step indicator column
          SizedBox(
            width: 32,
            child: Column(
              children: [
                // Icon circle
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isCompleted || isCurrent
                        ? primaryColor
                        : theme.colorScheme.surfaceContainerHighest,
                  ),
                  child: Center(
                    child: isCompleted
                        ? const Icon(Icons.check, size: 16, color: Colors.white)
                        : isCurrent
                            ? Icon(icon, size: 14, color: Colors.white)
                            : Icon(icon,
                                size: 14,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.3)),
                  ),
                ),
                // Connector line
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                      color: isCompleted
                          ? primaryColor
                          : theme.colorScheme.surfaceContainerHighest,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Step label
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(
                label,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                  color: isCompleted || isCurrent
                      ? theme.colorScheme.onSurface
                      : theme.colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
