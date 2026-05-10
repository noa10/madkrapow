import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/constants/roles.dart';

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

  User? get currentUser => _client.auth.currentUser;

  /// The current user's role from app_metadata, or null if not set.
  String? get currentRole {
    final user = currentUser;
    if (user == null) return null;
    return user.appMetadata['role'] as String?;
  }

  /// Whether the current user has a specific role.
  bool hasRole(String role) {
    final user = currentUser;
    if (user == null) return false;
    return user.appMetadata['role'] == role;
  }

  /// Whether the current user has any of the given roles.
  bool hasAnyRole(List<String> roles) {
    final user = currentUser;
    if (user == null) return false;
    final role = user.appMetadata['role'] as String?;
    if (role == null) return false;
    return roles.contains(role);
  }

  /// Whether the current user can manage staff (admin or manager).
  bool get canManageStaff {
    final role = currentRole;
    if (role == null) return false;
    final staffRole = StaffRoleExtension.fromString(role);
    return staffRole?.canManageStaff ?? false;
  }

  /// Whether the current user has admin role in app_metadata.
  /// Kept for backward compatibility.
  bool get isAdmin {
    final user = currentUser;
    if (user == null) return false;
    return user.appMetadata['role'] == 'admin';
  }

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
