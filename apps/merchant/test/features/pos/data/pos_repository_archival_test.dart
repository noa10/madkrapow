import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madkrapow_merchant/features/pos/data/pos_api_client.dart';
import 'package:madkrapow_merchant/features/pos/data/pos_repository.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SupabaseClient client;
  late PosRepository repository;

  setUp(() {
    final rows = <String, List<Map<String, dynamic>>>{
      'categories': [
        {
          'id': 'active',
          'name': 'Active',
          'sort_order': 0,
          'is_active': true,
          'archived_at': null,
        },
        {
          'id': 'archived',
          'name': 'Archived',
          'sort_order': 1,
          'is_active': true,
          'archived_at': '2026-11-26',
        },
        {
          'id': 'inactive',
          'name': 'Inactive',
          'sort_order': 2,
          'is_active': false,
          'archived_at': null,
        },
      ],
      'menu_items': [
        {
          'id': 'item',
          'name': 'Active dish',
          'price_cents': 1000,
          'category_id': 'active',
          'is_available': true,
          'archived_at': null,
        },
        {
          'id': 'archived-item',
          'name': 'Archived dish',
          'price_cents': 1000,
          'category_id': 'active',
          'is_available': true,
          'archived_at': '2026-11-26',
        },
        {
          'id': 'archived-category-item',
          'name': 'Archived category dish',
          'price_cents': 1000,
          'category_id': 'archived',
          'is_available': true,
          'archived_at': null,
        },
        {
          'id': 'unavailable',
          'name': 'Unavailable dish',
          'price_cents': 1000,
          'category_id': 'active',
          'is_available': false,
          'archived_at': null,
        },
        {
          'id': 'inactive-category-item',
          'name': 'Inactive category dish',
          'price_cents': 1000,
          'category_id': 'inactive',
          'is_available': true,
          'archived_at': null,
        },
      ],
      'menu_item_modifier_groups': [
        {
          'menu_item_id': 'item',
          'modifier_group_id': 'group',
          'is_required': false,
        },
        {
          'menu_item_id': 'item',
          'modifier_group_id': 'archived-group',
          'is_required': true,
        },
      ],
      'modifier_groups': [
        {
          'id': 'group',
          'name': 'Options',
          'min_selections': 0,
          'max_selections': 1,
          'archived_at': null,
        },
        {
          'id': 'archived-group',
          'name': 'Archived group',
          'min_selections': 1,
          'max_selections': 1,
          'archived_at': '2026-11-26',
        },
      ],
      'modifiers': [
        {
          'id': 'option',
          'name': 'Option',
          'price_delta_cents': 100,
          'modifier_group_id': 'group',
          'is_available': true,
          'archived_at': null,
        },
        {
          'id': 'archived-option',
          'name': 'Archived option',
          'price_delta_cents': 100,
          'modifier_group_id': 'group',
          'is_available': true,
          'archived_at': '2026-11-26',
        },
        {
          'id': 'unavailable-option',
          'name': 'Unavailable option',
          'price_delta_cents': 100,
          'modifier_group_id': 'group',
          'is_available': false,
          'archived_at': null,
        },
      ],
      'orders': [
        {
          'id': 'order',
          'status': 'paid',
          'delivery_type': 'dine_in',
          'total_cents': 1100,
          'order_items': [
            {
              'id': 'line',
              'menu_item_name': 'Archived dish',
              'quantity': 1,
              'line_total_cents': 1100,
              'order_item_modifiers': [
                {
                  'modifier_name': 'Archived option',
                  'modifier_price_delta_cents': 100,
                },
              ],
            },
          ],
        },
      ],
    };
    client = SupabaseClient(
      'https://pos-tests.supabase.co',
      'test-anon-key',
      authOptions: const AuthClientOptions(autoRefreshToken: false),
      httpClient: MockClient((request) async {
        final table = request.url.pathSegments.last;
        final query = request.url.queryParameters;
        var result = rows[table]!;
        if (query['archived_at'] == 'is.null') {
          result = result.where((row) => row['archived_at'] == null).toList();
        }
        if (query['categories.archived_at'] == 'is.null' &&
            (query['select'] ?? '').contains('categories!inner')) {
          result = result
              .where(
                (row) => rows['categories']!.any(
                  (category) =>
                      category['id'] == row['category_id'] &&
                      category['archived_at'] == null,
                ),
              )
              .toList();
        }
        if (query['is_active'] == 'eq.true') {
          result = result.where((row) => row['is_active'] == true).toList();
        }
        if (query['is_available'] == 'eq.true') {
          result = result.where((row) => row['is_available'] == true).toList();
        }
        if (query['menu_item_id'] != null) {
          result = result
              .where(
                (row) => 'eq.${row['menu_item_id']}' == query['menu_item_id'],
              )
              .toList();
        }
        if (table == 'orders' && query['delivery_type'] == 'eq.self_pickup') {
          result = [];
        }
        return http.Response(
          jsonEncode(result),
          200,
          headers: {'content-type': 'application/json'},
          request: request,
        );
      }),
    );
    repository = PosRepository(client, PosApiClient(client));
  });

  tearDown(() => client.dispose());

  test(
    'menu excludes archived categories and items but keeps unavailable items',
    () async {
      final menu = await repository.fetchMenu();
      expect(menu.categories.map((category) => category.id), ['active']);
      expect(menu.menuItems.map((item) => item.id), [
        'item',
        'unavailable',
        'inactive-category-item',
      ]);
    },
  );

  test('prefetched groups exclude archived groups and options', () async {
    final menu = await repository.fetchMenu();
    final groups = menu.modifierGroupsByItem['item']!;
    expect(groups.map((group) => group.id), ['group']);
    expect(groups.single.modifiers.map((modifier) => modifier.id), ['option']);
  });

  test('live fallback excludes archived groups and options', () async {
    final groups = (await repository.fetchModifierGroupsForItem('item'))!;
    expect(groups.map((group) => group.id), ['group']);
    expect(groups.single.modifiers.map((modifier) => modifier.id), ['option']);
  });

  test('open orders retain historic dish and modifier snapshots', () async {
    final orders = await repository.fetchOpenOrders();
    expect(orders.single.items.single.name, 'Archived dish');
    expect(orders.single.items.single.modifiers.single.name, 'Archived option');
  });
}
