import 'package:flutter/material.dart';

import '../../../../core/constants/roles.dart';
import '../../../employees/data/employee_repository.dart';

class EmployeeListItem extends StatelessWidget {
  const EmployeeListItem({
    super.key,
    required this.employee,
    this.onTap,
  });

  final Employee employee;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final staffRole = StaffRoleExtension.fromString(employee.role);
    final roleColor = _roleColor(context, staffRole);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: roleColor.withValues(alpha: 0.15),
          child: Icon(
            Icons.person,
            color: roleColor,
          ),
        ),
        title: Text(
          employee.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(employee.email),
            if (employee.phone != null && employee.phone!.isNotEmpty)
              Text(employee.phone!),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Chip(
              label: Text(
                staffRole?.displayName ?? employee.role,
                style: TextStyle(
                  fontSize: 12,
                  color: roleColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
              backgroundColor: roleColor.withValues(alpha: 0.1),
              padding: EdgeInsets.zero,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            const SizedBox(width: 8),
            if (!employee.isActive)
              const Chip(
                label: Text(
                  'Inactive',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                backgroundColor: Colors.black12,
                padding: EdgeInsets.zero,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
          ],
        ),
        onTap: onTap,
      ),
    );
  }

  Color _roleColor(BuildContext context, StaffRole? role) {
    return switch (role) {
      StaffRole.admin => Colors.purple,
      StaffRole.manager => Colors.blue,
      StaffRole.cashier => Colors.green,
      StaffRole.kitchen => Colors.orange,
      null => Colors.grey,
    };
  }
}
