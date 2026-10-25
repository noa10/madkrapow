import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_theme_extension.dart';

/// The branded gradient CTA. Crimson is the primary action colour; this deeper
/// gradient is reserved for high-emphasis calls (checkout, reorder).
class GradientCta extends StatelessWidget {
  const GradientCta({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.expand = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final brand = BrandColors.of(context);
    final theme = Theme.of(context);
    final enabled = onPressed != null;

    final cta = Material(
      color: Colors.transparent,
      borderRadius: AppRadii.pillRadius,
      clipBehavior: Clip.antiAlias,
      child: Ink(
        decoration: BoxDecoration(
          gradient: enabled ? brand.ctaGradient : null,
          color: enabled ? null : theme.colorScheme.surfaceContainerHigh,
          borderRadius: AppRadii.pillRadius,
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: AppRadii.pillRadius,
          child: Padding(
            padding: padding,
            child: Row(
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Icon(
                    icon,
                    size: 18,
                    color: enabled
                        ? AppColors.onAccent
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                ],
                Text(
                  label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: enabled
                        ? AppColors.onAccent
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return expand ? SizedBox(width: double.infinity, child: cta) : cta;
  }
}
