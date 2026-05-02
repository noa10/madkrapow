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
  int _navIndexToBranchIndex(StaffRole? role, int navIndex) {
    switch (role) {
      case StaffRole.admin:
      case StaffRole.manager:
        // 4 tabs: Orders(0), Menu(1), Analytics/Staff(2), More(3)
        return navIndex;
      case StaffRole.cashier:
      case StaffRole.kitchen:
      case null:
        // 2 tabs: Orders(0), More(1) -> branch 0 and branch 3
        return [0, 3][navIndex];
    }
  }

  /// Maps the current branch index to the nav bar index.
  int _branchIndexToNavIndex(StaffRole? role, int branchIndex) {
    switch (role) {
      case StaffRole.admin:
      case StaffRole.manager:
        return branchIndex;
      case StaffRole.cashier:
      case StaffRole.kitchen:
      case null:
        if (branchIndex == 0) return 0;
        if (branchIndex == 3) return 1;
        return 0;
    }
  }
}
