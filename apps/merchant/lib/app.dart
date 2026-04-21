import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'config/routes.dart';
import 'config/theme.dart';
import 'core/providers/supabase_provider.dart';
import 'core/widgets/admin_shell.dart';
import 'features/auth/presentation/screens/admin_sign_in_screen.dart';
import 'features/auth/providers/admin_auth_providers.dart';
import 'features/analytics/presentation/screens/analytics_screen.dart';
import 'features/menu/presentation/screens/category_form_screen.dart';
import 'features/menu/presentation/screens/menu_item_form_screen.dart';
import 'features/menu/presentation/screens/menu_management_screen.dart';
import 'features/menu/presentation/screens/modifier_management_screen.dart';
import 'features/menu/providers/menu_providers.dart';
import 'features/notifications/providers/notification_providers.dart';
import 'features/orders/presentation/screens/admin_orders_screen.dart';
import 'features/orders/presentation/screens/admin_order_detail_screen.dart';
import 'features/orders/providers/admin_order_providers.dart';
import 'features/promos/presentation/screens/placeholder_more_screen.dart';
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
      final isAdmin = ref.read(isAdminProvider);
      final location = state.matchedLocation;

      // Allow signin route always
      if (location == AppRoutes.signin) {
        // If already admin, go to orders
        if (user != null && isAdmin) return AppRoutes.orders;
        return null;
      }

      // UX-only guard: redirect non-authenticated or non-admin to signin.
      // Real authorization is enforced at:
      // 1. API route level: getAuthenticatedUser + admin role check
      // 2. RLS level: app_metadata.role = 'admin' policies
      if (user == null || !isAdmin) {
        return AppRoutes.signin;
      }

      return null;
    },
    routes: [
      // Sign-in (outside shell)
      GoRoute(
        path: AppRoutes.signin,
        builder: (context, state) => const AdminSignInScreen(),
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
          // Branch 2: Analytics
          StatefulShellBranch(
            navigatorKey: _analyticsNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.analytics,
                builder: (context, state) => const AnalyticsScreen(),
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

    // Only navigate if user is authenticated admin
    final user = ref.read(currentUserProvider);
    final isAdmin = ref.read(isAdminProvider);
    if (user == null || !isAdmin) return;

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
      final user = ref.read(currentUserProvider);
      final isAdmin = ref.read(isAdminProvider);
      if (user != null && isAdmin) {
        ref.read(fcmRepositoryProvider).registerToken();
        ref.read(fcmRepositoryProvider).setupTokenRefresh();
      } else {
        ref.read(fcmRepositoryProvider).deleteToken();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
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
        return _NotificationHandler(child: child ?? const SizedBox.shrink());
      },
    );
  }
}
