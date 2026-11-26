import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_repository.dart';
import 'package:madkrapow_merchant/features/menu/presentation/widgets/modifier_bindings_editor.dart';
import 'package:madkrapow_merchant/features/menu/providers/menu_providers.dart';
import 'package:madkrapow_merchant/generated/database.dart';

const groupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

class BindingFake extends Fake implements MenuRepository {
  String? savedItemId;
  List<Map<String, dynamic>>? savedBindings;

  @override
  Future<List<MenuItemModifierGroupsRow>> batchUpdateModifierBindings({
    required String menuItemId,
    required List<Map<String, dynamic>> bindings,
  }) async {
    savedItemId = menuItemId;
    savedBindings = bindings;
    return <MenuItemModifierGroupsRow>[];
  }
}

void main() {
  testWidgets('resets selections when the edited menu item changes', (
    tester,
  ) async {
    final repo = BindingFake();
    final itemId = ValueNotifier<String>('item-1');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          menuRepositoryProvider.overrideWithValue(repo),
          modifierGroupsProvider.overrideWith(
            (ref) async => [
              ModifierGroupsRow(
                id: groupId,
                name: 'Sides',
                minSelections: 0,
                maxSelections: 3,
              ),
            ],
          ),
          modifierBindingsForItemProvider.overrideWith(
            (ref, id) async => id == 'item-1'
                ? [
                    MenuItemModifierGroupsRow(
                      menuItemId: id,
                      modifierGroupId: groupId,
                      isRequired: true,
                    ),
                  ]
                : <MenuItemModifierGroupsRow>[],
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                ValueListenableBuilder<String>(
                  valueListenable: itemId,
                  builder: (context, id, child) => TextButton(
                    onPressed: () => itemId.value = 'item-2',
                    child: const Text('switch item'),
                  ),
                ),
                ValueListenableBuilder<String>(
                  valueListenable: itemId,
                  builder: (context, id, child) =>
                      ModifierBindingsEditor(menuItemId: id, onSaved: () {}),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.widget<Checkbox>(find.byType(Checkbox)).value, isTrue);

    await tester.tap(find.text('switch item'));
    await tester.pumpAndSettle();

    expect(tester.widget<Checkbox>(find.byType(Checkbox)).value, isFalse);

    await tester.tap(find.text('Save Bindings'));
    await tester.pumpAndSettle();

    expect(repo.savedItemId, 'item-2');
    expect(repo.savedBindings, isEmpty);
  });
}
