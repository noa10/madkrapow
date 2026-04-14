import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../../../core/providers/supabase_provider.dart';

/// Splash screen shown on app launch while auth state resolves.
/// Navigates to sign-in if unauthenticated, or home if authenticated.
class AuthSplashScreen extends ConsumerStatefulWidget {
  const AuthSplashScreen({super.key});

  @override
  ConsumerState<AuthSplashScreen> createState() => _AuthSplashScreenState();
}

class _AuthSplashScreenState extends ConsumerState<AuthSplashScreen> {
  Timer? _timeout;
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    // Fallback timeout in case auth state stream takes too long
    _timeout = Timer(const Duration(seconds: 3), () {
      if (!_navigated && mounted) {
        _navigated = true;
        context.go(AppRoutes.signIn);
      }
    });
  }

  @override
  void dispose() {
    _timeout?.cancel();
    super.dispose();
  }

  void _navigate(AuthState? state) {
    if (_navigated || !mounted) return;

    if (state != null) {
      _navigated = true;
      _timeout?.cancel();
      if (state.session?.user != null) {
        context.go(AppRoutes.home);
      } else {
        context.go(AppRoutes.signIn);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    // Navigate when auth state is available
    if (authState.hasValue && !_navigated) {
      // Use addPostFrameCallback to avoid navigating during build
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navigate(authState.value);
      });
    } else if (authState.hasError && !_navigated) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navigated = true;
        _timeout?.cancel();
        context.go(AppRoutes.signIn);
      });
    }

    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.local_fire_department,
              size: 80,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              'Mad Krapow',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 32),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
