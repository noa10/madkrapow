import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../providers/auth_providers.dart';
import '../widgets/auth_form.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  bool _isLoading = false;
  String? _errorText;

  Future<void> _handleSignIn({
    required String email,
    required String password,
    String? name,
  }) async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });

    try {
      await ref.read(authRepositoryProvider).signInWithEmail(
            email: email,
            password: password,
          );
      if (mounted) {
        final from = GoRouterState.of(context).uri.queryParameters['from'];
        context.go(from ?? AppRoutes.home);
      }
    } on AuthException catch (e) {
      setState(() => _errorText = getAuthErrorMessage(e.code ?? ''));
    } catch (_) {
      setState(() => _errorText = 'An unexpected error occurred.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });

    try {
      // Store the intended destination before leaving the app for OAuth
      final from = GoRouterState.of(context).uri.queryParameters['from'];
      if (from != null) {
        ref.read(oauthRedirectProvider.notifier).state = from;
      }
      await ref.read(authRepositoryProvider).signInWithGoogle();
      // The OAuth flow redirects away from the app, so we don't need to navigate here.
      // The auth_callback_screen handles the return.
    } catch (_) {
      ref.read(oauthRedirectProvider.notifier).state = null;
      setState(() => _errorText = 'Google sign-in failed. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.local_fire_department,
                  size: 64,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'Mad Krapow',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Hot, fiery Phad Kra Phao\ndelivered to your door.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 32),
                AuthForm(
                  onSubmit: _handleSignIn,
                  submitLabel: 'Sign In',
                  isLoading: _isLoading,
                  errorText: _errorText,
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        'OR',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _isLoading ? null : _handleGoogleSignIn,
                  icon: const Icon(Icons.g_mobiledata, size: 28),
                  label: const Text('Continue with Google'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 50),
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      "Don't have an account?",
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    TextButton(
                      onPressed: () => context.go(AppRoutes.signUp),
                      child: const Text('Sign Up'),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: () => context.go(AppRoutes.resetPassword),
                  child: const Text('Forgot password?'),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: _isLoading ? null : () => context.go(AppRoutes.home),
                  child: const Text('Continue as Guest'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
