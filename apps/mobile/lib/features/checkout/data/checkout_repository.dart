import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/utils/auth_exceptions.dart';
import '../data/checkout_models.dart';

/// HTTP client for the web app's API routes.
/// All calls require a Supabase auth token in the Authorization header.
class CheckoutRepository {
  CheckoutRepository(this._supabase);

  final SupabaseClient _supabase;

  String get _baseUrl => AppEnv.webApiUrl;
  String get _authToken => _supabase.auth.currentSession?.accessToken ?? '';

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_authToken',
      };

  /// Create a checkout session via the web API.
  /// Returns the Stripe Checkout URL to redirect the user to.
  Future<CheckoutResult> createCheckout(CheckoutRequest request) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/checkout/create'),
        headers: _headers,
        body: jsonEncode(request.toJson()),
      );

      if (response.statusCode == 401) {
        throw const AuthRequiredException(
          'Your session has expired. Please sign in again.',
        );
      }

      if (response.statusCode != 200) {
        final body = jsonDecode(response.body);
        throw Exception(body['error'] ?? 'Checkout failed');
      }

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return CheckoutResult(
        checkoutUrl: body['checkoutUrl'] as String,
        sessionId: body['sessionId'] as String?,
      );
    } on http.ClientException catch (e) {
      throw Exception(
        'Cannot reach server at $_baseUrl. '
        'Make sure the web app is running and WEB_API_URL is correct. '
        '(${e.message})',
      );
    }
  }

  /// Get a delivery quote from Lalamove via the web API.
  /// Uses the /api/delivery/quote endpoint which doesn't require a pre-existing order.
  Future<DeliveryQuoteResult> getDeliveryQuote(DeliveryQuoteRequest request) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/delivery/quote'),
        headers: _headers,
        body: jsonEncode(request.toJson()),
      );

      if (response.statusCode == 401) {
        throw const AuthRequiredException(
          'Your session has expired. Please sign in again.',
        );
      }

      if (response.statusCode != 200) {
        final body = jsonDecode(response.body);
        throw Exception(body['error'] ?? 'Failed to get delivery quote');
      }

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return DeliveryQuoteResult.fromJson(body);
    } on http.ClientException catch (e) {
      throw Exception(
        'Cannot reach server at $_baseUrl. '
        'Make sure the web app is running and WEB_API_URL is correct. '
        '(${e.message})',
      );
    }
  }
}
