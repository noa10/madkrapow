import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/data/pos_repository.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_menu_panel.dart';

PosMenuData _menu() {
  const categories = [
    PosCategory(id: 'c1', name: 'Cat 1', sortOrder: 1),
    PosCategory(id: 'c2', name: 'Cat 2', sortOrder: 2),
    PosCategory(id: 'c3', name: 'Cat 3', sortOrder: 3),
    PosCategory(id: 'c4', name: 'Cat 4', sortOrder: 4),
  ];
  return PosMenuData(
    categories: categories,
    menuItems: [
      for (final category in categories)
        PosMenuItem(
          id: '${category.id}-item',
          name: '${category.name} dish',
          description: null,
          imageUrl: null,
          priceCents: 1000,
          isAvailable: true,
          categoryId: category.id,
          sortOrder: 0,
        ),
    ],
    modifierGroupsByItem: const {},
  );
}

void main() {
  testWidgets('category rail scrolls to a section that starts off screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 420);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 400,
            height: 420,
            child: PosMenuPanel(data: _menu(), onSelect: (_) {}),
          ),
        ),
      ),
    );

    // The vertical menu scroll view holds every section eagerly; the lazy
    // alternative leaves the far section's GlobalKey without a context and
    // the rail tap below would silently do nothing.
    final scrollable = find
        .descendant(
          of: find.byType(SingleChildScrollView),
          matching: find.byType(Scrollable),
        )
        .first;
    expect(tester.state<ScrollableState>(scrollable).position.pixels, 0);

    await tester.tap(
      find.descendant(of: find.byType(ListView), matching: find.text('Cat 4')),
    );
    await tester.pumpAndSettle();

    expect(
      tester.state<ScrollableState>(scrollable).position.pixels,
      greaterThan(0),
    );
    // Section headers are rendered through PosLabel, which uppercases them.
    final header = find.descendant(
      of: find.byType(SingleChildScrollView),
      matching: find.text('CAT 4'),
    );
    expect(tester.getTopLeft(header).dy, lessThan(420));
  });
}
