import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/employees/data/employee_repository.dart';

void main() {
  group('Employee.fromJson', () {
    test('handles null auth_user_id', () {
      final json = {
        'id': 'emp-123',
        'auth_user_id': null,
        'name': 'John Doe',
        'email': 'john@example.com',
        'phone': null,
        'role': 'cashier',
        'is_active': true,
        'created_at': '2024-01-01T00:00:00Z',
        'updated_at': '2024-01-02T00:00:00Z',
      };

      final employee = Employee.fromJson(json);

      expect(employee.id, 'emp-123');
      expect(employee.authUserId, isNull);
      expect(employee.name, 'John Doe');
      expect(employee.email, 'john@example.com');
    });

    test('handles non-null auth_user_id', () {
      final json = {
        'id': 'emp-123',
        'auth_user_id': 'auth-456',
        'name': 'John Doe',
        'email': 'john@example.com',
        'phone': '+60123456789',
        'role': 'manager',
        'is_active': true,
        'created_at': '2024-01-01T00:00:00Z',
        'updated_at': '2024-01-02T00:00:00Z',
      };

      final employee = Employee.fromJson(json);

      expect(employee.authUserId, 'auth-456');
    });
  });

  group('Employee.toJson', () {
    test('omits null auth_user_id', () {
      final employee = Employee(
        id: 'emp-123',
        authUserId: null,
        name: 'John Doe',
        email: 'john@example.com',
        phone: null,
        role: 'cashier',
        isActive: true,
        createdAt: DateTime.parse('2024-01-01T00:00:00Z'),
        updatedAt: DateTime.parse('2024-01-02T00:00:00Z'),
      );

      final json = employee.toJson();

      expect(json.containsKey('auth_user_id'), isFalse);
      expect(json['id'], 'emp-123');
      expect(json['name'], 'John Doe');
    });

    test('includes non-null auth_user_id', () {
      final employee = Employee(
        id: 'emp-123',
        authUserId: 'auth-456',
        name: 'John Doe',
        email: 'john@example.com',
        phone: null,
        role: 'cashier',
        isActive: true,
        createdAt: DateTime.parse('2024-01-01T00:00:00Z'),
        updatedAt: DateTime.parse('2024-01-02T00:00:00Z'),
      );

      final json = employee.toJson();

      expect(json['auth_user_id'], 'auth-456');
    });
  });
}
