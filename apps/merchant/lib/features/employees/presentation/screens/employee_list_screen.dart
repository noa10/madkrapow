import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../../../core/widgets/async_value_widget.dart';
import '../../../../features/auth/providers/admin_auth_providers.dart';
import '../../data/employee_repository.dart';
import '../../providers/employee_providers.dart';
import '../widgets/employee_list_item.dart';

class EmployeeListScreen extends ConsumerWidget {
  const EmployeeListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeesAsync = ref.watch(employeesProvider);
    final canManage = ref.watch(canManageStaffProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(employeesProvider),
          ),
        ],
      ),
      body: AsyncValueWidget<List<Employee>>(
        value: employeesAsync,
        data: (employees) {
          if (employees.isEmpty) {
            return const Center(
              child: Text('No employees found.'),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: employees.length,
            itemBuilder: (context, index) {
              final employee = employees[index];
              return EmployeeListItem(
                employee: employee,
                onTap: () => _onEmployeeTap(context, ref, employee),
              );
            },
          );
        },
      ),
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              onPressed: () => context.push(AppRoutes.staffNew),
              icon: const Icon(Icons.person_add),
              label: const Text('Add Staff'),
            )
          : null,
    );
  }

  void _onEmployeeTap(BuildContext context, WidgetRef ref, Employee employee) {
    final canManage = ref.read(canManageStaffProvider);
    if (!canManage) return;

    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit),
              title: const Text('Edit'),
              onTap: () {
                Navigator.pop(context);
                context.push(AppRoutes.staffEdit.replaceAll(':id', employee.id));
              },
            ),
            if (employee.isActive)
              ListTile(
                leading: Icon(Icons.block, color: Theme.of(context).colorScheme.error),
                title: Text(
                  'Deactivate',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _confirmDeactivate(context, ref, employee);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmDeactivate(
    BuildContext context,
    WidgetRef ref,
    Employee employee,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deactivate Employee?'),
        content: Text('Are you sure you want to deactivate ${employee.name}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Deactivate'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    final notifier = ref.read(updateEmployeeProvider.notifier);
    await notifier.updateEmployee(employee.id, isActive: false);

    if (!context.mounted) return;

    final state = ref.read(updateEmployeeProvider);
    if (state.hasError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to deactivate: ${state.error}'),
          backgroundColor: Colors.red,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Employee deactivated')),
      );
    }
  }
}
