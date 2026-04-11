import 'package:supabase_flutter/supabase_flutter.dart';

/// Repository wrapping Supabase authentication methods.
class AuthRepository {
  AuthRepository(this._client);

  final SupabaseClient _client;

  User? get currentUser => _client.auth.currentUser;

  /// Sign in with email and password.
  Future<AuthResponse> signInWithEmail({
    required String email,
    required String password,
  }) {
    return _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  /// Sign up with email and password.
  Future<AuthResponse> signUpWithEmail({
    required String email,
    required String password,
  }) {
    return _client.auth.signUp(
      email: email,
      password: password,
    );
  }

  /// Sign in with Google OAuth.
  Future<bool> signInWithGoogle() async {
    return _client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: 'madkrapow://auth-callback',
    );
  }

  /// Send a password reset email.
  Future<void> resetPasswordForEmail(String email) {
    return _client.auth.resetPasswordForEmail(
      email,
      redirectTo: 'madkrapow://auth/update-password',
    );
  }

  /// Update the current user's password.
  Future<UserResponse> updatePassword(String newPassword) {
    return _client.auth.updateUser(
      UserAttributes(password: newPassword),
    );
  }

  /// Sign out the current user.
  Future<void> signOut() {
    return _client.auth.signOut();
  }
}
