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
import 'features/notifications/providers/notification_providers.dart';
import 'features/orders/presentation/screens/admin_orders_screen.dart';
import 'features/orders/presentation/screens/admin_order_detail_screen.dart';
import 'features/orders/providers/admin_order_providers.dart';
import 'main.dart' show firebaseInitialized;

GoRouter _createRouter(Ref ref) {
  return GoRouter(
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
      // Shell route for authenticated screens
      ShellRoute(
        builder: (context, state, child) => AdminShell(child: child),
        routes: [
          // Orders list
          GoRoute(
            path: AppRoutes.orders,
            builder: (context, state) => const AdminOrdersScreen(),
            routes: [
              // Order detail (nested)
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
