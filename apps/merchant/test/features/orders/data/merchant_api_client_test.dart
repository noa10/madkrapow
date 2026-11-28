import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MockSupabaseClient extends Mock implements SupabaseClient {}

class MockGoTrueClient extends Mock implements GoTrueClient {}

class MockSession extends Mock implements Session {}

void main() {
  late MockSupabaseClient supabase;
  late http.Request? sent;

  setUp(() {
    supabase = MockSupabaseClient();
    final auth = MockGoTrueClient();
    final session = MockSession();
    when(() => supabase.auth).thenReturn(auth);
    when(() => auth.refreshSession()).thenAnswer((_) async => AuthResponse());
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenReturn('test-token');
    sent = null;
  });

  MerchantApiClient clientReturning(Map<String, dynamic> body) {
    return MerchantApiClient(
      supabase,
      httpClient: MockClient((request) async {
        sent = request;
        return http.Response(jsonEncode(body), 200);
      }),
    );
  }

  test('kitchen status posts the requested status to its own route', () async {
    await clientReturning({
      'success': true,
      'status': 'preparing',
    }).updateKitchenStatus('order-1', 'preparing');

    expect(sent?.method, 'POST');
    expect(sent?.url.path, '/api/admin/orders/order-1/kitchen-status');
    expect(jsonDecode(sent!.body), {'status': 'preparing'});
    expect(sent?.headers['Authorization'], 'Bearer test-token');
  });

  test('kitchen status surfaces the server error message', () async {
    final client = MerchantApiClient(
      supabase,
      httpClient: MockClient(
        (_) async => http.Response(
          jsonEncode({'error': 'Order state changed; refresh and retry.'}),
          409,
        ),
      ),
    );

    await expectLater(
      client.updateKitchenStatus('order-1', 'ready'),
      throwsA(
        predicate(
          (error) => error.toString().contains(
            'Order state changed; refresh and retry.',
          ),
        ),
      ),
    );
  });
}
