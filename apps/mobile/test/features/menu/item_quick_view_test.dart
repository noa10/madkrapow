import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/menu/data/menu_repository.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/item_quick_view.dart';
import 'package:madkrapow_mobile/generated/tables/modifier_groups.dart';
import 'package:madkrapow_mobile/generated/tables/modifiers.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import 'menu_test_data.dart';

void main() {
  testWidgets('quick view opens over the root navigator and closes', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

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

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          menuItemDetailProvider(
            'signature-krapow',
          ).overrideWith((ref) async => item),
        ],
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () =>
                      showItemQuickView(context, 'signature-krapow'),
                  child: const Text('Open item'),
                ),
              ),
            ),
          ),
        ),
      ),
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
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final spiceGroup = ModifierGroupsRow.fromJson({
      'id': 'group-spice',
      'name': 'Spice Level',
      'description': 'Choose your preferred spice level',
      'min_selections': 1,
      'max_selections': 1,
      'sort_order': 1,
    });
    final preview = MenuItemWithModifiers(
      item: testMenuItem(
        id: 'preview-krapow',
        categoryId: 'category-mains',
        name: 'Preview Krapow',
        description: 'Rendered from data already loaded by Home.',
        priceCents: 1450,
      ),
      hasModifiers: true,
      modifierGroups: [
        ModifierGroupWithModifiers(
          group: spiceGroup,
          modifiers: [
            ModifiersRow.fromJson({
              'id': 'modifier-medium',
              'modifier_group_id': spiceGroup.id,
              'name': 'Medium',
              'price_delta_cents': 0,
              'is_available': true,
              'sort_order': 1,
            }),
          ],
          isRequired: true,
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showItemQuickView(
                    context,
                    'preview-krapow',
                    preview: preview,
                  ),
                  child: const Text('Open preview'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open preview'));
    await tester.pumpAndSettle();

    expect(find.text('Preview Krapow'), findsOneWidget);
    expect(find.text('Spice Level'), findsOneWidget);
    expect(find.text('Select options (1)'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    await tester.ensureVisible(find.text('Medium'));
    await tester.tap(find.text('Medium'));
    await tester.pumpAndSettle();

    expect(find.text('Add item'), findsOneWidget);
    expect(find.text('RM 14.50'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('quick view closes when dragged down from the top', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final preview = MenuItemWithModifiers(
      item: testMenuItem(
        id: 'drag-krapow',
        categoryId: 'category-mains',
        name: 'Drag Krapow',
        description: 'Drag the handle to dismiss.',
        priceCents: 1250,
      ),
      hasModifiers: false,
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showItemQuickView(
                    context,
                    'drag-krapow',
                    preview: preview,
                  ),
                  child: const Text('Open drag item'),
                ),
              ),
            ),
          ),
        ),
      ),
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
}
