import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/providers/admin_auth_providers.dart';
import '../../core/constants/roles.dart';
import 'merchant_nav_bar.dart';

/// Shell widget that wraps the StatefulNavigationShell and provides
/// the persistent bottom NavigationBar for the merchant app.
class MerchantAppShell extends ConsumerWidget {
  const MerchantAppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffRole = ref.watch(staffRoleProvider);

    final navIndex = _branchIndexToNavIndex(staffRole, navigationShell.currentIndex);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: MerchantNavBar(
        currentIndex: navIndex,
        onTap: (navIndex) {
          final branchIndex = _navIndexToBranchIndex(staffRole, navIndex);
          navigationShell.goBranch(
            branchIndex,
            initialLocation: branchIndex == navigationShell.currentIndex,
          );
        },
      ),
    );
  }

  /// Maps a bottom-nav tap index to the corresponding branch index.
  ///
  /// Branch order: 0 Orders, 1 Menu, 2 Analytics, 3 More, 4 POS.
  int _navIndexToBranchIndex(StaffRole? role, int navIndex) {
    switch (role) {
      case StaffRole.admin:
        // 5 tabs: Orders, POS, Menu, Analytics, More
        return [0, 4, 1, 2, 3][navIndex];
      case StaffRole.manager:
        // 4 tabs: Orders, POS, Menu, More
        return [0, 4, 1, 3][navIndex];
      case StaffRole.cashier:
        // 3 tabs: Orders, POS, More
        return [0, 4, 3][navIndex];
      case StaffRole.kitchen:
      case null:
        // 2 tabs: Orders, More -> branch 0 and branch 3
        return [0, 3][navIndex];
    }
  }

  /// Maps the current branch index to the nav bar index.
  int _branchIndexToNavIndex(StaffRole? role, int branchIndex) {
    switch (role) {
      case StaffRole.admin:
        return const {0: 0, 4: 1, 1: 2, 2: 3, 3: 4}[branchIndex] ?? 0;
      case StaffRole.manager:
        return const {0: 0, 4: 1, 1: 2, 3: 3}[branchIndex] ?? 0;
      case StaffRole.cashier:
        return const {0: 0, 4: 1, 3: 2}[branchIndex] ?? 0;
      case StaffRole.kitchen:
      case null:
        return const {0: 0, 3: 1}[branchIndex] ?? 0;
    }
  }
}
