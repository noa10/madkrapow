import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/utils/auth_exceptions.dart';

// ignore_for_file: use_null_aware_elements

/// HTTP client for the web app's admin API routes.
/// All calls require a Supabase auth token in the Authorization header.
/// Mirrors CheckoutRepository's Bearer token pattern.
class MerchantApiClient {
  MerchantApiClient(this._supabase);

  final SupabaseClient _supabase;

  String get _baseUrl => AppEnv.webApiUrl;

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

  /// Advance an order's status via the web API.
  /// POST /api/admin/orders/:id/status
  Future<void> updateOrderStatus(String orderId, String newStatus) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/admin/orders/$orderId/status'),
      headers: _headers,
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
      headers: _headers,
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
      headers: _headers,
      body: jsonEncode({'status': 'cancelled'}),
    );

    _handleResponse(response);
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
