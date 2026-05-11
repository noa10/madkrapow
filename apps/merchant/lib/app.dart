import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'config/routes.dart';
import 'config/theme.dart';
import 'core/constants/roles.dart';
import 'core/providers/supabase_provider.dart';
import 'core/services/update/app_updates_panel.dart';
import 'core/services/update/update_lifecycle_observer.dart';
import 'core/services/update/whats_new_screen.dart';
import 'core/widgets/admin_shell.dart';
import 'features/auth/presentation/screens/admin_sign_in_screen.dart';
import 'features/auth/providers/admin_auth_providers.dart';
import 'features/analytics/presentation/screens/analytics_screen.dart';
import 'features/employees/presentation/screens/employee_list_screen.dart';
import 'features/employees/presentation/screens/employee_form_screen.dart';
import 'features/employees/providers/employee_providers.dart';
import 'features/menu/presentation/screens/category_form_screen.dart';
import 'features/menu/presentation/screens/menu_item_form_screen.dart';
import 'features/menu/presentation/screens/menu_management_screen.dart';
import 'features/menu/presentation/screens/modifier_management_screen.dart';
import 'features/menu/providers/menu_providers.dart';
import 'features/notifications/providers/notification_providers.dart';
import 'features/orders/presentation/screens/admin_orders_screen.dart';
import 'features/orders/presentation/screens/admin_order_detail_screen.dart';
import 'features/orders/presentation/screens/kitchen_display_screen.dart';
import 'features/orders/providers/admin_order_providers.dart';
import 'features/analytics/presentation/screens/sales_reports_screen.dart';
import 'features/promos/presentation/screens/placeholder_more_screen.dart';
import 'features/promos/presentation/screens/promo_list_screen.dart';
import 'features/promos/presentation/screens/promo_form_screen.dart';
import 'features/promos/providers/promo_providers.dart';
import 'features/settings/presentation/screens/settings_screen.dart';
import 'main.dart' show firebaseInitialized;

// Navigator keys for each branch of the shell
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _ordersNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'orders');
final _menuNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'menu');
final _analyticsNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'analytics');
final _moreNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'more');

GoRouter _createRouter(Ref ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.orders,
    refreshListenable: ref.read(authStateListenableProvider),
    redirect: (context, state) {
      final user = ref.read(currentUserProvider);
      final staffRole = ref.read(staffRoleProvider);
      final location = state.matchedLocation;

      // Allow signin route always
      if (location == AppRoutes.signin) {
        // If already authenticated with a valid role, go to orders
        if (user != null && staffRole != null) return AppRoutes.orders;
        return null;
      }

      // UX-only guard: redirect non-authenticated or unknown role to signin.
      // Real authorization is enforced at:
      // 1. API route level: getAuthenticatedUser + role check
      // 2. RLS level: app_metadata.role policies
      if (user == null || staffRole == null) {
        return AppRoutes.signin;
      }

      // Role-based route guards
      final role = staffRole;
      if (location == AppRoutes.menu && !role.canAccessMenu) {
        return AppRoutes.orders;
      }
      if (location == AppRoutes.analytics && !role.canAccessAnalytics) {
        return AppRoutes.orders;
      }
      if (location.startsWith('/more/staff') && !role.canAccessStaff) {
        return AppRoutes.orders;
      }
      if (location == AppRoutes.settings && role != StaffRole.admin) {
        return AppRoutes.orders;
      }

      return null;
    },
    routes: [
      // Sign-in (outside shell)
      GoRoute(
        path: AppRoutes.signin,
        builder: (context, state) => const AdminSignInScreen(),
      ),
      // Kitchen Display (outside shell, pushed from Orders tab)
      GoRoute(
        path: AppRoutes.kitchen,
        builder: (context, state) => const KitchenDisplayScreen(),
      ),
      // Settings (outside shell, pushed from More tab)
      GoRoute(
        path: AppRoutes.settings,
        builder: (context, state) => const SettingsScreen(),
      ),
      // Shell route with bottom navigation (4 branches)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return MerchantAppShell(navigationShell: navigationShell);
        },
        branches: [
          // Branch 0: Orders
          StatefulShellBranch(
            navigatorKey: _ordersNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.orders,
                builder: (context, state) => const AdminOrdersScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (context, state) => AdminOrderDetailScreen(
                      orderId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          // Branch 1: Menu
          StatefulShellBranch(
            navigatorKey: _menuNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.menu,
                builder: (context, state) => const MenuManagementScreen(),
                routes: [
                  GoRoute(
                    path: 'items/new',
                    builder: (context, state) => MenuItemFormScreen(
                      initialCategoryId: state.uri.queryParameters['categoryId'],
                    ),
                  ),
                  GoRoute(
                    path: 'items/:id',
                    builder: (context, state) => _MenuItemEditLoader(
                      itemId: state.pathParameters['id']!,
                    ),
                  ),
                  GoRoute(
                    path: 'categories/new',
                    builder: (context, state) => const CategoryFormScreen(),
                  ),
                  GoRoute(
                    path: 'categories/:id',
                    builder: (context, state) => _CategoryEditLoader(
                      categoryId: state.pathParameters['id']!,
                    ),
                  ),
                  GoRoute(
                    path: 'modifiers',
                    builder: (context, state) =>
                        const ModifierManagementScreen(),
                  ),
                ],
              ),
            ],
          ),
          // Branch 2: Analytics (admin only)
          StatefulShellBranch(
            navigatorKey: _analyticsNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.analytics,
                builder: (context, state) => const _RoleAwareBranch2Screen(),
              ),
            ],
          ),
          // Branch 3: More
          StatefulShellBranch(
            navigatorKey: _moreNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.more,
                builder: (context, state) => const PlaceholderMoreScreen(),
                routes: [
                  GoRoute(
                    path: 'reports',
                    builder: (context, state) => const SalesReportsScreen(),
                  ),
                  GoRoute(
                    path: 'staff',
                    builder: (context, state) => const EmployeeListScreen(),
                    routes: [
                      GoRoute(
                        path: 'new',
                        builder: (context, state) => const EmployeeFormScreen(),
                      ),
                      GoRoute(
                        path: ':id/edit',
                        builder: (context, state) => _EmployeeEditLoader(
                          employeeId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                  GoRoute(
                    path: 'promos',
                    builder: (context, state) => const PromoListScreen(),
                    routes: [
                      GoRoute(
                        path: 'new',
                        builder: (context, state) => const PromoFormScreen(),
                      ),
                      GoRoute(
                        path: ':id/edit',
                        builder: (context, state) => _PromoEditLoader(
                          promoId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

final routerProvider = Provider<GoRouter>(_createRouter);

/// Listens for FCM notification taps and navigates to the order detail.
/// Also registers/deletes FCM tokens on sign-in/sign-out.
class _NotificationHandler extends ConsumerStatefulWidget {
  const _NotificationHandler({required this.child});

  final Widget child;

  @override
  ConsumerState<_NotificationHandler> createState() =>
      _NotificationHandlerState();
}

class _NotificationHandlerState extends ConsumerState<_NotificationHandler> {
  @override
  void initState() {
    super.initState();
    _setupNotificationTap();
    _setupForegroundListener();
    _setupTokenManagement();
  }

  void _setupNotificationTap() {
    if (!firebaseInitialized) return;

    // App opened from terminated state via notification tap
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null && mounted) {
        _navigateToOrder(message);
      }
    });

    // App opened from background via notification tap
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      if (mounted) {
        _navigateToOrder(message);
      }
    });
  }

  void _navigateToOrder(RemoteMessage message) {
    final orderId = message.data['order_id'] as String?;
    if (orderId == null || orderId.isEmpty) return;

    // Validate UUID format before navigating
    final uuidRegex = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    if (!uuidRegex.hasMatch(orderId)) return;

    // Only navigate if user is authenticated with a valid staff role
    final user = ref.read(currentUserProvider);
    final staffRole = ref.read(staffRoleProvider);
    if (user == null || staffRole == null) return;

    final router = ref.read(routerProvider);
    router.go('/orders/$orderId');
  }

  void _setupForegroundListener() {
    if (!firebaseInitialized) return;

    FirebaseMessaging.onMessage.listen((message) {
      // Invalidate orders list so it refreshes with new/updated orders
      ref.invalidate(adminOrdersProvider);
    });
  }

  void _setupTokenManagement() {
    ref.listenManual(authStateProvider, (_, _) {
      if (!mounted) return;
      try {
        final user = ref.read(currentUserProvider);
        final staffRole = ref.read(staffRoleProvider);
        // Register FCM for all authenticated staff; server filters by role
        if (user != null && staffRole != null) {
          ref.read(fcmRepositoryProvider).registerToken();
          ref.read(fcmRepositoryProvider).setupTokenRefresh();
        } else {
          ref.read(fcmRepositoryProvider).deleteToken();
        }
      } catch (e) {
        // Guard: sign-out triggers GoRouter redirect which may dispose this
        // widget before the listener callback finishes using ref.
        debugPrint('NotificationHandler: token management skipped — $e');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}

/// Shows AnalyticsScreen for admin.
/// Managers no longer have a dedicated Analytics/Staff branch tab —
/// staff management was moved to the More tab, so this screen
/// redirects managers to orders.
class _RoleAwareBranch2Screen extends ConsumerWidget {
  const _RoleAwareBranch2Screen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffRole = ref.watch(staffRoleProvider);
    if (staffRole == StaffRole.admin) {
      return const AnalyticsScreen();
    }
    // For managers and other roles, redirect to orders
    // (GoRouter redirect should catch most cases before reaching here)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.go(AppRoutes.orders);
    });
    return const SizedBox.shrink();
  }
}

/// Loads an employee by ID and renders the edit form.
class _EmployeeEditLoader extends ConsumerWidget {
  const _EmployeeEditLoader({required this.employeeId});

  final String employeeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeesAsync = ref.watch(employeesProvider);
    return employeesAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Loading...')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (err, _) => Scaffold(
        appBar: AppBar(title: const Text('Error')),
        body: Center(child: Text('Failed to load employee: $err')),
      ),
      data: (employees) {
        final employee = employees.firstWhere(
          (e) => e.id == employeeId,
          orElse: () => throw Exception('Employee not found'),
        );
        return EmployeeFormScreen(employee: employee);
      },
    );
  }
}

/// Loads a menu item by ID and renders the edit form.
class _MenuItemEditLoader extends ConsumerWidget {
  const _MenuItemEditLoader({required this.itemId});

  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemAsync = ref.watch(menuItemDetailProvider(itemId));
    return itemAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Loading...')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (err, _) => Scaffold(
        appBar: AppBar(title: const Text('Error')),
        body: Center(child: Text('Failed to load item: $err')),
      ),
      data: (item) => MenuItemFormScreen(item: item),
    );
  }
}

/// Loads a category by ID and renders the edit form.
class _CategoryEditLoader extends ConsumerWidget {
  const _CategoryEditLoader({required this.categoryId});

  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoryAsync = ref.watch(categoryDetailProvider(categoryId));
    return categoryAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Loading...')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (err, _) => Scaffold(
        appBar: AppBar(title: const Text('Error')),
        body: Center(child: Text('Failed to load category: $err')),
      ),
      data: (category) => CategoryFormScreen(category: category),
    );
  }
}

/// Loads a promo by ID and renders the edit form.
class _PromoEditLoader extends ConsumerWidget {
  const _PromoEditLoader({required this.promoId});

  final String promoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final promosAsync = ref.watch(promosProvider);
    return promosAsync.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Loading...')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (err, _) => Scaffold(
        appBar: AppBar(title: const Text('Error')),
        body: Center(child: Text('Failed to load promo: $err')),
      ),
      data: (promos) {
        final promo = promos.firstWhere(
          (p) => p.id == promoId,
          orElse: () => throw Exception('Promo not found'),
        );
        return PromoFormScreen(promo: promo);
      },
    );
  }
}

class MerchantApp extends ConsumerWidget {
  const MerchantApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Mad Krapow Merchant',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      routerConfig: router,
      builder: (context, child) {
        return UpdateLifecycleObserver(
          child: UpdatePromptMount(
            child: _WhatsNewGate(
              child: _NotificationHandler(
                child: child ?? const SizedBox.shrink(),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Shows the What's-new screen once after a self-install by watching the
/// pending flag in UpdateSettingsService. Pushed via root navigator so the
/// shell route doesn't swallow it.
class _WhatsNewGate extends ConsumerStatefulWidget {
  const _WhatsNewGate({required this.child});

  final Widget child;

  @override
  ConsumerState<_WhatsNewGate> createState() => _WhatsNewGateState();
}

class _WhatsNewGateState extends ConsumerState<_WhatsNewGate> {
  bool _handled = false;

  @override
  Widget build(BuildContext context) {
    if (!_handled) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted || _handled) return;
        _handled = true;
        await maybeShowWhatsNew(context, ref);
      });
    }
    return widget.child;
  }
}
