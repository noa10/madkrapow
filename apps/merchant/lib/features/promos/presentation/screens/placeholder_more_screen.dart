import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../../config/routes.dart';
import '../../../auth/providers/admin_auth_providers.dart';

/// Screen for the More tab.
/// Contains promotions, staff management, settings, and sign-out.
class PlaceholderMoreScreen extends ConsumerStatefulWidget {
  const PlaceholderMoreScreen({super.key});

  @override
  ConsumerState<PlaceholderMoreScreen> createState() =>
      _PlaceholderMoreScreenState();
}

class _PlaceholderMoreScreenState extends ConsumerState<PlaceholderMoreScreen> {
  bool _isSigningOut = false;

  Future<void> _handleSignOut() async {
    if (_isSigningOut) return;
    setState(() => _isSigningOut = true);

    try {
      await ref.read(adminSignInProvider.notifier).signOut();
      // Fallback: if GoRouter redirect hasn't navigated yet, do it explicitly.
      // context.go to the same location is a no-op if already there.
      if (mounted) context.go(AppRoutes.signin);
    } catch (_) {
      // signOut triggers GoRouter redirect which may dispose this widget;
      // any "ref after dispose" errors are safe to ignore here.
      if (mounted) context.go(AppRoutes.signin);
    } finally {
      if (mounted) setState(() => _isSigningOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canManageStaff = ref.watch(canManageStaffProvider);
    final isAdmin = ref.watch(isAdminProvider);

    return ListView(
      children: [
        const SizedBox(height: 32),
        const Center(
          child: Column(
            children: [
              Icon(Icons.settings, size: 48, color: AppColors.muted),
              SizedBox(height: 8),
              Text(
                'More',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
        // Kitchen Display
        ListTile(
          leading: const Icon(Icons.kitchen, color: AppColors.herbText),
          title: const Text('Kitchen Display'),
          subtitle: const Text('View and manage kitchen orders'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(AppRoutes.kitchen),
        ),
        const Divider(),
        // Promotions
        ListTile(
          leading: const Icon(
            Icons.local_offer_outlined,
            color: AppColors.emberText,
          ),
          title: const Text('Promotions'),
          subtitle: const Text('Manage promo codes and discounts'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go(AppRoutes.promoList),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.bar_chart, color: AppColors.info),
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
            leading: const Icon(
              Icons.settings_outlined,
              color: AppColors.accent,
            ),
            title: const Text('Settings'),
            subtitle: const Text('HubboPOS integration and store config'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.settings),
          ),
          const Divider(),
        ],
        ListTile(
          leading: _isSigningOut
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.logout),
          title: const Text('Sign Out'),
          onTap: _isSigningOut ? null : _handleSignOut,
        ),
        const SizedBox(height: 24),
        Center(
          child: FutureBuilder<PackageInfo>(
            future: PackageInfo.fromPlatform(),
            builder: (ctx, snap) {
              if (!snap.hasData) return const SizedBox.shrink();
              return Text(
                'v${snap.data!.version}',
                style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                  color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}
