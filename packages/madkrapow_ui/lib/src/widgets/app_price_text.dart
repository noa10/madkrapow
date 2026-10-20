import 'package:flutter/material.dart';

import '../tokens/app_theme_extension.dart';

/// Price/metadata text. Ember is informational, so it is deliberately not the
/// crimson action colour.
class AppPriceText extends StatelessWidget {
  const AppPriceText(
    this.value, {
    super.key,
    this.fontSize,
    this.fontWeight = FontWeight.w700,
    this.color,
  });

  final String value;
  final double? fontSize;
  final FontWeight fontWeight;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      value,
      style: theme.textTheme.titleMedium?.copyWith(
        color: color ?? BrandColors.of(context).emberText,
        fontSize: fontSize,
        fontWeight: fontWeight,
      ),
    );
  }
}
