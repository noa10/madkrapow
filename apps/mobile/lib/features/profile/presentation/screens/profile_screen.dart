import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../../../core/widgets/async_value_widget.dart';
import '../../../auth/providers/auth_providers.dart';
import '../../data/profile_repository.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: AsyncValueWidget(
        value: profileAsync,
        data: (profile) {
          final customer = profile.customer;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Profile header
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      CircleAvatar(
                        radius: 40,
                        backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                        child: Icon(
                          Icons.person,
                          size: 40,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        customer.name ?? 'No name set',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        customer.phone ?? 'No phone set',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Saved addresses
              Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.location_on_outlined),
                      title: const Text('Saved Addresses'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go(AppRoutes.addresses),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Order history
              Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.receipt_long_outlined),
                      title: const Text('My Orders'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.go(AppRoutes.orders),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Sign out
              OutlinedButton.icon(
                onPressed: () async {
                  await ref.read(authRepositoryProvider).signOut();
                  if (context.mounted) context.go(AppRoutes.signIn);
                },
                icon: const Icon(Icons.logout),
                label: const Text('Sign Out'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: theme.colorScheme.error,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
