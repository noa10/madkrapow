import 'package:flutter/material.dart';

/// Visual stepper showing the order status progression.
/// paid → preparing → ready → picked_up/delivered
/// Cancelled orders get a distinct red indicator instead of the stepper.
class AdminStatusStepper extends StatelessWidget {
  const AdminStatusStepper({super.key, required this.currentStatus});

  final String currentStatus;

  static const _steps = [
    ('paid', 'Paid', Icons.payment),
    ('preparing', 'Preparing', Icons.restaurant),
    ('ready', 'Ready', Icons.done_all),
    ('picked_up', 'Picked Up', Icons.person_pin),
    ('delivered', 'Delivered', Icons.task_alt),
  ];

  @override
  Widget build(BuildContext context) {
    // Cancelled orders get a distinct red indicator
    if (currentStatus == 'cancelled') {
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

    final currentIndex =
        _steps.indexWhere((s) => s.$1 == currentStatus).clamp(0, _steps.length - 1);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: List.generate(_steps.length, (i) {
          final step = _steps[i];
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
                        step.$3,
                        size: isCurrent ? 18 : 14,
                        color: color,
                      ),
                    ),
                    if (i < _steps.length - 1)
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
                  step.$2,
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
