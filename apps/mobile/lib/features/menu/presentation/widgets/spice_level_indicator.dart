import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../data/menu_item_visuals.dart';

/// Three flame glyphs matching the web's spice meter.
///
/// Level 0 renders nothing, just like the storefront.
class SpiceLevelIndicator extends StatelessWidget {
  const SpiceLevelIndicator({super.key, required this.level, this.size = 12});

  final int level;
  final double size;

  @override
  Widget build(BuildContext context) {
    final clamped = level.clamp(0, 3).toInt();
    if (clamped == 0) return const SizedBox.shrink();

    return Semantics(
      image: true,
      label: 'Spice level $clamped of 3 — ${menuSpiceLevelLabel(clamped)}',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var index = 0; index < 3; index++)
            Padding(
              padding: EdgeInsets.only(right: index == 2 ? 0 : 2),
              child: Icon(
                Icons.local_fire_department,
                size: size,
                color: index < clamped
                    ? AppColors.ember
                    : AppColors.foreground.withValues(alpha: 0.15),
              ),
            ),
        ],
      ),
    );
  }
}
