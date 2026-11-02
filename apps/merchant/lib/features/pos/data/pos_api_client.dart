import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../config/env.dart';
import '../../../core/utils/api_url_resolver.dart';
import '../../../core/utils/auth_exceptions.dart';
import '../models/pos_models.dart';
import '../models/pos_order_payload.dart';

/// A failed POS API call with the server's machine-readable code, if any.
class PosApiException implements Exception {
  const PosApiException({
    required this.message,
    required this.statusCode,
    this.code,
    this.body,
  });

  final String message;
  final int statusCode;

  /// `code` from the JSON body (`stale_settle`, `unpaid`, `already_paid`, …).
  final String? code;
  final Map<String, dynamic>? body;

  /// Whether a counter-order request could have been processed despite this
  /// response. A malformed success, timeout response or server error cannot
  /// establish that no order was created.
  bool get outcomeUncertain =>
      statusCode < 400 || statusCode == 408 || statusCode >= 500;

  @override
  String toString() => message;
}

/// HTTP client for the web app's POS and table-admin routes.
///
/// All calls send a fresh Supabase Bearer token, matching `MerchantApiClient`.
/// Reads do not live here — the repository queries Supabase directly.
class PosApiClient {
  PosApiClient(this._supabase, {http.Client? httpClient})
    : _http = httpClient ?? http.Client();

  final SupabaseClient _supabase;
  final http.Client _http;

  /// A counter action must never wedge in a spinner: `package:http` has no
  /// default response timeout, so a stalled request would otherwise keep the
  /// submit/settle sheet busy until the OS socket timeout.
  static const requestTimeout = Duration(seconds: 20);

  String get _baseUrl => resolveApiUrl(AppEnv.webApiUrl);

  Future<Map<String, String>> _buildHeaders() async {
    try {
      await _supabase.auth.refreshSession().timeout(requestTimeout);
    } catch (_) {
      // Refresh failed — fall through to the cached session check below.
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

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$_baseUrl/api$path');
    final headers = await _buildHeaders();

    final request = switch (method) {
      'POST' => _http.post(
        uri,
        headers: headers,
        body: body == null ? null : jsonEncode(body),
      ),
      'PATCH' => _http.patch(
        uri,
        headers: headers,
        body: body == null ? null : jsonEncode(body),
      ),
      _ => throw ArgumentError('Unsupported method: $method'),
    };
    final http.Response response = await request.timeout(requestTimeout);

    return decodeResponse(response);
  }

  /// Turns one HTTP response into the POS contract's decoded body.
  ///
  /// Public so the status/code mapping (auth failures, `stale_settle`,
  /// `already_paid`, protocol violations) is unit-tested without a live
  /// Supabase session or HTTP server.
  static Map<String, dynamic> decodeResponse(http.Response response) {
    Map<String, dynamic>? parsed;
    if (response.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) parsed = decoded;
      } on FormatException {
        parsed = null;
      }
    }

    // Match MerchantApiClient: auth failures must reach the sign-in path
    // instead of surfacing as an ordinary "request failed" on every action.
    if (response.statusCode == 401) {
      throw const AuthRequiredException(
        'Your session has expired. Please sign in again.',
      );
    }
    if (response.statusCode == 403) {
      throw const AuthRequiredException(
        'Access denied — you do not have permission for this action.',
      );
    }

    if (response.statusCode >= 400) {
      final message =
          parsed?['error'] as String? ??
          'Request failed (${response.statusCode})';
      throw PosApiException(
        message: message,
        statusCode: response.statusCode,
        code: parsed?['code'] as String?,
        body: parsed,
      );
    }

    // A successful POS route always returns a JSON object. An empty or
    // non-object body is a protocol failure, not a success — never let it
    // default into "payment collected · RM 0.00".
    if (parsed == null) {
      throw PosApiException(
        message: 'The server returned an unexpected response.',
        statusCode: response.statusCode,
      );
    }
    return parsed;
  }

  /// `POST /api/pos/orders` — create a counter sale. The server re-prices
  /// every line and always creates the ticket paid, with `payment_method`
  /// recording whether the customer paid cash or used the company QR.
  Future<PosCreateOrderResult> createOrder({
    required List<Map<String, dynamic>> items,
    required PosOrderType orderType,
    required PosPaymentMethod paymentMethod,
    String? tableId,
    int? pax,
    String? customerName,
  }) async {
    final json = await _send(
      'POST',
      '/pos/orders',
      body: buildPosOrderPayload(
        items: items,
        orderType: orderType,
        paymentMethod: paymentMethod,
        tableId: tableId,
        pax: pax,
        customerName: customerName,
      ),
    );
    return PosCreateOrderResult.fromJson(json);
  }

  /// `POST /api/pos/orders/[id]/settle` — collect one unpaid ticket.
  Future<PosSettleResult> settleOrder(
    String orderId,
    PosPaymentMethod method,
  ) async {
    final json = await _send(
      'POST',
      '/pos/orders/${Uri.encodeComponent(orderId)}/settle',
      body: {'payment_method': method.wire},
    );
    return PosSettleResult.fromJson(json);
  }

  /// `POST /api/pos/tables/[id]/settle` — collect every unpaid ticket at a
  /// table. The confirmed ids make the call reject a changed table.
  Future<PosSettleResult> settleTable(
    String tableId,
    PosPaymentMethod method,
    List<String> orderIds,
  ) async {
    final json = await _send(
      'POST',
      '/pos/tables/${Uri.encodeComponent(tableId)}/settle',
      body: {'payment_method': method.wire, 'order_ids': orderIds},
    );
    return PosSettleResult.fromJson(json);
  }

  /// `POST /api/pos/tables/[id]/close` — complete the confirmed tickets.
  Future<PosCloseResult> closeTable(
    String tableId,
    List<String> orderIds,
  ) async {
    final json = await _send(
      'POST',
      '/pos/tables/${Uri.encodeComponent(tableId)}/close',
      body: {'order_ids': orderIds},
    );
    return PosCloseResult.fromJson(json);
  }

  /// Void an unpaid POS ticket via the status route (cashier-allowed case).
  Future<void> voidOrder(String orderId) async {
    await _send(
      'POST',
      '/admin/orders/${Uri.encodeComponent(orderId)}/status',
      body: {'status': 'cancelled'},
    );
  }

  /// `POST /api/admin/tables` — create a floor table.
  Future<TableWithToken> createTable({
    required String label,
    String? zone,
    int seats = 2,
    int sortOrder = 0,
    bool isActive = true,
  }) async {
    final json = await _send(
      'POST',
      '/admin/tables',
      body: {
        'label': label,
        'zone': zone,
        'seats': seats,
        'sort_order': sortOrder,
        'is_active': isActive,
      },
    );
    return _tableFrom(json);
  }

  /// `PATCH /api/admin/tables/[id]` — edit or activate/deactivate a table.
  Future<TableWithToken> updateTable(
    String tableId,
    Map<String, dynamic> changes,
  ) async {
    final json = await _send(
      'PATCH',
      '/admin/tables/${Uri.encodeComponent(tableId)}',
      body: changes,
    );
    return _tableFrom(json);
  }

  /// `POST /api/admin/tables/[id]/rotate-token` — invalidate printed QRs.
  Future<String> rotateTableToken(String tableId) async {
    final json = await _send(
      'POST',
      '/admin/tables/${Uri.encodeComponent(tableId)}/rotate-token',
    );
    final table = json['table'];
    if (table is! Map<String, dynamic>) {
      throw const PosApiException(
        message: 'The server did not return the new QR token.',
        statusCode: 500,
      );
    }
    return table['qr_token'] as String? ?? '';
  }

  TableWithToken _tableFrom(Map<String, dynamic> json) {
    final table = json['table'];
    if (table is! Map<String, dynamic>) {
      throw const PosApiException(
        message: 'The server did not return the saved table.',
        statusCode: 500,
      );
    }
    return TableWithToken.fromJson(table);
  }
}
