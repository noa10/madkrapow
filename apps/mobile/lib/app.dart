import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'config/routes.dart';
import 'config/theme.dart';
import 'core/providers/supabase_provider.dart';
import 'features/auth/presentation/screens/auth_callback_screen.dart';
import 'features/auth/presentation/screens/reset_password_screen.dart';
import 'features/auth/presentation/screens/sign_in_screen.dart';
import 'features/auth/presentation/screens/sign_up_screen.dart';
import 'features/auth/presentation/screens/update_password_screen.dart';
import 'features/cart/presentation/screens/cart_screen.dart';
import 'features/checkout/presentation/screens/checkout_screen.dart';
import 'features/checkout/presentation/screens/order_success_screen.dart';
import 'features/menu/presentation/screens/home_screen.dart';
import 'features/orders/presentation/screens/order_detail_screen.dart';
import 'features/orders/presentation/screens/order_history_screen.dart';
import 'features/profile/presentation/screens/address_management_screen.dart';
import 'features/profile/presentation/screens/profile_screen.dart';
import 'features/menu/presentation/screens/item_detail_screen.dart';

/// Routes that require authentication.
const _protectedRoutes = [
  AppRoutes.checkout,
  AppRoutes.orderSuccess,
  AppRoutes.orderDetail,
  AppRoutes.orders,
  AppRoutes.profile,
  AppRoutes.addresses,
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

GoRouter _createRouter(Ref ref) {
  return GoRouter(
    initialLocation: AppRoutes.home,
    redirect: (context, state) {
      final user = ref.read(currentUserProvider);
      final location = state.matchedLocation;

      // Redirect to sign-in if accessing a protected route without auth
      if (_isProtectedRoute(location) && user == null) {
        return '${AppRoutes.signIn}?from=${Uri.encodeComponent(location)}';
      }

      // Redirect to home if accessing auth screens while authenticated
      if (user != null &&
          (location == AppRoutes.signIn ||
              location == AppRoutes.signUp ||
              location == AppRoutes.resetPassword)) {
        return AppRoutes.home;
      }

      return null;
    },
    routes: [
      // Home (Phase 2)
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const HomeScreen(),
      ),
      // Item detail (Phase 2)
      GoRoute(
        path: AppRoutes.itemDetail,
        builder: (context, state) => ItemDetailScreen(
          itemId: state.pathParameters['id']!,
        ),
      ),
      // Cart (Phase 3)
      GoRoute(
        path: AppRoutes.cart,
        builder: (context, state) => const CartScreen(),
      ),
      // Checkout (Phase 4)
      GoRoute(
        path: AppRoutes.checkout,
        builder: (context, state) => const CheckoutScreen(),
      ),
      // Order success (Phase 4)
      GoRoute(
        path: AppRoutes.orderSuccess,
        builder: (context, state) => const OrderSuccessScreen(),
      ),
      // Order detail (Phase 5)
      GoRoute(
        path: AppRoutes.orderDetail,
        builder: (context, state) => OrderDetailScreen(
          orderId: state.pathParameters['id']!,
        ),
      ),
      // Order history (Phase 5)
      GoRoute(
        path: AppRoutes.orders,
        builder: (context, state) => const OrderHistoryScreen(),
      ),
      // Profile (Phase 6)
      GoRoute(
        path: AppRoutes.profile,
        builder: (context, state) => const ProfileScreen(),
      ),
      // Addresses (Phase 6)
      GoRoute(
        path: AppRoutes.addresses,
        builder: (context, state) => const AddressManagementScreen(),
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
    ],
  );
}

final routerProvider = Provider<GoRouter>(_createRouter);

class MadKrapowApp extends ConsumerWidget {
  const MadKrapowApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Mad Krapow',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      routerConfig: router,
    );
  }
}
