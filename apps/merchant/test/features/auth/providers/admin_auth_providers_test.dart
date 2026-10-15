import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/constants/roles.dart';
import 'package:madkrapow_merchant/core/providers/supabase_provider.dart';
import 'package:madkrapow_merchant/features/auth/providers/admin_auth_providers.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MockUser extends Mock implements User {}

/// Stands in for [currentUserProvider], which in production watches the
/// Supabase auth stream. Driving it from a StateProvider lets a test move the
/// app between signed-out and signed-in the same way a real sign-in does.
ProviderContainer _containerWithUser(StateProvider<User?> userState) {
  final container = ProviderContainer(
    overrides: [
      currentUserProvider.overrideWith((ref) => ref.watch(userState)),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

MockUser _userWithRole(String? role) {
  final user = MockUser();
  when(() => user.appMetadata).thenReturn(
    role == null ? <String, dynamic>{} : <String, dynamic>{'role': role},
  );
  return user;
}

void main() {
  group('role providers follow auth state', () {
    test('staffRoleProvider picks up a staff member who signs in after the '
        'provider was first read while signed out', () {
      final userState = StateProvider<User?>((ref) => null);
      final container = _containerWithUser(userState);

      // The initial GoRouter redirect reads this while signed out.
      expect(container.read(staffRoleProvider), isNull);

      // A staff member signs in successfully.
      container.read(userState.notifier).state = _userWithRole('admin');

      // The redirect re-runs on the auth-state change and re-reads this.
      // Before the fix this stayed null, so app.dart:66 bounced the user
      // straight back to /signin and sign-in appeared to do nothing.
      expect(container.read(staffRoleProvider), StaffRole.admin);
    });

    test('staffRoleProvider clears again on sign-out', () {
      final userState = StateProvider<User?>((ref) => _userWithRole('manager'));
      final container = _containerWithUser(userState);

      expect(container.read(staffRoleProvider), StaffRole.manager);

      container.read(userState.notifier).state = null;

      expect(container.read(staffRoleProvider), isNull);
    });

    test('a signed-in user with no staff role stays rejected', () {
      final userState = StateProvider<User?>((ref) => _userWithRole(null));
      final container = _containerWithUser(userState);

      expect(container.read(currentRoleProvider), isNull);
      expect(container.read(staffRoleProvider), isNull);
    });

    test('roleGuardProvider follows auth state', () {
      final userState = StateProvider<User?>((ref) => null);
      final container = _containerWithUser(userState);

      expect(container.read(roleGuardProvider(const ['admin', 'manager'])), isFalse);

      container.read(userState.notifier).state = _userWithRole('manager');

      expect(container.read(roleGuardProvider(const ['admin', 'manager'])), isTrue);
      expect(container.read(roleGuardProvider(const ['admin'])), isFalse);
    });

    test('canManageStaffProvider follows auth state', () {
      final userState = StateProvider<User?>((ref) => null);
      final container = _containerWithUser(userState);

      expect(container.read(canManageStaffProvider), isFalse);

      container.read(userState.notifier).state = _userWithRole('cashier');
      expect(container.read(canManageStaffProvider), isFalse);

      container.read(userState.notifier).state = _userWithRole('admin');
      expect(container.read(canManageStaffProvider), isTrue);
    });

    test('isAdminProvider follows auth state', () {
      final userState = StateProvider<User?>((ref) => null);
      final container = _containerWithUser(userState);

      expect(container.read(isAdminProvider), isFalse);

      container.read(userState.notifier).state = _userWithRole('kitchen');
      expect(container.read(isAdminProvider), isFalse);

      container.read(userState.notifier).state = _userWithRole('admin');
      expect(container.read(isAdminProvider), isTrue);
    });
  });
}
