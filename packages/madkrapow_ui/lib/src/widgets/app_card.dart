import 'package:flutter/material.dart';

import '../tokens/app_radii.dart';
import '../tokens/app_theme_extension.dart';

/// A flat Charcoal Slate card with a hairline border and 16px corners.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.onTap,
    this.color,
    this.borderRadius,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final BorderRadius? borderRadius;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? AppRadii.lgRadius;
    final background = color ?? Theme.of(context).colorScheme.surface;
    final border = borderColor ?? BrandColors.of(context).border;

    if (onTap == null) {
      return Container(
        padding: padding,
        decoration: BoxDecoration(
          color: background,
          borderRadius: radius,
          border: Border.all(color: border),
        ),
        child: child,
      );
    }

    return Material(
      color: background,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}
