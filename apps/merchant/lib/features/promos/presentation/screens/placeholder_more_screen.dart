import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/providers/admin_auth_providers.dart';

/// Placeholder screen for the More tab.
/// Will contain settings, sign-out, and future features.
class PlaceholderMoreScreen extends ConsumerWidget {
  const PlaceholderMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      children: [
        const SizedBox(height: 32),
        const Center(
          child: Column(
            children: [
              Icon(Icons.settings, size: 48, color: Colors.grey),
              SizedBox(height: 8),
              Text('More', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
        const SizedBox(height: 32),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign Out'),
          onTap: () {
            ref.read(adminSignInProvider.notifier).signOut();
          },
        ),
      ],
    );
  }
}
