import 'package:flutter/material.dart';

/// Placeholder screen for the Analytics tab.
/// Replaced with the real analytics dashboard in Phase 2.
class PlaceholderAnalyticsScreen extends StatelessWidget {
  const PlaceholderAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.bar_chart, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text(
            'Analytics',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8),
          Text('Coming soon'),
        ],
      ),
    );
  }
}
