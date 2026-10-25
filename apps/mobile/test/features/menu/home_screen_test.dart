import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/menu/presentation/screens/home_screen.dart';
import 'package:madkrapow_mobile/features/menu/providers/menu_providers.dart';
import 'package:madkrapow_mobile/features/menu/providers/promo_preview_provider.dart';
import 'package:madkrapow_mobile/features/profile/data/store_settings_repository.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import 'menu_test_data.dart';

void main() {
  testWidgets('home renders the catalog and searches without losing state', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final categories = testHomeCategories();
    final overrides = <Override>[
      categoriesWithItemsProvider.overrideWith((ref) async => categories),
      storeOpenProvider.overrideWithValue(true),
      menuRealtimeWatcherProvider.overrideWith((ref) {}),
      menuPeriodicRefreshProvider.overrideWith((ref) => null),
      promoRealtimeWatcherProvider.overrideWith((ref) {}),
      brandingRealtimeWatcherProvider.overrideWith((ref) {}),
      storeBrandingProvider.overrideWith(
        (ref) => const StoreBranding(storeName: 'Mad Krapow'),
      ),
      for (final item in categories.expand((category) => category.menuItems))
        promoPreviewProvider(item.item.id).overrideWith((ref) async => null),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(theme: AppTheme.darkTheme, home: const HomeScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hot, Fiery Phad Kra Phao.'), findsOneWidget);

    // The hero is deliberately tall on a phone; bring the menu into view.
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -320));
    await tester.pumpAndSettle();

    expect(find.text("CHEF'S PICKS"), findsOneWidget);
    expect(find.text('Phad Kra Phao'), findsOneWidget);
    expect(find.text('Thai Iced Tea'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.enterText(find.byType(TextField), 'Thai');
    await tester.pumpAndSettle();

    expect(find.text('Thai Iced Tea'), findsOneWidget);
    expect(find.text('Chicken Krapow Rice'), findsNothing);
    expect(find.text("CHEF'S PICKS"), findsNothing);

    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();

    expect(find.text("CHEF'S PICKS"), findsOneWidget);
    expect(find.text('Thai Iced Tea'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(
      find.text('Chicken Krapow Rice'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('Chicken Krapow Rice'), findsOneWidget);
    expect(find.text('Mains'), findsWidgets);
    expect(find.text('Drinks'), findsWidgets);
    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(
      find.text('Two ways to order'),
      800,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Order on GrabFood'), findsOneWidget);
    expect(find.text('Order direct'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('How it works'),
      800,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Pick your dish'), findsOneWidget);
    expect(find.text('Wait for delivery'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
