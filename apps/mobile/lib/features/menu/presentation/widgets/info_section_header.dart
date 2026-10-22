import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

/// Header used by the two informational home sections (How to Order and
/// How It Works), matching the web's compact eyebrow/title/subtitle stack.
class InfoSectionHeader extends StatelessWidget {
  const InfoSectionHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.subtitle,
  });

  final String eyebrow;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
            fontSize: 11,
            letterSpacing: 1.2,
            color: AppColors.emberText,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            height: 1.15,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 13,
            height: 1.55,
            color: AppColors.muted,
          ),
        ),
      ],
    );
  }
}
