import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/checkout/data/checkout_models.dart';
import 'package:madkrapow_mobile/features/menu/data/menu_repository.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/home_hero.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/menu_category_rail.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/rich_menu_card.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/signature_menu_card.dart';
import 'package:madkrapow_mobile/features/menu/providers/promo_preview_provider.dart';
import 'package:madkrapow_mobile/features/profile/data/store_settings_repository.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import 'menu_test_data.dart';

void _usePhoneSize(WidgetTester tester, {double height = 1800}) {
  tester.view.physicalSize = Size(393, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Widget _app(Widget child) {
  return MaterialApp(
    theme: AppTheme.darkTheme,
    home: Scaffold(body: SingleChildScrollView(child: child)),
  );
}

void main() {
  group('HomeHero', () {
    testWidgets('renders the web copy and fires both CTAs', (tester) async {
      _usePhoneSize(tester);
      var action = '';

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            storeBrandingProvider.overrideWith(
              (ref) => const StoreBranding(storeName: 'Mad Krapow'),
            ),
          ],
          child: _app(
            HomeHero(
              onOrderNow: () => action = 'order',
              onExploreMenu: () => action = 'explore',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Hot, Fiery Phad Kra Phao.'), findsOneWidget);
      expect(
        find.text('Since February 2023 · Kampung Subang Baru, Shah Alam'),
        findsOneWidget,
      );
      expect(find.text('No pork, no lard'), findsOneWidget);
      expect(
        find.text('Open daily 11:00–22:00 · Fri & Sat till 23:00'),
        findsOneWidget,
      );
      expect(find.text('Kampung Subang Baru, Shah Alam'), findsOneWidget);
      expect(find.text('Freshly cooked to order'), findsOneWidget);

      await tester.ensureVisible(find.text('Order now'));
      await tester.tap(find.text('Order now'));
      expect(action, 'order');

      await tester.ensureVisible(find.text('Explore menu'));
      await tester.tap(find.text('Explore menu'));
      expect(action, 'explore');
    });
  });

  group('SignatureMenuSection', () {
    testWidgets('renders the Chef picks badge, price and CTA', (tester) async {
      _usePhoneSize(tester);
      final item = testHomeCategories().first.menuItems.first;
      MenuItemWithModifiers? tapped;

      await tester.pumpWidget(
        _app(
          SignatureMenuSection(
            items: [item],
            onItemTap: (value) => tapped = value,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("CHEF'S PICKS"), findsOneWidget);
      expect(find.text('Phad Kra Phao'), findsOneWidget);
      expect(find.text('RM 14.50'), findsOneWidget);
      expect(find.text('Customize'), findsOneWidget);
      expect(find.byIcon(Icons.local_fire_department), findsNWidgets(3));

      await tester.ensureVisible(find.text('Phad Kra Phao'));
      await tester.tap(find.text('Phad Kra Phao'));
      expect(tapped?.item.id, 'signature-krapow');
    });
  });

  group('RichMenuCard', () {
    testWidgets('renders metadata, price and modifiers', (tester) async {
      final item = testHomeCategories().first.menuItems[1];
      var tapped = false;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            promoPreviewProvider(
              item.item.id,
            ).overrideWith((ref) async => null),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: Scaffold(
              body: Center(
                child: SizedBox(
                  width: 361,
                  child: RichMenuCard(
                    item: item,
                    height: 120,
                    onTap: () => tapped = true,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Chicken Krapow Rice'), findsOneWidget);
      expect(find.text('RM 12.50'), findsOneWidget);
      expect(find.text('Customizable'), findsOneWidget);
      expect(find.text('UNAVAILABLE'), findsNothing);

      await tester.tap(find.text('Chicken Krapow Rice'));
      expect(tapped, isTrue);
    });

    testWidgets('shows a promo price and the unavailable state', (
      tester,
    ) async {
      final categories = testHomeCategories();
      final promoItem = categories.first.menuItems[1];
      final unavailableItem = categories.first.menuItems[2];
      var unavailableTapped = false;

      final promo = PromoPreview(
        promoCode: 'SAVE20',
        discountedCents: 1000,
        originalCents: 1250,
        savingsCents: 250,
        discountType: 'percentage',
        scope: 'item',
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            promoPreviewProvider(
              promoItem.item.id,
            ).overrideWith((ref) async => promo),
            promoPreviewProvider(
              unavailableItem.item.id,
            ).overrideWith((ref) async => null),
          ],
          child: MaterialApp(
            theme: AppTheme.darkTheme,
            home: Scaffold(
              body: Column(
                children: [
                  SizedBox(
                    width: 361,
                    child: RichMenuCard(
                      item: promoItem,
                      height: 120,
                      onTap: () {},
                    ),
                  ),
                  SizedBox(
                    width: 361,
                    child: RichMenuCard(
                      item: unavailableItem,
                      height: 120,
                      onTap: () => unavailableTapped = true,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('RM 10.00'), findsOneWidget);
      expect(find.text('RM 12.50'), findsOneWidget);
      expect(find.text('UNAVAILABLE'), findsOneWidget);

      await tester.tap(find.text('Crispy Chicken Rice'));
      expect(unavailableTapped, isFalse);
    });
  });

  group('MenuCategoryRail', () {
    testWidgets('renders categories and reports taps', (tester) async {
      _usePhoneSize(tester, height: 200);
      final categories = testHomeCategories();
      String? selected;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.darkTheme,
          home: Scaffold(
            body: MenuCategoryRail(
              categories: categories,
              activeId: categories.first.category.id,
              onSelected: (value) => selected = value,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Mains'), findsOneWidget);
      expect(find.text('Drinks'), findsOneWidget);
      expect(find.text('Sides'), findsOneWidget);

      await tester.tap(find.text('Drinks'));
      expect(selected, 'category-drinks');
    });
  });
}
