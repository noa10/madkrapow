import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/supabase_provider.dart';
import '../data/employee_repository.dart';

/// Provides the EmployeeRepository instance.
final employeeRepositoryProvider = Provider<EmployeeRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return EmployeeRepository(supabase);
});

/// Fetches all employees.
final employeesProvider = FutureProvider<List<Employee>>((ref) async {
  final repo = ref.watch(employeeRepositoryProvider);
  return repo.fetchEmployees();
});

/// Controller for creating a new employee.
class CreateEmployeeNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> createEmployee({
    required String name,
    required String email,
    required String role,
    String? phone,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(employeeRepositoryProvider);
      await repo.createEmployee(
        name: name,
        email: email,
        role: role,
        phone: phone,
      );
      // Invalidate the list so it refreshes
      ref.invalidate(employeesProvider);
    });
  }
}

final createEmployeeProvider = AsyncNotifierProvider<CreateEmployeeNotifier, void>(
  CreateEmployeeNotifier.new,
);

/// Controller for updating an employee.
class UpdateEmployeeNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> updateEmployee(
    String id, {
    String? name,
    String? phone,
    String? role,
    bool? isActive,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(employeeRepositoryProvider);
      await repo.updateEmployee(
        id,
        name: name,
        phone: phone,
        role: role,
        isActive: isActive,
      );
      // Invalidate the list so it refreshes
      ref.invalidate(employeesProvider);
    });
  }
}

final updateEmployeeProvider = AsyncNotifierProvider<UpdateEmployeeNotifier, void>(
  UpdateEmployeeNotifier.new,
);
