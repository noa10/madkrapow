import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/admin_auth_repository.dart';
import '../../../core/providers/supabase_provider.dart';
import '../../../core/utils/auth_exceptions.dart';

/// Provides the AdminAuthRepository instance.
final adminAuthRepositoryProvider = Provider<AdminAuthRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return AdminAuthRepository(supabase);
});

/// Whether the current user is authenticated AND has admin role.
/// Checks app_metadata.role = 'admin'.
final isAdminProvider = Provider<bool>((ref) {
  final user = ref.watch(currentUserProvider);
  if (user == null) return false;
  return user.appMetadata['role'] == 'admin';
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

      // Check admin role after successful login
      final user = response.user;
      if (user == null) {
        throw Exception('Sign-in failed — no user returned');
      }

      if (user.appMetadata['role'] != 'admin') {
        // Not an admin — sign them out immediately
        await repo.signOut();
        throw const AuthRequiredException('Access denied — admin role required');
      }
    });
  }

  Future<void> signOut() async {
    final repo = ref.read(adminAuthRepositoryProvider);
    await repo.signOut();
  }
}

final adminSignInProvider = AsyncNotifierProvider<AdminSignInNotifier, void>(
  AdminSignInNotifier.new,
);
