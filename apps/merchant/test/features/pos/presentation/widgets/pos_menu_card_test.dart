import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_menu_card.dart';

PosMenuItem _item({String? imageUrl, String? description}) {
  return PosMenuItem(
    id: 'm1',
    name: 'Nasi Goreng',
    description: description,
    imageUrl: imageUrl,
    priceCents: 1250,
    isAvailable: true,
    categoryId: 'c1',
    sortOrder: 0,
  );
}

Future<void> _pump(
  WidgetTester tester, {
  required PosMenuItem item,
  required bool hasModifiers,
  VoidCallback? onSelect,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 360,
            child: PosMenuCard(
              item: item,
              hasModifiers: hasModifiers,
              onSelect: onSelect ?? () {},
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('renders the dish name and formatted price', (tester) async {
    await _pump(tester, item: _item(), hasModifiers: false);

    expect(find.text('Nasi Goreng'), findsOneWidget);
    expect(find.text('RM 12.50'), findsOneWidget);
  });

  testWidgets('marks a customizable dish', (tester) async {
    await _pump(tester, item: _item(), hasModifiers: true);

    expect(find.text('Customizable'), findsOneWidget);
  });

  testWidgets('does not mark a plain dish', (tester) async {
    await _pump(tester, item: _item(), hasModifiers: false);

    expect(find.text('Customizable'), findsNothing);
  });

  testWidgets('shows the no-image placeholder when the dish has no photo', (
    tester,
  ) async {
    await _pump(tester, item: _item(), hasModifiers: false);

    expect(find.text('NO IMAGE'), findsOneWidget);
  });

  testWidgets('invokes onSelect when tapped', (tester) async {
    var taps = 0;
    await _pump(
      tester,
      item: _item(),
      hasModifiers: false,
      onSelect: () => taps++,
    );

    await tester.tap(find.byType(PosMenuCard));
    await tester.pump();

    expect(taps, 1);
  });
}
