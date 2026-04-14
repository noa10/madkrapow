import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../../../core/providers/supabase_provider.dart';

/// Widget that listens for unexpected session expiry and redirects to sign-in.
/// Wrap the MaterialApp with this to detect session loss across the entire app.
class AuthListener extends ConsumerStatefulWidget {
  const AuthListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<AuthListener> createState() => _AuthListenerState();
}

class _AuthListenerState extends ConsumerState<AuthListener> {
  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<AuthState>>(authStateProvider, (previous, next) {
      final prevState = previous?.value;
      final nextState = next.value;

      final hadUser = prevState?.session?.user != null;
      final hasUser = nextState?.session?.user != null;
      final event = nextState?.event;

      // Detect session loss that is NOT from explicit sign-out
      if (hadUser && !hasUser && event != AuthChangeEvent.signedOut) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Your session has expired. Please sign in again.'),
              duration: Duration(seconds: 4),
            ),
          );
          context.go(AppRoutes.signIn);
        }
      }
    });

    return widget.child;
  }
}
