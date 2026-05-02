import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/constants/roles.dart';
import '../../data/employee_repository.dart';
import '../../providers/employee_providers.dart';

class EmployeeFormScreen extends ConsumerStatefulWidget {
  const EmployeeFormScreen({super.key, this.employee});

  final Employee? employee;

  @override
  ConsumerState<EmployeeFormScreen> createState() => _EmployeeFormScreenState();
}

class _EmployeeFormScreenState extends ConsumerState<EmployeeFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _emailController;
  late final TextEditingController _phoneController;
  late String _role;

  bool get _isEditing => widget.employee != null;

  @override
  void initState() {
    super.initState();
    final employee = widget.employee;
    _nameController = TextEditingController(text: employee?.name ?? '');
    _emailController = TextEditingController(text: employee?.email ?? '');
    _phoneController = TextEditingController(text: employee?.phone ?? '');
    _role = employee?.role ?? StaffRole.cashier.name;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final phone = _phoneController.text.trim().isEmpty
        ? null
        : _phoneController.text.trim();
    final role = _role;

    if (_isEditing) {
      final notifier = ref.read(updateEmployeeProvider.notifier);
      await notifier.updateEmployee(
        widget.employee!.id,
        name: name,
        phone: phone,
        role: role,
      );

      if (!mounted) return;
      final state = ref.read(updateEmployeeProvider);
      if (state.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update: ${state.error}'),
            backgroundColor: Colors.red,
          ),
        );
      } else {
        if (context.mounted) context.pop();
      }
    } else {
      final notifier = ref.read(createEmployeeProvider.notifier);
      await notifier.createEmployee(
        name: name,
        email: email,
        role: role,
        phone: phone,
      );

      if (!mounted) return;
      final state = ref.read(createEmployeeProvider);
      if (state.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create: ${state.error}'),
            backgroundColor: Colors.red,
          ),
        );
      } else {
        if (context.mounted) context.pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = _isEditing
        ? ref.watch(updateEmployeeProvider).isLoading
        : ref.watch(createEmployeeProvider).isLoading;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Staff' : 'Add Staff'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  prefixIcon: Icon(Icons.person_outline),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Name is required';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                enabled: !_isEditing,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  prefixIcon: Icon(Icons.email_outlined),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Email is required';
                  }
                  if (!value.contains('@')) {
                    return 'Enter a valid email';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone (optional)',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _role,
                decoration: const InputDecoration(
                  labelText: 'Role',
                  prefixIcon: Icon(Icons.work_outline),
                ),
                items: StaffRole.values.map((role) {
                  return DropdownMenuItem(
                    value: role.name,
                    child: Text(role.displayName),
                  );
                }).toList(),
                onChanged: (value) {
                  if (value != null) {
                    setState(() => _role = value);
                  }
                },
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: isLoading ? null : _submit,
                child: isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_isEditing ? 'Update' : 'Create'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
