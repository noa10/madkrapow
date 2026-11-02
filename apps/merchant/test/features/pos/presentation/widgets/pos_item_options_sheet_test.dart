import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_item_options_sheet.dart';

PosMenuItem _item() {
  return const PosMenuItem(
    id: 'm1',
    name: 'Nasi Goreng',
    description: 'Wok-fried rice',
    imageUrl: null,
    priceCents: 1250,
    isAvailable: true,
    categoryId: 'c1',
    sortOrder: 0,
  );
}

PosModifierGroup _spiceGroup({bool required = true}) {
  return PosModifierGroup(
    id: 'g-spice',
    name: 'Spice level',
    minSelections: required ? 1 : 0,
    maxSelections: 1,
    isRequired: required,
    modifiers: const [
      PosModifier(
        id: 'mod-mild',
        name: 'Mild',
        priceDeltaCents: 0,
        modifierGroupId: 'g-spice',
        sortOrder: 0,
      ),
      PosModifier(
        id: 'mod-extra',
        name: 'Extra spicy',
        priceDeltaCents: 200,
        modifierGroupId: 'g-spice',
        sortOrder: 1,
      ),
    ],
  );
}

Future<Future<PosItemOptionsResult?> Function()> _pump(
  WidgetTester tester, {
  required List<PosModifierGroup> groups,
}) async {
  Future<PosItemOptionsResult?>? result;

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () {
                result = showPosItemOptionsSheet(
                  context,
                  item: _item(),
                  groups: groups,
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();

  return () async => result!;
}

void main() {
  testWidgets('modifier selection is exposed to screen readers', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await _pump(tester, groups: [_spiceGroup()]);
    expect(
      tester.getSemantics(find.text('Mild')),
      isSemantics(label: 'Mild', hasCheckedState: true, isChecked: false),
    );
    await tester.tap(find.text('Mild'));
    await tester.pump();
    expect(
      tester.getSemantics(find.text('Mild')),
      isSemantics(label: 'Mild', hasCheckedState: true, isChecked: true),
    );
    semantics.dispose();
  });

  testWidgets('disables adding until a required group is satisfied', (
    tester,
  ) async {
    await _pump(tester, groups: [_spiceGroup()]);

    expect(find.text('Choose required options'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Choose required options'),
    );
    expect(button.onPressed, isNull);
  });

  testWidgets('enables adding and returns the selected add-ons', (
    tester,
  ) async {
    final readResult = await _pump(tester, groups: [_spiceGroup()]);

    await tester.tap(find.text('Extra spicy'));
    await tester.pump();
    expect(find.text('Add 1 · RM 14.50'), findsOneWidget);

    await tester.tap(find.text('Add 1 · RM 14.50'));
    await tester.pumpAndSettle();

    final result = await readResult();
    expect(result, isNotNull);
    expect(result!.quantity, 1);
    expect(result.modifiers.single.id, 'mod-extra');
    expect(result.modifiers.single.priceDeltaCents, 200);
    expect(result.notes, isEmpty);
  });

  testWidgets('quantity stepper multiplies the shown total', (tester) async {
    await _pump(tester, groups: [_spiceGroup()]);

    await tester.tap(find.text('Mild'));
    await tester.pump();
    await tester.tap(find.byTooltip('Increase quantity'));
    await tester.pump();

    expect(find.text('Add 2 · RM 25.00'), findsOneWidget);
  });

  testWidgets('carries a trimmed special instruction into the result', (
    tester,
  ) async {
    final readResult = await _pump(tester, groups: [_spiceGroup()]);

    await tester.tap(find.text('Mild'));
    await tester.pump();
    await tester.enterText(find.byType(TextField), '  no onions  ');
    await tester.tap(find.text('Add 1 · RM 12.50'));
    await tester.pumpAndSettle();

    final result = await readResult();
    expect(result!.notes, 'no onions');
  });

  testWidgets('caps a multi-choice group at its maximum', (tester) async {
    final readResult = await _pump(
      tester,
      groups: [
        const PosModifierGroup(
          id: 'g-sides',
          name: 'Add sides',
          minSelections: 0,
          maxSelections: 2,
          isRequired: false,
          modifiers: [
            PosModifier(
              id: 'mod-1',
              name: 'Egg',
              priceDeltaCents: 100,
              modifierGroupId: 'g-sides',
              sortOrder: 0,
            ),
            PosModifier(
              id: 'mod-2',
              name: 'Sausage',
              priceDeltaCents: 200,
              modifierGroupId: 'g-sides',
              sortOrder: 1,
            ),
            PosModifier(
              id: 'mod-3',
              name: 'Rice',
              priceDeltaCents: 150,
              modifierGroupId: 'g-sides',
              sortOrder: 2,
            ),
          ],
        ),
      ],
    );

    await tester.tap(find.text('Egg'));
    await tester.tap(find.text('Sausage'));
    await tester.tap(find.text('Rice'));
    await tester.pump();

    await tester.tap(find.textContaining('Add 1'));
    await tester.pumpAndSettle();

    final result = await readResult();
    expect(result!.modifiers.map((modifier) => modifier.name), [
      'Egg',
      'Sausage',
    ]);
  });

  testWidgets('allows a plain dish to be added without choices', (
    tester,
  ) async {
    final readResult = await _pump(tester, groups: const []);

    await tester.tap(find.text('Add 1 · RM 12.50'));
    await tester.pumpAndSettle();

    final result = await readResult();
    expect(result!.modifiers, isEmpty);
  });

  testWidgets('caps a single add at the menu quantity limit', (tester) async {
    await _pump(tester, groups: const []);

    for (var i = 0; i < 9; i++) {
      await tester.tap(find.byTooltip('Increase quantity'));
      await tester.pump();
    }

    expect(find.text('10'), findsOneWidget);
    expect(find.text('Add 10 · RM 125.00'), findsOneWidget);
    final increase = tester.widget<IconButton>(
      find.widgetWithIcon(IconButton, Icons.add),
    );
    expect(increase.onPressed, isNull);
  });

  testWidgets('floors a discount larger than the dish at zero', (tester) async {
    await _pump(
      tester,
      groups: [
        const PosModifierGroup(
          id: 'g-discount',
          name: 'Promo',
          minSelections: 0,
          maxSelections: 1,
          isRequired: false,
          modifiers: [
            PosModifier(
              id: 'mod-discount',
              name: 'RM 20 off',
              priceDeltaCents: -2000,
              modifierGroupId: 'g-discount',
              sortOrder: 0,
            ),
          ],
        ),
      ],
    );

    await tester.tap(find.text('RM 20 off'));
    await tester.pump();

    // The cart and the server both floor the unit, so the sheet must too.
    expect(find.text('Add 1 · RM 0.00'), findsOneWidget);
  });
}
