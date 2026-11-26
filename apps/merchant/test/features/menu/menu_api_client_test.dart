import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_api_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  test(
    'modifier group update sends maximum, minimum and explicit null description',
    () async {
      Map<String, dynamic>? sent;
      final client = MenuApiClient(
        SupabaseClient('https://example.supabase.co', 'test-key'),
        httpClient: MockClient((request) async {
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'data': {
                'id': 'g',
                'name': 'Sides',
                'description': null,
                'min_selections': 1,
                'max_selections': 3,
                'sort_order': 2,
              },
            }),
            200,
          );
        }),
      ).withTestHeaders({'Content-Type': 'application/json'});
      await client.updateModifierGroup(
        'g',
        name: 'Sides',
        hasDescription: true,
        minSelections: 1,
        maxSelections: 3,
        sortOrder: 2,
      );
      expect(sent, {
        'name': 'Sides',
        'description': null,
        'min_selections': 1,
        'max_selections': 3,
        'sort_order': 2,
      });
    },
  );
}
