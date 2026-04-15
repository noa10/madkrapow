import 'package:flutter/material.dart';

/// Status filter bar with chips for filtering orders by status.
class StatusFilterBar extends StatelessWidget {
  const StatusFilterBar({
    super.key,
    required this.selectedStatus,
    required this.onStatusSelected,
  });

  final String? selectedStatus;
  final void Function(String?) onStatusSelected;

  static const _statuses = [
    (label: 'All', value: null),
    (label: 'Paid', value: 'paid'),
    (label: 'Accepted', value: 'accepted'),
    (label: 'Preparing', value: 'preparing'),
    (label: 'Ready', value: 'ready'),
    (label: 'Picked Up', value: 'picked_up'),
    (label: 'Delivered', value: 'delivered'),
    (label: 'Cancelled', value: 'cancelled'),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _statuses.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final status = _statuses[index];
          final isSelected = selectedStatus == status.value;

          return FilterChip(
            label: Text(status.label),
            selected: isSelected,
            onSelected: (_) {
              onStatusSelected(isSelected ? null : status.value);
            },
          );
        },
      ),
    );
  }
}
