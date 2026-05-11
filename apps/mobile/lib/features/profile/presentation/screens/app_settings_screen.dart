import 'package:flutter/material.dart';

import '../../../../core/services/update/app_updates_panel.dart';

/// Customer-app settings screen. Currently houses only the in-app updater
/// panel; expand as more settings are added.
class AppSettingsScreen extends StatelessWidget {
  const AppSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          AppUpdatesPanel(),
        ],
      ),
    );
  }
}
