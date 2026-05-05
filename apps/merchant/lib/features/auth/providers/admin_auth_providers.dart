import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/admin_auth_repository.dart';
import '../../../core/providers/supabase_provider.dart';
import '../../../core/utils/auth_exceptions.dart';
import '../../../core/constants/roles.dart';

/// Provides the AdminAuthRepository instance.
final adminAuthRepositoryProvider = Provider<AdminAuthRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return AdminAuthRepository(supabase);
});

/// The current user's role from app_metadata, or null if not authenticated.
final currentRoleProvider = Provider<String?>((ref) {
  final repo = ref.watch(adminAuthRepositoryProvider);
  return repo.currentRole;
});

/// The current user's parsed [StaffRole], or null if not authenticated / unknown.
final staffRoleProvider = Provider<StaffRole?>((ref) {
  final role = ref.watch(currentRoleProvider);
  return StaffRoleExtension.fromString(role);
});

/// Whether the current user is authenticated AND has admin role.
/// Checks app_metadata.role = 'admin'.
/// Kept for backward compatibility.
final isAdminProvider = Provider<bool>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return false;
  return user.appMetadata['role'] == 'admin';
});

/// A family provider that checks if the current user has any of the allowed roles.
/// Returns false if not authenticated.
final roleGuardProvider = Provider.family<bool, List<String>>((ref, allowedRoles) {
  final repo = ref.watch(adminAuthRepositoryProvider);
  return repo.hasAnyRole(allowedRoles);
});

/// Whether the current user can manage staff (admin or manager).
final canManageStaffProvider = Provider<bool>((ref) {
  final repo = ref.watch(adminAuthRepositoryProvider);
  return repo.canManageStaff;
});

/// Admin sign-in controller (AsyncNotifier pattern).
class AdminSignInNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> signIn({
    required String email,
    required String password,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(adminAuthRepositoryProvider);
      final response = await repo.signInWithEmail(
        email: email,
        password: password,
      );

      // Check valid staff role after successful login
      final user = response.user;
      if (user == null) {
        debugPrint('AdminSignIn: sign-in returned no user');
        throw Exception('Sign-in failed — no user returned');
      }

      final role = user.appMetadata['role'] as String?;
      debugPrint('AdminSignIn: user=${user.email}, role=$role');
      final staffRole = StaffRoleExtension.fromString(role);
      if (staffRole == null) {
        // Not a recognized staff role — sign them out immediately
        debugPrint('AdminSignIn: unrecognized role "$role", signing out');
        await repo.signOut();
        throw const AuthRequiredException('Access denied — unrecognized role');
      }
    });
    if (state.hasError) {
      debugPrint('AdminSignIn: failed — ${state.error}');
    }
  }

  Future<void> signOut() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('remembered_email');
    final repo = ref.read(adminAuthRepositoryProvider);
    await repo.signOut();
  }
}

final adminSignInProvider = AsyncNotifierProvider<AdminSignInNotifier, void>(
  AdminSignInNotifier.new,
);
