import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/utils/api_url_resolver.dart';
import '../../../core/utils/auth_exceptions.dart';

// ignore_for_file: use_null_aware_elements

/// HTTP client for menu CRUD operations via the web API routes.
/// All calls require a Supabase auth token in the Authorization header.
/// Mirrors MerchantApiClient's pattern for consistency.
class MenuApiClient {
  MenuApiClient(this._supabase);

  final SupabaseClient _supabase;

  String get _baseUrl => resolveApiUrl(AppEnv.webApiUrl);

  /// Build headers with a valid auth token. Throws if session is missing.
  Map<String, String> get _headers {
    final token = _supabase.auth.currentSession?.accessToken;
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

  // -- Categories --

  Future<List<Map<String, dynamic>>> fetchCategories() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/api/admin/menu/categories'),
      headers: _headers,
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(body['data'] as List);
  }

  Future<Map<String, dynamic>> createCategory({
    required String name,
    int sortOrder = 0,
    bool isActive = true,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/menu/categories'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        'sort_order': sortOrder,
        'is_active': isActive,
      }),
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateCategory(
    String categoryId, {
    String? name,
    int? sortOrder,
    bool? isActive,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (sortOrder != null) body['sort_order'] = sortOrder;
    if (isActive != null) body['is_active'] = isActive;

    final response = await http.patch(
      Uri.parse('$_baseUrl/api/admin/menu/categories/$categoryId'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final result = _handleResponse(response) as Map<String, dynamic>;
    return result['data'] as Map<String, dynamic>;
  }

  Future<void> deleteCategory(String categoryId) async {
    final response = await http.delete(
      Uri.parse('$_baseUrl/api/admin/menu/categories/$categoryId'),
      headers: _headers,
    );
    _handleResponse(response);
  }

  // -- Menu Items --

  Future<List<Map<String, dynamic>>> fetchMenuItems({
    String? categoryId,
  }) async {
    final uri = categoryId != null
        ? Uri.parse('$_baseUrl/api/admin/menu/items')
            .replace(queryParameters: {'category_id': categoryId})
        : Uri.parse('$_baseUrl/api/admin/menu/items');
    final response = await http.get(uri, headers: _headers);
    final body = _handleResponse(response) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(body['data'] as List);
  }

  Future<Map<String, dynamic>> createMenuItem({
    required String name,
    required int priceCents,
    required String categoryId,
    String? description,
    String? imageUrl,
    bool isAvailable = true,
    int sortOrder = 0,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/menu/items'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        'description': description,
        'price_cents': priceCents,
        'image_url': imageUrl,
        'is_available': isAvailable,
        'category_id': categoryId,
        'sort_order': sortOrder,
      }),
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> fetchMenuItem(String itemId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/api/admin/menu/items/$itemId'),
      headers: _headers,
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateMenuItem(
    String itemId, {
    String? name,
    String? description,
    int? priceCents,
    String? imageUrl,
    bool? isAvailable,
    String? categoryId,
    int? sortOrder,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (description != null) body['description'] = description;
    if (priceCents != null) body['price_cents'] = priceCents;
    if (imageUrl != null) body['image_url'] = imageUrl;
    if (isAvailable != null) body['is_available'] = isAvailable;
    if (categoryId != null) body['category_id'] = categoryId;
    if (sortOrder != null) body['sort_order'] = sortOrder;

    final response = await http.patch(
      Uri.parse('$_baseUrl/api/admin/menu/items/$itemId'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final result = _handleResponse(response) as Map<String, dynamic>;
    return result['data'] as Map<String, dynamic>;
  }

  Future<void> deleteMenuItem(String itemId) async {
    final response = await http.delete(
      Uri.parse('$_baseUrl/api/admin/menu/items/$itemId'),
      headers: _headers,
    );
    _handleResponse(response);
  }

  /// Full replacement of a menu item — sends ALL fields including null.
  /// Use this when the caller provides every field (e.g., the edit form).
  Future<Map<String, dynamic>> replaceMenuItem(
    String itemId, {
    required String name,
    String? description,
    required int priceCents,
    String? imageUrl,
    required bool isAvailable,
    required String categoryId,
    required int sortOrder,
  }) async {
    final response = await http.patch(
      Uri.parse('$_baseUrl/api/admin/menu/items/$itemId'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        'description': description,
        'price_cents': priceCents,
        'image_url': imageUrl,
        'is_available': isAvailable,
        'category_id': categoryId,
        'sort_order': sortOrder,
      }),
    );
    final result = _handleResponse(response) as Map<String, dynamic>;
    return result['data'] as Map<String, dynamic>;
  }

  // -- Modifier Groups --

  Future<List<Map<String, dynamic>>> fetchModifierGroups() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/api/admin/menu/modifier-groups'),
      headers: _headers,
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(body['data'] as List);
  }

  Future<Map<String, dynamic>> createModifierGroup({
    required String name,
    int maxSelections = 1,
    bool isRequired = false,
    int sortOrder = 0,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/menu/modifier-groups'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        'max_selections': maxSelections,
        'is_required': isRequired,
        'sort_order': sortOrder,
      }),
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateModifierGroup(
    String groupId, {
    String? name,
    int? maxSelections,
    bool? isRequired,
    int? sortOrder,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (maxSelections != null) body['max_selections'] = maxSelections;
    if (isRequired != null) body['is_required'] = isRequired;
    if (sortOrder != null) body['sort_order'] = sortOrder;

    final response = await http.patch(
      Uri.parse('$_baseUrl/api/admin/menu/modifier-groups/$groupId'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final result = _handleResponse(response) as Map<String, dynamic>;
    return result['data'] as Map<String, dynamic>;
  }

  Future<void> deleteModifierGroup(String groupId) async {
    final response = await http.delete(
      Uri.parse('$_baseUrl/api/admin/menu/modifier-groups/$groupId'),
      headers: _headers,
    );
    _handleResponse(response);
  }

  // -- Modifiers --

  Future<Map<String, dynamic>> createModifier({
    required String name,
    required String modifierGroupId,
    int priceDeltaCents = 0,
    int sortOrder = 0,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/menu/modifiers'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        'modifier_group_id': modifierGroupId,
        'price_delta_cents': priceDeltaCents,
        'sort_order': sortOrder,
      }),
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateModifier(
    String modifierId, {
    String? name,
    int? priceDeltaCents,
    String? modifierGroupId,
    int? sortOrder,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (priceDeltaCents != null) body['price_delta_cents'] = priceDeltaCents;
    if (modifierGroupId != null) body['modifier_group_id'] = modifierGroupId;
    if (sortOrder != null) body['sort_order'] = sortOrder;

    final response = await http.patch(
      Uri.parse('$_baseUrl/api/admin/menu/modifiers/$modifierId'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final result = _handleResponse(response) as Map<String, dynamic>;
    return result['data'] as Map<String, dynamic>;
  }

  Future<void> deleteModifier(String modifierId) async {
    final response = await http.delete(
      Uri.parse('$_baseUrl/api/admin/menu/modifiers/$modifierId'),
      headers: _headers,
    );
    _handleResponse(response);
  }

  // -- Item-Modifier Group Bindings --

  Future<Map<String, dynamic>> bindModifierGroup({
    required String menuItemId,
    required String modifierGroupId,
    bool isRequired = false,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/menu/item-modifier-groups'),
      headers: _headers,
      body: jsonEncode({
        'menu_item_id': menuItemId,
        'modifier_group_id': modifierGroupId,
        'is_required': isRequired,
      }),
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return body['data'] as Map<String, dynamic>;
  }

  Future<void> unbindModifierGroup({
    required String menuItemId,
    required String modifierGroupId,
  }) async {
    final response = await http.delete(
      Uri.parse('$_baseUrl/api/admin/menu/item-modifier-groups'),
      headers: _headers,
      body: jsonEncode({
        'menu_item_id': menuItemId,
        'modifier_group_id': modifierGroupId,
      }),
    );
    _handleResponse(response);
  }

  Future<List<Map<String, dynamic>>> batchUpdateModifierBindings({
    required String menuItemId,
    required List<Map<String, dynamic>> bindings,
  }) async {
    final response = await http.put(
      Uri.parse('$_baseUrl/api/admin/menu/item-modifier-groups'),
      headers: _headers,
      body: jsonEncode({
        'menu_item_id': menuItemId,
        'bindings': bindings,
      }),
    );
    final body = _handleResponse(response) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(body['data'] as List);
  }

  /// Handle common response patterns (auth errors, error extraction).
  dynamic _handleResponse(http.Response response) {
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
      final details = body is Map && body['details'] != null
          ? '\nDetails: ${body['details']}'
          : '';
      throw Exception('$message$details');
    }

    return body;
  }
}
