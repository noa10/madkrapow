import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../providers/auth_providers.dart';

/// Handles deep link callbacks from OAuth flows (Google Sign-In, password reset).
class AuthCallbackScreen extends ConsumerStatefulWidget {
  const AuthCallbackScreen({super.key});

  @override
  ConsumerState<AuthCallbackScreen> createState() =>
      _AuthCallbackScreenState();
}

class _AuthCallbackScreenState extends ConsumerState<AuthCallbackScreen> {
  @override
  void initState() {
    super.initState();
    _handleCallback();
  }

  Future<void> _handleCallback() async {
    try {
      // For PKCE flow, the Supabase Flutter SDK automatically handles
      // the code exchange via the deep link. We just need to check
      // if the user is now authenticated.
      final repo = ref.read(authRepositoryProvider);

      // Small delay to allow the SDK to process the callback
      await Future.delayed(const Duration(milliseconds: 500));

      if (repo.currentUser != null) {
        if (mounted) context.go(AppRoutes.home);
      } else {
        if (mounted) context.go(AppRoutes.signIn);
      }
    } catch (_) {
      if (mounted) context.go(AppRoutes.signIn);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}
