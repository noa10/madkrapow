import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/utils/auth_exceptions.dart';
import '../data/checkout_models.dart';
export '../data/checkout_models.dart' show PromoPreview;

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

  /// Validate a promo code via /api/checkout/validate-promo.
  Future<AppliedPromo> validatePromo({
    required String code,
    required int subtotalCents,
    required int deliveryFeeCents,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/checkout/validate-promo'),
      headers: _headers,
      body: jsonEncode({
        'code': code,
        'subtotalCents': subtotalCents,
        'deliveryFeeCents': deliveryFeeCents,
      }),
    );

    if (response.statusCode == 401) {
      throw const AuthRequiredException(
        'Your session has expired. Please sign in again.',
      );
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200 || body['valid'] == false) {
      throw Exception(body['error'] ?? 'Invalid promo code');
    }

    return AppliedPromo(
      code: body['promoCode'] as String,
      description: body['description'] as String? ?? '',
      scope: body['scope'] as String,
      discountType: body['discountType'] as String,
      discountValue: body['discountValue'] as int,
      discountCents: body['discountCents'] as int,
    );
  }

  /// Fetch auto-applied promos via /api/promos/auto.
  Future<List<AppliedPromo>> fetchAutoPromos({
    required int subtotalCents,
    required int deliveryFeeCents,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/promos/auto'),
      headers: _headers,
      body: jsonEncode({
        'subtotalCents': subtotalCents,
        'deliveryFeeCents': deliveryFeeCents,
      }),
    );

    if (response.statusCode != 200) return [];

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final promos = body['applied'] as List?;
    if (promos == null) return [];

    return promos.map((p) {
      final map = p as Map<String, dynamic>;
      return AppliedPromo(
        code: map['code'] as String,
        description: map['description'] as String? ?? '',
        scope: map['scope'] as String,
        discountType: map['discountType'] as String,
        discountValue: map['discountValue'] as int,
        discountCents: map['discountCents'] as int,
      );
    }).toList();
  }

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

  /// Fetch promo preview for a single item via /api/promos/preview.
  /// Returns null if no promo is available for this item.
  Future<PromoPreview?> fetchPromoPreview(String itemId) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/promos/preview'),
        headers: _headers,
        body: jsonEncode({'itemId': itemId, 'cartSubtotalCents': 0}),
      );

      if (response.statusCode != 200) return null;

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final previews = body['previews'] as List?;
      if (previews == null || previews.isEmpty) return null;

      return PromoPreview.fromJson(previews[0] as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}
