import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_repository.dart';
import 'package:madkrapow_merchant/features/menu/presentation/screens/menu_item_form_screen.dart';
import 'package:madkrapow_merchant/features/menu/providers/menu_providers.dart';
import 'package:madkrapow_merchant/generated/database.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

const categoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

class MenuFake extends Fake implements MenuRepository {
  int creates = 0;
  int updates = 0;
  int priceAttempts = 0;
  int? sentPrice;
  bool? sentSignature;
  Map<String, dynamic> grabItem = {'exists': false, 'price_cents': null};
  bool failGrabFetch = false;
  int? wantExpectedPrice;
  bool wantExpectedExists = false;

  @override
  Future<Map<String, dynamic>> fetchGrabItemPrice(String itemId) async {
    if (failGrabFetch) throw Exception('offline');
    return grabItem;
  }

  @override
  Future<List<CategoriesRow>> fetchCategories() async => [
    CategoriesRow(id: categoryId, name: 'Food'),
  ];

  @override
  Future<List<MenuItemsRow>> fetchMenuItems({String? categoryId}) async => [];

  @override
  Future<MenuItemsRow> createMenuItem(
    MenuItemsRow item, {
    bool isSignature = false,
  }) async {
    creates++;
    sentSignature = isSignature;
    return MenuItemsRow(
      id: itemId,
      categoryId: item.categoryId,
      name: item.name,
      priceCents: item.priceCents,
    );
  }

  @override
  Future<MenuItemsRow> replaceMenuItem({
    required String itemId,
    required String name,
    required int priceCents,
    required String categoryId,
    required bool isAvailable,
    required int sortOrder,
    String? description,
    String? imageUrl,
    bool? isSignature,
  }) async {
    updates++;
    sentSignature = isSignature;
    return MenuItemsRow(
      id: itemId,
      categoryId: categoryId,
      name: name,
      priceCents: priceCents,
    );
  }

  @override
  Future<Map<String, dynamic>> saveGrabPrice({
    required bool isModifier,
    required String id,
    required int? priceCents,
    required int? expectedPriceCents,
    required bool expectedExists,
    int? pickupPriceCents,
    int? expectedPickupPriceCents,
    bool updatePickupPrice = false,
    bool updatePrice = true,
    bool regularPriceChanged = false,
    bool retryNotification = false,
  }) async {
    priceAttempts++;
    sentPrice = priceCents;
    expect(id, itemId);
    expect(expectedPriceCents, wantExpectedPrice);
    expect(expectedExists, wantExpectedExists);
    if (priceAttempts == 1) throw Exception('offline');
    return {'ok': true};
  }
}

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      anonKey: 'test',
    );
  });

  testWidgets(
    'retry after Grab save failure updates the created item and keeps zero price',
    (tester) async {
      final repo = MenuFake();
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => Scaffold(
              body: TextButton(
                onPressed: () => context.push('/new'),
                child: const Text('Open'),
              ),
            ),
          ),
          GoRoute(
            path: '/new',
            builder: (context, state) => const MenuItemFormScreen(),
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [menuRepositoryProvider.overrideWithValue(repo)],
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Name'),
        'Rice',
      );
      await tester.enterText(find.widgetWithText(TextFormField, 'Price'), '12');
      await tester.ensureVisible(find.text('Signature item'));
      await tester.tap(find.text('Signature item'));
      await tester.enterText(
        find.widgetWithText(TextFormField, 'GrabFood price (optional)'),
        '0',
      );
      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.textContaining('later step failed'), findsOneWidget);
      expect(repo.creates, 1);
      expect(repo.sentPrice, 0);
      expect(repo.sentSignature, true);
      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(repo.creates, 1);
      expect(repo.updates, 1);
      expect(repo.sentSignature, true);
      expect(repo.priceAttempts, 2);
      expect(find.text('Open'), findsOneWidget);
    },
  );

  testWidgets(
    'clearing an existing Grab price falls back and sends the loaded expected value',
    (tester) async {
      final repo = MenuFake()
        ..grabItem = {'exists': true, 'price_cents': 500}
        ..wantExpectedPrice = 500
        ..wantExpectedExists = true;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [menuRepositoryProvider.overrideWithValue(repo)],
          child: MaterialApp(
            home: MenuItemFormScreen(
              item: MenuItemsRow(
                id: itemId,
                categoryId: categoryId,
                name: 'Rice',
                priceCents: 1200,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('5.00'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'GrabFood price (optional)'),
        '',
      );
      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(repo.updates, 1);
      expect(repo.priceAttempts, 1);
      expect(repo.sentPrice, isNull);
    },
  );

  testWidgets('saves regular fields when the Grab price cannot be loaded', (
    tester,
  ) async {
    final repo = MenuFake()..failGrabFetch = true;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [menuRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(
          home: MenuItemFormScreen(
            item: MenuItemsRow(
              id: itemId,
              categoryId: categoryId,
              name: 'Rice',
              priceCents: 1200,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not load Grab price'), findsOneWidget);
    await tester.ensureVisible(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(repo.updates, 1);
    expect(repo.priceAttempts, 0);
  });
}
