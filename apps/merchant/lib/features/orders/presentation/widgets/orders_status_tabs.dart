import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

/// Pill-style status tabs matching the web admin order list.
///
/// Wraps an existing [TabController] so swiping the page and tapping a pill
/// stay in sync without changing the order-loading behavior. The four tabs
/// split the bar evenly so the whole width reads as one tab bar on both phone
/// and tablet.
class OrdersStatusTabs extends StatelessWidget {
  const OrdersStatusTabs({
    super.key,
    required this.controller,
    required this.labels,
  });

  final TabController controller;
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return SizedBox(
          height: 54,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var index = 0; index < labels.length; index++) ...[
                  if (index > 0) const SizedBox(width: 8),
                  Expanded(
                    child: _StatusTab(
                      label: labels[index],
                      selected: controller.index == index,
                      onTap: () => controller.animateTo(index),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _StatusTab extends StatelessWidget {
  const _StatusTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.accent : AppColors.surface,
        borderRadius: AppRadii.smRadius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          // Fills the column the tab was given, so the tap target is the whole
          // pill rather than just the label.
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
            child: Center(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.onAccent : AppColors.muted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
