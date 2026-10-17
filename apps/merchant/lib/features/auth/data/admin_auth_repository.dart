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

/// Repository for admin authentication.
/// Login-only — admin accounts are pre-created in Supabase.
class AdminAuthRepository {
  AdminAuthRepository(this._client, {GoogleSignIn? googleSignIn})
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

  // Role and permission reads deliberately do NOT live here.
  //
  // They used to (`currentUser`, `currentRole`, `hasRole`, `hasAnyRole`,
  // `canManageStaff`, `isAdmin`), reading `_client.auth.currentUser` on demand.
  // Because the Supabase client is a stable object, anything deriving from
  // those reads had no reactive dependency on auth state: Riverpod computed it
  // once while signed out and cached null forever, which silently broke
  // sign-in (see the role providers in `admin_auth_providers.dart`). Role is
  // now derived from `currentUserProvider`, which watches the auth stream.

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

  /// Sign out of Supabase AND revoke the native Google session.
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
