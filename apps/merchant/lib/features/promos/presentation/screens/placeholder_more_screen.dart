import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../../auth/providers/admin_auth_providers.dart';

/// Screen for the More tab.
/// Contains promotions, staff management, settings, and sign-out.
class PlaceholderMoreScreen extends ConsumerWidget {
  const PlaceholderMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canManageStaff = ref.watch(canManageStaffProvider);
    final isAdmin = ref.watch(isAdminProvider);

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
        // Kitchen Display
        ListTile(
          leading: const Icon(Icons.kitchen, color: Colors.teal),
          title: const Text('Kitchen Display'),
          subtitle: const Text('View and manage kitchen orders'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(AppRoutes.kitchen),
        ),
        const Divider(),
        // Promotions
        ListTile(
          leading: const Icon(Icons.local_offer_outlined, color: Colors.orange),
          title: const Text('Promotions'),
          subtitle: const Text('Manage promo codes and discounts'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go(AppRoutes.promoList),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.bar_chart, color: Colors.blue),
          title: const Text('Sales Reports'),
          subtitle: const Text('Revenue analytics and insights'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go(AppRoutes.salesReports),
        ),
        const Divider(),
        if (canManageStaff) ...[
          ListTile(
            leading: const Icon(Icons.people_outline),
            title: const Text('Staff Management'),
            subtitle: const Text('Manage employees and roles'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go(AppRoutes.staffList),
          ),
          const Divider(),
        ],
        if (isAdmin) ...[
          ListTile(
            leading: const Icon(Icons.settings_outlined, color: Colors.purple),
            title: const Text('Settings'),
            subtitle: const Text('HubboPOS integration and store config'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.settings),
          ),
          const Divider(),
        ],
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
