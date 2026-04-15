import 'package:supabase_flutter/supabase_flutter.dart';

/// Repository for admin authentication.
/// Login-only — admin accounts are pre-created in Supabase.
class AdminAuthRepository {
  AdminAuthRepository(this._client);

  final SupabaseClient _client;

  User? get currentUser => _client.auth.currentUser;

  /// Whether the current user has admin role in app_metadata.
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

  /// Sign out the current user.
  Future<void> signOut() {
    return _client.auth.signOut();
  }
}
