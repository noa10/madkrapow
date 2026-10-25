import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/cart/providers/cart_provider.dart';
import 'package:madkrapow_mobile/features/checkout/data/checkout_models.dart';
import 'package:madkrapow_mobile/features/menu/data/menu_repository.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/item_order_widgets.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/item_quick_view.dart';
import 'package:madkrapow_mobile/features/menu/providers/promo_preview_provider.dart';
import 'package:madkrapow_mobile/generated/tables/modifier_groups.dart';
import 'package:madkrapow_mobile/generated/tables/modifiers.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import 'menu_test_data.dart';

void main() {
  testWidgets('quick view opens over the root navigator and closes', (
    tester,
  ) async {
    final item = FullMenuItem(
      item: testMenuItem(
        id: 'signature-krapow',
        categoryId: 'category-mains',
        name: 'Phad Kra Phao',
        description: 'Wok-fired holy basil with jasmine rice.',
        priceCents: 1450,
      ),
      category: (id: 'category-mains', name: 'Mains'),
      modifierGroups: const [],
    );

    await _pumpHost(
      tester,
      openLabel: 'Open item',
      onOpen: (context) => showItemQuickView(context, 'signature-krapow'),
      overrides: [
        menuItemDetailProvider(
          'signature-krapow',
        ).overrideWith((ref) async => item),
        promoPreviewProvider(
          'signature-krapow',
        ).overrideWith((ref) async => null),
      ],
    );

    await tester.tap(find.text('Open item'));
    await tester.pumpAndSettle();

    expect(find.text('Phad Kra Phao'), findsOneWidget);
    expect(find.text('Add item'), findsOneWidget);
    expect(find.byTooltip('Close item view'), findsOneWidget);
    expect(find.byType(ModalBarrier), findsWidgets);

    await tester.tap(find.byTooltip('Close item view'));
    await tester.pumpAndSettle();

    expect(find.text('Phad Kra Phao'), findsNothing);
    expect(find.text('Open item'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('quick view renders the home catalog snapshot immediately', (
    tester,
  ) async {
    final spiceGroup = _group(
      id: 'group-spice',
      name: 'Spice Level',
      isRequired: true,
      maxSelections: 1,
    );
    final preview = _previewWithGroups(
      id: 'preview-krapow',
      name: 'Preview Krapow',
      description: 'Rendered from data already loaded by Home.',
      groups: [
        ModifierGroupWithModifiers(
          group: spiceGroup,
          modifiers: [
            _modifier(
              groupId: spiceGroup.id,
              id: 'modifier-medium',
              name: 'Medium',
            ),
          ],
          isRequired: true,
        ),
      ],
    );

    await _pumpHost(
      tester,
      openLabel: 'Open preview',
      onOpen: (context) =>
          showItemQuickView(context, 'preview-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider(
          'preview-krapow',
        ).overrideWith((ref) async => null),
        promoPreviewProvider(
          'preview-krapow',
        ).overrideWith((ref) async => null),
      ],
    );

    await tester.tap(find.text('Open preview'));
    await tester.pumpAndSettle();

    expect(find.text('Preview Krapow'), findsOneWidget);
    expect(find.text('Spice Level'), findsOneWidget);
    expect(find.text('Select options (1)'), findsOneWidget);
    // The web sheet hides the running total until the required picks are done.
    expect(
      find.descendant(
        of: find.byType(ItemPrimaryButton),
        matching: find.text('RM 14.50'),
      ),
      findsNothing,
    );
    expect(find.byType(CircularProgressIndicator), findsNothing);

    await tester.ensureVisible(find.text('Medium'));
    await tester.tap(find.text('Medium'));
    await tester.pumpAndSettle();

    expect(find.text('Add item'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(ItemPrimaryButton),
        matching: find.text('RM 14.50'),
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('quick view closes when dragged down from the top', (
    tester,
  ) async {
    final preview = _previewWithGroups(
      id: 'drag-krapow',
      name: 'Drag Krapow',
      description: 'Drag the handle to dismiss.',
      priceCents: 1250,
    );

    await _pumpHost(
      tester,
      openLabel: 'Open drag item',
      onOpen: (context) =>
          showItemQuickView(context, 'drag-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider('drag-krapow').overrideWith((ref) async => null),
        promoPreviewProvider('drag-krapow').overrideWith((ref) async => null),
      ],
    );

    await tester.tap(find.text('Open drag item'));
    await tester.pumpAndSettle();

    expect(find.text('Drag Krapow'), findsOneWidget);
    expect(find.bySemanticsLabel('Drag down to close'), findsOneWidget);

    await tester.fling(
      find.bySemanticsLabel('Drag down to close'),
      const Offset(0, 500),
      1000,
    );
    await tester.pumpAndSettle();

    expect(find.text('Drag Krapow'), findsNothing);
    expect(find.text('Open drag item'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('promo price and discounted total render in the quick view', (
    tester,
  ) async {
    final preview = _previewWithGroups(
      id: 'promo-krapow',
      name: 'Promo Krapow',
      priceCents: 1450,
    );

    // Item-scoped percentage promo: the cart discounts the line, so the
    // sheet price, the CTA total, and the cart line all show RM 10.00.
    const promo = PromoPreview(
      promoCode: 'KRAPOW10',
      discountedCents: 1000,
      originalCents: 1450,
      savingsCents: 450,
      discountType: 'percentage',
      scope: 'item',
    );

    await _pumpHost(
      tester,
      openLabel: 'Open promo',
      onOpen: (context) =>
          showItemQuickView(context, 'promo-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider(
          'promo-krapow',
        ).overrideWith((ref) async => null),
        promoPreviewProvider('promo-krapow').overrideWith((ref) async => promo),
      ],
    );

    await tester.tap(find.text('Open promo'));
    await tester.pumpAndSettle();

    expect(find.text('RM 10.00'), findsNWidgets(2));
    expect(find.text('RM 14.50'), findsOneWidget);

    await tester.tap(find.byTooltip('Increase quantity'));
    await tester.pumpAndSettle();

    expect(find.text('RM 10.00'), findsOneWidget);
    expect(find.text('RM 20.00'), findsOneWidget);
  });

  testWidgets('order-scoped promo keeps the quick view at full price', (
    tester,
  ) async {
    final preview = _previewWithGroups(
      id: 'order-promo-krapow',
      name: 'Order Promo Krapow',
      priceCents: 1450,
    );

    // Order-scoped promos are applied to the order subtotal at checkout, not
    // to the cart line — the sheet must not advertise a per-line discount
    // the cart will not show.
    const promo = PromoPreview(
      promoCode: 'SITEWIDE10',
      discountedCents: 1000,
      originalCents: 1450,
      savingsCents: 450,
      discountType: 'percentage',
      scope: 'order',
    );

    await _pumpHost(
      tester,
      openLabel: 'Open order promo',
      onOpen: (context) =>
          showItemQuickView(context, 'order-promo-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider(
          'order-promo-krapow',
        ).overrideWith((ref) async => null),
        promoPreviewProvider(
          'order-promo-krapow',
        ).overrideWith((ref) async => promo),
      ],
    );

    await tester.tap(find.text('Open order promo'));
    await tester.pumpAndSettle();

    expect(find.text('RM 10.00'), findsNothing);
    // Price text + CTA total both stay at the undiscounted price.
    expect(find.text('RM 14.50'), findsNWidgets(2));

    await tester.tap(find.byTooltip('Increase quantity'));
    await tester.pumpAndSettle();

    expect(find.text('RM 29.00'), findsOneWidget);
    expect(find.text('RM 14.50'), findsOneWidget);
  });

  testWidgets('modifier delta updates the footer and max=1 replaces', (
    tester,
  ) async {
    final proteinGroup = _group(
      id: 'group-protein',
      name: 'Protein',
      isRequired: true,
      maxSelections: 1,
    );
    final preview = _previewWithGroups(
      id: 'protein-krapow',
      name: 'Protein Krapow',
      priceCents: 1450,
      groups: [
        ModifierGroupWithModifiers(
          group: proteinGroup,
          modifiers: [
            _modifier(
              groupId: proteinGroup.id,
              id: 'modifier-chicken',
              name: 'Chicken',
              priceDeltaCents: 200,
            ),
            _modifier(
              groupId: proteinGroup.id,
              id: 'modifier-beef',
              name: 'Beef',
              priceDeltaCents: 400,
            ),
          ],
          isRequired: true,
        ),
      ],
    );

    final container = await _pumpHost(
      tester,
      openLabel: 'Open protein',
      onOpen: (context) =>
          showItemQuickView(context, 'protein-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider(
          'protein-krapow',
        ).overrideWith((ref) async => null),
        promoPreviewProvider(
          'protein-krapow',
        ).overrideWith((ref) async => null),
      ],
    );

    await tester.tap(find.text('Open protein'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Chicken'));
    await tester.tap(find.text('Chicken'));
    await tester.pumpAndSettle();
    expect(find.text('RM 16.50'), findsOneWidget);

    await tester.tap(find.text('Beef'));
    await tester.pumpAndSettle();
    expect(find.text('RM 18.50'), findsOneWidget);
    expect(find.text('RM 16.50'), findsNothing);

    await tester.tap(find.text('Add item'));
    await tester.pumpAndSettle();

    final cart = container.read(cartProvider);
    expect(cart.items, hasLength(1));
    expect(cart.items.single.selectedModifiers.map((m) => m.id), [
      'modifier-beef',
    ]);
    expect(find.text('Protein Krapow'), findsNothing);
  });

  testWidgets('multi-select modifier stops at max and explains why', (
    tester,
  ) async {
    final extrasGroup = _group(
      id: 'group-extras',
      name: 'Extras',
      maxSelections: 2,
    );
    final preview = _previewWithGroups(
      id: 'extras-krapow',
      name: 'Extras Krapow',
      priceCents: 1450,
      groups: [
        ModifierGroupWithModifiers(
          group: extrasGroup,
          isRequired: false,
          modifiers: [
            _modifier(
              groupId: extrasGroup.id,
              id: 'modifier-egg',
              name: 'Fried Egg',
              priceDeltaCents: 100,
            ),
            _modifier(
              groupId: extrasGroup.id,
              id: 'modifier-basil',
              name: 'Extra Basil',
              priceDeltaCents: 200,
            ),
            _modifier(
              groupId: extrasGroup.id,
              id: 'modifier-prawn',
              name: 'Prawn',
              priceDeltaCents: 400,
            ),
          ],
        ),
      ],
    );

    await _pumpHost(
      tester,
      openLabel: 'Open extras',
      onOpen: (context) =>
          showItemQuickView(context, 'extras-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider(
          'extras-krapow',
        ).overrideWith((ref) async => null),
        promoPreviewProvider('extras-krapow').overrideWith((ref) async => null),
      ],
    );

    await tester.tap(find.text('Open extras'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Fried Egg'));
    await tester.tap(find.text('Fried Egg'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Extra Basil'));
    await tester.pumpAndSettle();
    expect(find.text('RM 17.50'), findsOneWidget);

    await tester.tap(find.text('Prawn'));
    await tester.pumpAndSettle();

    expect(find.text('RM 17.50'), findsOneWidget);
    expect(find.text('RM 21.50'), findsNothing);
    expect(
      find.text('You can choose up to 2 options from Extras'),
      findsOneWidget,
    );
  });

  testWidgets('missing required options keeps the CTA tappable and explains', (
    tester,
  ) async {
    final spiceGroup = _group(
      id: 'group-required',
      name: 'Spice Level',
      isRequired: true,
      maxSelections: 1,
    );
    final preview = _previewWithGroups(
      id: 'required-krapow',
      name: 'Required Krapow',
      priceCents: 1450,
      groups: [
        ModifierGroupWithModifiers(
          group: spiceGroup,
          modifiers: [
            _modifier(groupId: spiceGroup.id, id: 'modifier-hot', name: 'Hot'),
          ],
          isRequired: true,
        ),
      ],
    );

    final container = await _pumpHost(
      tester,
      openLabel: 'Open required',
      onOpen: (context) =>
          showItemQuickView(context, 'required-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider(
          'required-krapow',
        ).overrideWith((ref) async => null),
        promoPreviewProvider(
          'required-krapow',
        ).overrideWith((ref) async => null),
      ],
    );

    await tester.tap(find.text('Open required'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Select options (1)'));
    await tester.pumpAndSettle();

    expect(container.read(cartProvider).items, isEmpty);
    expect(find.text('Select 1 more from Spice Level'), findsOneWidget);
  });

  testWidgets('tapping the CTA scrolls an off-screen required group into view', (
    tester,
  ) async {
    final extrasGroup = _group(id: 'group-filler', name: 'Extras');
    final spiceGroup = _group(
      id: 'group-below-fold',
      name: 'Spice Level',
      isRequired: true,
      maxSelections: 1,
    );
    final preview = _previewWithGroups(
      id: 'scroll-krapow',
      name: 'Scroll Krapow',
      priceCents: 1450,
      groups: [
        ModifierGroupWithModifiers(
          group: extrasGroup,
          isRequired: false,
          modifiers: [
            for (var i = 1; i <= 10; i++)
              _modifier(
                groupId: extrasGroup.id,
                id: 'modifier-extra-$i',
                name: 'Extra $i',
              ),
          ],
        ),
        ModifierGroupWithModifiers(
          group: spiceGroup,
          isRequired: true,
          modifiers: [
            _modifier(groupId: spiceGroup.id, id: 'modifier-hot', name: 'Hot'),
          ],
        ),
      ],
    );

    final container = await _pumpHost(
      tester,
      openLabel: 'Open scroll',
      onOpen: (context) =>
          showItemQuickView(context, 'scroll-krapow', preview: preview),
      overrides: [
        menuItemDetailProvider(
          'scroll-krapow',
        ).overrideWith((ref) async => null),
        promoPreviewProvider(
          'scroll-krapow',
        ).overrideWith((ref) async => null),
      ],
    );

    await tester.tap(find.text('Open scroll'));
    await tester.pumpAndSettle();

    // The sheet's viewport Scrollable — the multiline instructions TextField
    // deeper inside the scroll view contributes its own vertical Scrollable,
    // so take the first (the viewport itself) in tree order.
    final scrollable = tester.state<ScrollableState>(
      find
          .descendant(
            of: find.byType(CustomScrollView),
            matching: find.byWidgetPredicate(
              (widget) => widget is Scrollable && widget.axis == Axis.vertical,
            ),
          )
          .first,
    );
    // The required group sits below the fold (sheet caps at 852*0.92 ≈ 784
    // and the footer occupies ~76 of that); the sheet opens at the top.
    expect(tester.getTopLeft(find.text('Spice Level')).dy, greaterThan(780));
    expect(scrollable.position.pixels, 0);

    await tester.tap(find.text('Select options (1)'));
    await tester.pumpAndSettle();

    // The reveal scrolls the sheet to the unsatisfied group instead of only
    // showing the SnackBar.
    expect(scrollable.position.pixels, greaterThan(0));
    expect(find.text('Spice Level'), findsOneWidget);
    expect(find.text('Select 1 more from Spice Level'), findsOneWidget);
    expect(container.read(cartProvider).items, isEmpty);
  });
}

Future<ProviderContainer> _pumpHost(
  WidgetTester tester, {
  required String openLabel,
  required void Function(BuildContext context) onOpen,
  required List<Override> overrides,
}) async {
  tester.view.physicalSize = const Size(393, 852);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.darkTheme,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => onOpen(context),
                child: Text(openLabel),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  return ProviderScope.containerOf(tester.element(find.text(openLabel)));
}

MenuItemWithModifiers _previewWithGroups({
  required String id,
  required String name,
  String? description,
  int priceCents = 1450,
  List<ModifierGroupWithModifiers> groups = const [],
}) {
  return MenuItemWithModifiers(
    item: testMenuItem(
      id: id,
      categoryId: 'category-mains',
      name: name,
      description: description,
      priceCents: priceCents,
    ),
    hasModifiers: groups.isNotEmpty,
    modifierGroups: groups,
  );
}

ModifierGroupsRow _group({
  required String id,
  required String name,
  bool isRequired = false,
  int minSelections = 0,
  int maxSelections = 1,
}) {
  return ModifierGroupsRow.fromJson({
    'id': id,
    'name': name,
    'description': null,
    'min_selections': minSelections,
    'max_selections': maxSelections,
    'sort_order': 0,
  });
}

ModifiersRow _modifier({
  required String groupId,
  required String id,
  required String name,
  int priceDeltaCents = 0,
  bool isAvailable = true,
}) {
  return ModifiersRow.fromJson({
    'id': id,
    'modifier_group_id': groupId,
    'name': name,
    'price_delta_cents': priceDeltaCents,
    'is_available': isAvailable,
    'sort_order': 0,
  });
}
