import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/constants/roles.dart';

/// Repository for admin authentication.
/// Login-only — admin accounts are pre-created in Supabase.
class AdminAuthRepository {
  AdminAuthRepository(this._client);

  final SupabaseClient _client;

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

  /// Sign out the current user.
  Future<void> signOut() {
    return _client.auth.signOut();
  }
}
