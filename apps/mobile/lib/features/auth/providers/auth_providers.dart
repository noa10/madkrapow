import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/supabase_provider.dart';
import '../data/auth_repository.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(supabaseProvider));
});

/// Stores the intended redirect path after OAuth completion.
/// Set before initiating OAuth, read by AuthCallbackScreen.
final oauthRedirectProvider = StateProvider<String?>((ref) => null);

/// Maps Supabase auth error codes to user-friendly messages.
String getAuthErrorMessage(String errorCode) {
  return switch (errorCode) {
    'invalid_credentials' => 'Invalid email or password. Please try again.',
    'email_not_confirmed' =>
      'Please check your email and click the confirmation link.',
    'user_already_exists' => 'An account with this email already exists.',
    'too_many_requests' =>
      'Too many attempts. Please wait a moment and try again.',
    'weak_password' => 'Password is too weak. Please use a stronger password.',
    'signup_disabled' => 'Sign ups are currently disabled.',
    _ => 'An error occurred. Please try again.',
  };
}
