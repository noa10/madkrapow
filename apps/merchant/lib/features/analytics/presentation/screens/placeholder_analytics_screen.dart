import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

/// Placeholder screen for the Analytics tab.
/// Replaced with the real analytics dashboard in Phase 2.
class PlaceholderAnalyticsScreen extends StatelessWidget {
  const PlaceholderAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppEmptyState(
      icon: Icons.bar_chart,
      title: 'Analytics',
      message: 'Coming soon',
    );
  }
}
