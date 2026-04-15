import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/providers/admin_auth_providers.dart';

/// Shell widget for the merchant app's main navigation.
/// Currently a simple scaffold — no bottom nav bar needed
/// since the merchant app is order-focused (single screen + detail).
class AdminShell extends ConsumerWidget {
  const AdminShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mad Krapow Merchant'),
        actions: [
          // Sign-out button in app bar
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign Out',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Hold to sign out')),
              );
            },
            onLongPress: () {
              ref.read(adminSignInProvider.notifier).signOut();
            },
          ),
        ],
      ),
      body: child,
    );
  }
}
