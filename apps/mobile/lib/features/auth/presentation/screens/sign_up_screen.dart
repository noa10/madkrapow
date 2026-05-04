import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../providers/auth_providers.dart';
import '../widgets/auth_form.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  bool _isLoading = false;
  String? _errorText;
  bool _emailSent = false;
  String? _redirectPath;

  @override
  void initState() {
    super.initState();
    // Read redirect param from the current route
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final state = GoRouterState.of(context);
      setState(() {
        _redirectPath = state.uri.queryParameters['from'];
      });
    });
  }

  Future<void> _handleSignUp({
    required String email,
    required String password,
    String? name,
  }) async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });

    try {
      await ref.read(authRepositoryProvider).signUpWithEmail(
            email: email,
            password: password,
          );
      setState(() => _emailSent = true);
    } on AuthException catch (e) {
      setState(() => _errorText = getAuthErrorMessage(e.code ?? ''));
    } catch (_) {
      setState(() => _errorText = 'An unexpected error occurred.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_emailSent) {
      // After signup, navigate to email verification screen with redirect preserved
      final verifyPath = _redirectPath != null
          ? '${AppRoutes.emailVerification}?redirect=${Uri.encodeComponent(_redirectPath!)}'
          : AppRoutes.emailVerification;

      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.mark_email_read,
                    size: 64,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Check your email',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'We sent a confirmation link to your email. '
                    'Please verify your email to continue.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => context.go(verifyPath),
                    child: const Text('Go to Verification'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => context.go(AppRoutes.signIn),
                    child: const Text('Back to Sign In'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final signInPath = _redirectPath != null
        ? '${AppRoutes.signIn}?from=${Uri.encodeComponent(_redirectPath!)}'
        : AppRoutes.signIn;

    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AuthForm(
                  onSubmit: _handleSignUp,
                  submitLabel: 'Sign Up',
                  showNameField: true,
                  isLoading: _isLoading,
                  errorText: _errorText,
                  showRememberMe: false,
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Already have an account?',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    TextButton(
                      onPressed: () => context.go(signInPath),
                      child: const Text('Sign In'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
