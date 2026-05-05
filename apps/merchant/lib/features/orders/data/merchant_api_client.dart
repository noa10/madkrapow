import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/utils/api_url_resolver.dart';
import '../../../core/utils/auth_exceptions.dart';

// ignore_for_file: use_null_aware_elements

/// HTTP client for the web app's admin API routes.
/// All calls require a Supabase auth token in the Authorization header.
/// Mirrors CheckoutRepository's Bearer token pattern.
class MerchantApiClient {
  MerchantApiClient(this._supabase);

  final SupabaseClient _supabase;

  String get _baseUrl => resolveApiUrl(AppEnv.webApiUrl);

  /// Build headers with a fresh auth token. Calls refreshSession() to ensure
  /// the token is refreshed if it has expired. Raw HTTP calls bypass Supabase's
  /// auto-refresh, so tokens can go stale without this. Throws if session is missing.
  Future<Map<String, String>> _buildHeaders() async {
    try {
      await _supabase.auth.refreshSession();
    } catch (_) {
      // Refresh failed — fall through to check cached session
    }
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

  /// Generic POST request to an admin API endpoint.
  /// POST /api/admin/{path}
  Future<Map<String, dynamic>> post(
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api$path'),
      headers: await _buildHeaders(),
      body: body != null ? jsonEncode(body) : null,
    );

    return _handleResponse(response) as Map<String, dynamic>;
  }

  /// Test HubboPOS connection via the web API.
  /// POST /api/admin/hubbopos/test-connection
  Future<void> testHubboPosConnection() async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/hubbopos/test-connection'),
      headers: await _buildHeaders(),
    );

    _handleResponse(response);
  }

  /// Trigger a full HubboPOS sync via the web API.
  /// POST /api/admin/hubbopos/sync
  Future<void> syncHubboPos() async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/hubbopos/sync'),
      headers: await _buildHeaders(),
    );

    _handleResponse(response);
  }

  /// Advance an order's status via the web API.
  /// POST /api/admin/orders/:id/status
  Future<void> updateOrderStatus(String orderId, String newStatus) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/orders/$orderId/status'),
      headers: await _buildHeaders(),
      body: jsonEncode({'status': newStatus}),
    );

    _handleResponse(response);
  }

  /// Approve or reject a bulk order via the web API.
  /// POST /api/admin/orders/:id/approve
  Future<ApproveResult> approveOrder({
    required String orderId,
    required String action,
    int? approvedTotalCents,
    String? reviewNotes,
  }) async {
    final body = <String, dynamic>{
      'action': action,
      if (reviewNotes != null) 'review_notes': reviewNotes,
    };
    if (action == 'approve' && approvedTotalCents != null) {
      body['approved_total_cents'] = approvedTotalCents;
    }

    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/orders/$orderId/approve'),
      headers: await _buildHeaders(),
      body: jsonEncode(body),
    );

    final responseBody = _handleResponse(response) as Map<String, dynamic>;
    return ApproveResult(
      success: responseBody['success'] as bool,
      checkoutUrl: responseBody['checkoutUrl'] as String?,
      message: responseBody['message'] as String? ?? '',
    );
  }

  /// Cancel an order (set status to 'cancelled').
  /// This uses the status route since the server enforces valid transitions.
  Future<void> cancelOrder(String orderId) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/orders/$orderId/status'),
      headers: await _buildHeaders(),
      body: jsonEncode({'status': 'cancelled'}),
    );

    _handleResponse(response);
  }

  /// Generic GET request to an admin API endpoint.
  /// GET /api/admin/{path}
  Future<Map<String, dynamic>> get(
    String path, [
    Map<String, String> queryParams = const {},
  ]) async {
    final uri = Uri.parse('$_baseUrl/api$path').replace(
      queryParameters: queryParams.isNotEmpty ? queryParams : null,
    );

    final response = await http.get(
      uri,
      headers: await _buildHeaders(),
    );

    return _handleResponse(response) as Map<String, dynamic>;
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
      throw Exception(message);
    }

    return body;
  }
}

class ApproveResult {
  final bool success;
  final String? checkoutUrl;
  final String message;

  ApproveResult({
    required this.success,
    this.checkoutUrl,
    required this.message,
  });
}
