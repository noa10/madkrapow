import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/menu_search_field.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

void main() {
  testWidgets('search field shows hint and clears through the X button', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);

    final changes = <String>[];
    var cleared = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: MenuSearchField(
              controller: controller,
              onChanged: changes.add,
              onClear: () => cleared = true,
            ),
          ),
        ),
      ),
    );

    expect(find.text('Search the menu'), findsOneWidget);
    expect(find.byTooltip('Clear search'), findsNothing);

    await tester.enterText(find.byType(TextField), 'kra');
    await tester.pump();

    expect(find.byTooltip('Clear search'), findsOneWidget);
    expect(changes, ['kra']);

    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();

    expect(controller.text, isEmpty);
    expect(changes.last, isEmpty);
    expect(cleared, isTrue);
    expect(find.byTooltip('Clear search'), findsNothing);
  });
}
