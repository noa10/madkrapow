import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';

/// Thrown when Google Sign-In completes but Supabase cannot accept the
/// returned id/access token pair.
class GoogleSignInFailedException implements Exception {
  GoogleSignInFailedException(this.message);
  final String message;
  @override
  String toString() => 'GoogleSignInFailedException: $message';
}

/// Repository wrapping Supabase authentication methods.
class AuthRepository {
  AuthRepository(this._client, {GoogleSignIn? googleSignIn})
      : _googleSignIn = googleSignIn ??
            GoogleSignIn(
              clientId: AppEnv.googleIosClientId.isEmpty
                  ? null
                  : AppEnv.googleIosClientId,
              serverClientId: AppEnv.googleWebClientId.isEmpty
                  ? null
                  : AppEnv.googleWebClientId,
              scopes: const ['openid', 'email', 'profile'],
            );

  final SupabaseClient _client;
  final GoogleSignIn _googleSignIn;

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

  /// Native Google Sign-In: shows the Google account picker in-app, then
  /// exchanges the id token with Supabase. Returns null when the user
  /// cancels the picker.
  Future<AuthResponse?> signInWithGoogle() async {
    final account = await _googleSignIn.signIn();
    if (account == null) {
      return null;
    }
    final auth = await account.authentication;
    final idToken = auth.idToken;
    final accessToken = auth.accessToken;
    if (idToken == null) {
      throw GoogleSignInFailedException(
        'Missing id token from Google. Check that GOOGLE_WEB_CLIENT_ID is set '
        'to the Web OAuth client used in the Supabase dashboard.',
      );
    }
    return _client.auth.signInWithIdToken(
      provider: OAuthProvider.google,
      idToken: idToken,
      accessToken: accessToken,
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

  /// Sign out of Supabase AND revoke the native Google session so the
  /// next sign-in shows the account picker.
  Future<void> signOut() async {
    await _client.auth.signOut();
    try {
      if (await _googleSignIn.isSignedIn()) {
        await _googleSignIn.signOut();
      }
    } catch (e) {
      debugPrint('google_sign_in signOut failed: $e');
    }
  }
}
