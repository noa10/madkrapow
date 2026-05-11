import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'config/routes.dart';
import 'config/theme.dart';
import 'core/providers/supabase_provider.dart';
import 'core/services/update/app_updates_panel.dart';
import 'core/services/update/update_lifecycle_observer.dart';
import 'core/services/update/whats_new_screen.dart';
import 'core/widgets/app_shell.dart';
import 'features/auth/presentation/screens/auth_callback_screen.dart';
import 'features/auth/presentation/screens/auth_splash_screen.dart';
import 'features/auth/presentation/screens/email_verification_screen.dart';
import 'features/auth/presentation/screens/reset_password_screen.dart';
import 'features/auth/presentation/screens/sign_in_screen.dart';
import 'features/auth/presentation/screens/sign_up_screen.dart';
import 'features/auth/presentation/screens/update_password_screen.dart';
import 'features/auth/presentation/widgets/auth_listener.dart';
import 'features/cart/presentation/screens/cart_screen.dart';
import 'features/checkout/presentation/screens/checkout_screen.dart';
import 'features/checkout/presentation/screens/order_success_screen.dart';
import 'features/checkout/presentation/screens/stripe_checkout_screen.dart';
import 'features/menu/presentation/screens/home_screen.dart';
import 'features/orders/presentation/screens/order_detail_screen.dart';
import 'features/orders/presentation/screens/order_history_screen.dart';
import 'features/profile/presentation/screens/address_management_screen.dart';
import 'features/profile/presentation/screens/app_settings_screen.dart';
import 'features/profile/presentation/screens/contact_management_screen.dart';
import 'features/profile/presentation/screens/profile_screen.dart';
import 'features/menu/presentation/screens/item_detail_screen.dart';

/// Routes that require authentication.
const _protectedRoutes = [
  AppRoutes.checkout,
  AppRoutes.stripeCheckout,
  AppRoutes.orderSuccess,
  AppRoutes.orderDetail,
  AppRoutes.orders,
  AppRoutes.profile,
  AppRoutes.addresses,
  AppRoutes.contacts,
];

/// Routes that require both authentication AND email verification.
const _verifiedRoutes = [
  AppRoutes.checkout,
  AppRoutes.stripeCheckout,
];

bool _isProtectedRoute(String location) {
  for (final route in _protectedRoutes) {
    final routePrefix = route.replaceAll(RegExp(r'/:[^/]+'), '');
    if (location == route ||
        (location.startsWith(routePrefix) && route.contains(':'))) {
      return true;
    }
  }
  return false;
}

bool _requiresVerification(String location) {
  for (final route in _verifiedRoutes) {
    final routePrefix = route.replaceAll(RegExp(r'/:[^/]+'), '');
    if (location == route ||
        (location.startsWith(routePrefix) && route.contains(':'))) {
      return true;
    }
  }
  return false;
}

// Navigator keys for each branch of the shell
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _homeNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _ordersNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'orders');
final _cartNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'cart');
final _profileNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'profile');

GoRouter _createRouter(Ref ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.splash,
    refreshListenable: ref.read(authStateListenableProvider),
    redirect: (context, state) {
      final user = ref.read(currentUserProvider);
      final isVerified = ref.read(isEmailVerifiedProvider);
      final location = state.matchedLocation;

      // Never redirect away from splash — it handles its own navigation
      if (location == AppRoutes.splash) return null;

      // Allow update-password even when authenticated (deep link from reset email)
      if (location == AppRoutes.updatePassword) return null;

      // Allow email verification screen at all times when authenticated
      if (location == AppRoutes.emailVerification) return null;

      // Redirect to sign-in if accessing a protected route without auth
      if (_isProtectedRoute(location) && user == null) {
        return '${AppRoutes.signIn}?from=${Uri.encodeComponent(location)}';
      }

      // Redirect to email verification if accessing a verified-only route without email confirmation
      if (_requiresVerification(location) && user != null && !isVerified) {
        return '${AppRoutes.emailVerification}?redirect=${Uri.encodeComponent(location)}';
      }

      // Redirect to home if accessing auth screens while authenticated and verified
      if (user != null &&
          isVerified &&
          (location == AppRoutes.signIn ||
              location == AppRoutes.signUp ||
              location == AppRoutes.resetPassword)) {
        return AppRoutes.home;
      }

      return null;
    },
    routes: [
      // ── Routes OUTSIDE the shell (no bottom nav bar) ──

      // Splash (auth state resolution)
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const AuthSplashScreen(),
      ),
      // Auth screens
      GoRoute(
        path: AppRoutes.signIn,
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: AppRoutes.signUp,
        builder: (context, state) => const SignUpScreen(),
      ),
      GoRoute(
        path: AppRoutes.resetPassword,
        builder: (context, state) => const ResetPasswordScreen(),
      ),
      GoRoute(
        path: AppRoutes.updatePassword,
        builder: (context, state) => const UpdatePasswordScreen(),
      ),
      GoRoute(
        path: AppRoutes.authCallback,
        builder: (context, state) => const AuthCallbackScreen(),
      ),
      GoRoute(
        path: AppRoutes.emailVerification,
        builder: (context, state) => EmailVerificationScreen(
          redirectPath: state.uri.queryParameters['redirect'],
        ),
      ),
      // Checkout flow
      GoRoute(
        path: AppRoutes.checkout,
        builder: (context, state) => const CheckoutScreen(),
      ),
      GoRoute(
        path: AppRoutes.stripeCheckout,
        builder: (context, state) => StripeCheckoutScreen(
          checkoutUrl: state.uri.queryParameters['checkout_url'] ?? '',
        ),
      ),
      GoRoute(
        path: AppRoutes.orderSuccess,
        builder: (context, state) =>
            OrderSuccessScreen(orderId: state.uri.queryParameters['orderId']),
      ),
      // Legacy redirect: /order/:id -> /orders/:id
      GoRoute(
        path: '/order/:id',
        redirect: (context, state) => '/orders/${state.pathParameters['id']}',
      ),

      // App Settings (outside shell, pushed from Profile)
      GoRoute(
        path: AppRoutes.appSettings,
        builder: (context, state) => const AppSettingsScreen(),
      ),

      // ── Shell route WITH bottom nav bar ──
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppShell(navigationShell: navigationShell);
        },
        branches: [
          // Branch 0: Home
          StatefulShellBranch(
            navigatorKey: _homeNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.home,
                builder: (context, state) => const HomeScreen(),
                routes: [
                  GoRoute(
                    path: 'item/:id',
                    builder: (context, state) =>
                        ItemDetailScreen(itemId: state.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
          // Branch 1: Orders
          StatefulShellBranch(
            navigatorKey: _ordersNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.orders,
                builder: (context, state) => const OrderHistoryScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (context, state) =>
                        OrderDetailScreen(orderId: state.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
          // Branch 2: Cart
          StatefulShellBranch(
            navigatorKey: _cartNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.cart,
                builder: (context, state) => const CartScreen(),
              ),
            ],
          ),
          // Branch 3: Profile
          StatefulShellBranch(
            navigatorKey: _profileNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.profile,
                builder: (context, state) => const ProfileScreen(),
                routes: [
                  GoRoute(
                    path: 'addresses',
                    builder: (context, state) =>
                        const AddressManagementScreen(),
                  ),
                  GoRoute(
                    path: 'contacts',
                    builder: (context, state) =>
                        const ContactManagementScreen(),
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

class MadKrapowApp extends ConsumerWidget {
  const MadKrapowApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return AuthListener(
      child: MaterialApp.router(
        title: 'Mad Krapow',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.dark,
        routerConfig: router,
        builder: (context, child) {
          return UpdateLifecycleObserver(
            child: UpdatePromptMount(
              child: _WhatsNewGate(
                child: child ?? const SizedBox.shrink(),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Shows the What's-new screen once after a self-install.
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
