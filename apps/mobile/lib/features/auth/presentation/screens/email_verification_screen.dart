import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../../../core/providers/supabase_provider.dart';

/// Screen shown when a user is authenticated but their email is not yet verified.
/// Preserves the redirect intent so the user returns to their original destination after verification.
class EmailVerificationScreen extends ConsumerStatefulWidget {
  final String? redirectPath;

  const EmailVerificationScreen({super.key, this.redirectPath});

  @override
  ConsumerState<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState
    extends ConsumerState<EmailVerificationScreen> {
  bool _isResending = false;
  String? _resendError;
  bool _resendSent = false;

  Future<void> _resendVerification() async {
    setState(() {
      _isResending = true;
      _resendError = null;
    });

    try {
      final user = ref.read(currentUserProvider);
      if (user == null || user.email == null) {
        setState(() => _resendError = 'No email address found');
        return;
      }

      final redirectUrl = Uri.parse(
        'madkrapow://${AppRoutes.authCallback}',
      ).replace(queryParameters: {
        if (widget.redirectPath != null) 'redirect': widget.redirectPath!,
      }).toString();

      await Supabase.instance.client.auth.resend(
        type: OtpType.signup,
        email: user.email!,
        emailRedirectTo: redirectUrl,
      );

      setState(() => _resendSent = true);
    } on AuthException catch (e) {
      setState(() => _resendError = e.message);
    } catch (_) {
      setState(() => _resendError = 'Failed to resend verification email');
    } finally {
      if (mounted) setState(() => _isResending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final email = user?.email;

    return Scaffold(
      appBar: AppBar(title: const Text('Verify Email')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.mark_email_read_outlined,
                  size: 64,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'Verify your email',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  'We sent a verification link to ${email ?? 'your email'}. '
                  'Please check your inbox and confirm your email address to continue.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                if (_resendSent) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle, color: Colors.green[700], size: 20),
                        const SizedBox(width: 8),
                        Text(
                          'Verification email sent!',
                          style: TextStyle(color: Colors.green[700]),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (_resendError != null) ...[
                  Text(_resendError!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 16),
                ],
                FilledButton.icon(
                  onPressed: _isResending ? null : _resendVerification,
                  icon: _isResending
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh),
                  label: Text(_resendSent
                      ? 'Resend verification email'
                      : 'Resend verification email'),
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () {
                    // Refresh auth state to check if email was confirmed
                    if (widget.redirectPath != null) {
                      context.go(widget.redirectPath!);
                    } else {
                      context.go(AppRoutes.home);
                    }
                  },
                  child: const Text('I\'ve verified my email'),
                ),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => context.go(AppRoutes.cart),
                  child: const Text('Back to Cart'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
