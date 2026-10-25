import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';

/// A compact semantic status chip used by order lists, detail screens, and
/// kitchen tickets.
class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.status,
    this.label,
    this.dense = false,
    this.icon,
  });

  final String status;
  final String? label;
  final bool dense;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final tone = AppStatusColors.of(status);
    final theme = Theme.of(context);
    final textStyle =
        (dense ? theme.textTheme.labelSmall : theme.textTheme.labelMedium)
            ?.copyWith(
              color: tone.foreground,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            );

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 8 : 10,
        vertical: dense ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: dense ? 11 : 13, color: tone.foreground),
            const SizedBox(width: 4),
          ],
          Text(label ?? AppStatusColors.labelOf(status), style: textStyle),
        ],
      ),
    );
  }
}
