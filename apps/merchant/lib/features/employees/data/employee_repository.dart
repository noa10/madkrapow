import 'dart:convert';

// ignore_for_file: use_null_aware_elements

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/utils/api_url_resolver.dart';
import '../../../core/utils/auth_exceptions.dart';

/// An employee record from the employees table.
class Employee {
  Employee({
    required this.id,
    this.authUserId,
    required this.name,
    required this.email,
    this.phone,
    required this.role,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String? authUserId;
  final String name;
  final String email;
  final String? phone;
  final String role;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory Employee.fromJson(Map<String, dynamic> json) {
    return Employee(
      id: json['id'] as String,
      authUserId: json['auth_user_id'] as String?,
      name: json['name'] as String,
      email: json['email'] as String,
      phone: json['phone'] as String?,
      role: json['role'] as String,
      isActive: json['is_active'] as bool? ?? true,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      if (authUserId != null) 'auth_user_id': authUserId,
      'name': name,
      'email': email,
      if (phone != null) 'phone': phone,
      'role': role,
      'is_active': isActive,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}

/// Repository for employee CRUD operations.
///
/// Read operations use direct Supabase queries (RLS-enforced).
/// Write operations (create, update, deactivate) go through the web API
/// which handles auth user creation and role sync in app_metadata.
class EmployeeRepository {
  EmployeeRepository(this._client);

  final SupabaseClient _client;

  String get _baseUrl => resolveApiUrl(AppEnv.webApiUrl);

  /// Build headers with a valid auth token. Throws if session is missing.
  Map<String, String> get _headers {
    final token = _client.auth.currentSession?.accessToken;
    if (token == null || token.isEmpty) {
      throw const AuthRequiredException(
        'Session expired. Please sign in again.',
      );
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  /// Fetch all employees ordered by created_at DESC.
  /// Uses direct Supabase query — RLS enforces access control.
  Future<List<Employee>> fetchEmployees() async {
    final response = await _client
        .from('employees')
        .select()
        .order('created_at', ascending: false);

    return (response as List<dynamic>)
        .map((json) => Employee.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// Create a new employee (and auth user) via the web API.
  /// POST /api/admin/employees
  Future<Employee> createEmployee({
    required String name,
    required String email,
    required String role,
    String? phone,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'email': email,
      'role': role,
      if (phone != null) 'phone': phone,
    };

    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/employees'),
      headers: _headers,
      body: jsonEncode(body),
    );

    final data = _handleResponse(response);
    return Employee.fromJson(data);
  }

  /// Update an existing employee via the web API.
  /// PATCH /api/admin/employees/\$id
  Future<Employee> updateEmployee(
    String id, {
    String? name,
    String? phone,
    String? role,
    bool? isActive,
  }) async {
    final updates = <String, dynamic>{};
    if (name != null) updates['name'] = name;
    if (phone != null) updates['phone'] = phone;
    if (role != null) updates['role'] = role;
    if (isActive != null) updates['is_active'] = isActive;

    final response = await http.patch(
      Uri.parse('$_baseUrl/api/admin/employees/$id'),
      headers: _headers,
      body: jsonEncode(updates),
    );

    final data = _handleResponse(response);
    return Employee.fromJson(data);
  }

  /// Deactivate an employee (soft delete) via the web API.
  /// DELETE /api/admin/employees/\$id
  Future<Employee> deactivateEmployee(String id) async {
    final response = await http.delete(
      Uri.parse('$_baseUrl/api/admin/employees/$id'),
      headers: _headers,
    );

    final data = _handleResponse(response);
    return Employee.fromJson(data);
  }

  /// Handle common response patterns (auth errors, error extraction).
  /// Returns the decoded JSON body on success.
  Map<String, dynamic> _handleResponse(http.Response response) {
    if (response.statusCode == 401) {
      throw const AuthRequiredException(
        'Your session has expired. Please sign in again.',
      );
    }

    if (response.statusCode == 403) {
      throw const AuthRequiredException(
        'Access denied — admin role required.',
      );
    }

    dynamic body;
    try {
      body = jsonDecode(response.body);
    } on FormatException {
      throw Exception(
        'Server returned invalid response (${response.statusCode})',
      );
    }

    if (response.statusCode >= 400) {
      final message = body is Map && body['error'] is String
          ? body['error'] as String
          : 'Request failed (${response.statusCode})';
      throw Exception(message);
    }

    return body as Map<String, dynamic>;
  }
}
