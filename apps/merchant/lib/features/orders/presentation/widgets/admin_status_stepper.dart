import 'package:flutter/material.dart';
import 'package:madkrapow_orders/order_status.dart';

/// Visual stepper showing the order status progression.
/// pending → paid → preparing → ready → picked_up → delivered
/// Cancelled orders get a distinct red indicator instead of the stepper.
class AdminStatusStepper extends StatelessWidget {
  const AdminStatusStepper({super.key, required this.currentStatus});

  final String currentStatus;

  static const _stepIcons = <OrderStatus, IconData>{
    OrderStatus.pending: Icons.schedule,
    OrderStatus.paid: Icons.payment,
    OrderStatus.preparing: Icons.restaurant,
    OrderStatus.ready: Icons.done_all,
    OrderStatus.pickedUp: Icons.person_pin,
    OrderStatus.delivered: Icons.task_alt,
  };

  @override
  Widget build(BuildContext context) {
    final parsed = parseOrderStatus(currentStatus);
    if (parsed == OrderStatus.cancelled) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cancel, color: Theme.of(context).colorScheme.error),
            const SizedBox(width: 8),
            Text(
              'Cancelled',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ],
        ),
      );
    }

    final steps = OrderStatusFlow.adminSteps;
    final currentIndex = parsed == null
        ? 0
        : steps.indexOf(parsed).clamp(0, steps.length - 1);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: List.generate(steps.length, (i) {
          final step = steps[i];
          final icon = _stepIcons[step] ?? Icons.circle_outlined;
          final label = stepLabel(step);
          final isCompleted = i <= currentIndex;
          final isCurrent = i == currentIndex;
          final color = isCompleted
              ? (isCurrent ? Theme.of(context).colorScheme.primary : Colors.green)
              : Colors.grey;

          return Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    if (i > 0)
                      Expanded(
                        child: Container(
                          height: 2,
                          color: i <= currentIndex ? Colors.green : Colors.grey.shade300,
                        ),
                      ),
                    CircleAvatar(
                      radius: isCurrent ? 16 : 12,
                      backgroundColor: color.withValues(alpha: 0.15),
                      child: Icon(
                        icon,
                        size: isCurrent ? 18 : 14,
                        color: color,
                      ),
                    ),
                    if (i < steps.length - 1)
                      Expanded(
                        child: Container(
                          height: 2,
                          color: i < currentIndex ? Colors.green : Colors.grey.shade300,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w400,
                    color: color,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          );
        }),
      ),
    );
  }
}
