import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  bool _rememberMe = false;
  String? _rememberedEmail;

  @override
  void initState() {
    super.initState();
    _loadRememberedEmail();
  }

  Future<void> _loadRememberedEmail() async {
    final prefs = await SharedPreferences.getInstance();
    final email = prefs.getString('remembered_email');
    if (mounted) {
      setState(() {
        _rememberedEmail = email;
        _rememberMe = email != null;
      });
    }
  }

  Future<void> _persistEmail(bool rememberMe, String email) async {
    final prefs = await SharedPreferences.getInstance();
    if (rememberMe) {
      await prefs.setString('remembered_email', email);
    } else {
      await prefs.remove('remembered_email');
    }
  }

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
      await _persistEmail(_rememberMe, email);
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
      final response =
          await ref.read(authRepositoryProvider).signInWithGoogle();
      if (!mounted) return;
      if (response?.session == null) {
        // User cancelled the picker — leave the sign-in screen as-is.
        return;
      }
      final from = GoRouterState.of(context).uri.queryParameters['from'];
      context.go(from ?? AppRoutes.home);
    } catch (_) {
      if (mounted) {
        setState(() => _errorText = 'Google sign-in failed. Please try again.');
      }
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
                  rememberedEmail: _rememberedEmail,
                  onRememberMeChanged: (value) {
                    setState(() => _rememberMe = value);
                  },
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
                const SizedBox(height: 16),
                const _VersionFooter(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VersionFooter extends StatelessWidget {
  const _VersionFooter();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PackageInfo>(
      future: PackageInfo.fromPlatform(),
      builder: (ctx, snap) {
        if (!snap.hasData) return const SizedBox.shrink();
        return Text(
          'v${snap.data!.version}',
          style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
        );
      },
    );
  }
}
