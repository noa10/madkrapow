import 'package:flutter/material.dart';

const _orderSteps = [
  ('paid', 'Paid', Icons.payment),
  ('accepted', 'Accepted', Icons.check_circle_outline),
  ('preparing', 'Preparing', Icons.restaurant),
  ('ready', 'Ready', Icons.done_all),
  ('picked_up', 'On the way', Icons.delivery_dining),
  ('delivered', 'Delivered', Icons.task_alt),
];

class StatusStepper extends StatelessWidget {
  const StatusStepper({super.key, required this.currentStatus});

  final String currentStatus;

  int get _currentStepIndex {
    for (int i = 0; i < _orderSteps.length; i++) {
      if (_orderSteps[i].$1 == currentStatus) return i;
    }
    return -1; // Unknown/cancelled
  }

  @override
  Widget build(BuildContext context) {
    final currentIndex = _currentStepIndex;
    if (currentIndex < 0) {
      // Cancelled or unknown status
      return Padding(
        padding: const EdgeInsets.all(8),
        child: Text(
          'Status: $currentStatus',
          style: TextStyle(
            color: Theme.of(context).colorScheme.error,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < _orderSteps.length; i++)
          _StepTile(
            step: _orderSteps[i],
            isCompleted: i < currentIndex,
            isCurrent: i == currentIndex,
            isLast: i == _orderSteps.length - 1,
          ),
      ],
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({
    required this.step,
    required this.isCompleted,
    required this.isCurrent,
    required this.isLast,
  });

  final (String, String, IconData) step;
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
                            ? Icon(step.$3, size: 14, color: Colors.white)
                            : Icon(step.$3,
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
                step.$2,
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
