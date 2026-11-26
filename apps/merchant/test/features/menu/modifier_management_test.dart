import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_repository.dart';
import 'package:madkrapow_merchant/features/menu/presentation/screens/modifier_management_screen.dart';
import 'package:madkrapow_merchant/features/menu/providers/menu_providers.dart';
import 'package:madkrapow_merchant/generated/database.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class GroupFake extends Fake implements MenuRepository {
  int creates = 0;
  ModifierGroupsRow? created;

  @override
  Future<ModifierGroupsRow> createModifierGroup(ModifierGroupsRow group) async {
    creates++;
    created = group;
    return ModifierGroupsRow(
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: group.name,
      description: group.description,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      sortOrder: group.sortOrder,
    );
  }
}

class ModifierFake extends Fake implements MenuRepository {
  int creates = 0;
  int grabSaves = 0;
  ModifiersRow? created;
  int? grabPrice;
  int? expectedPrice;
  bool? expectedExists;

  @override
  Future<ModifiersRow> createModifier(ModifiersRow modifier) async {
    creates++;
    created = modifier;
    return ModifiersRow(
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      name: modifier.name,
      modifierGroupId: modifier.modifierGroupId,
      priceDeltaCents: modifier.priceDeltaCents,
      isDefault: modifier.isDefault,
      isAvailable: modifier.isAvailable,
      sortOrder: modifier.sortOrder,
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
    grabSaves++;
    grabPrice = priceCents;
    expectedPrice = expectedPriceCents;
    this.expectedExists = expectedExists;
    return {};
  }
}

Widget app(GroupFake repo) => ProviderScope(
  overrides: [
    menuRepositoryProvider.overrideWithValue(repo),
    modifierGroupsProvider.overrideWith((ref) async => <ModifierGroupsRow>[]),
  ],
  child: const MaterialApp(home: ModifierManagementScreen()),
);

const groupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

Widget modifierApp(ModifierFake repo) => ProviderScope(
  overrides: [
    menuRepositoryProvider.overrideWithValue(repo),
    modifierGroupsProvider.overrideWith(
      (ref) async => [
        ModifierGroupsRow(id: groupId, name: 'Sides', maxSelections: 3),
      ],
    ),
    modifiersForGroupProvider.overrideWith((ref, id) async => <ModifiersRow>[]),
  ],
  child: const MaterialApp(home: ModifierManagementScreen()),
);

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      anonKey: 'test',
    );
  });

  testWidgets('group form saves description and minimum selections', (
    tester,
  ) async {
    final repo = GroupFake();
    await tester.pumpWidget(app(repo));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add Group'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Sides');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Description (optional)'),
      'Pick a side',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Min Selections'),
      '1',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Max Selections'),
      '3',
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(repo.creates, 1);
    expect(repo.created!.description, 'Pick a side');
    expect(repo.created!.minSelections, 1);
    expect(repo.created!.maxSelections, 3);
  });

  testWidgets('group form rejects a minimum above the maximum', (tester) async {
    final repo = GroupFake();
    await tester.pumpWidget(app(repo));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add Group'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Sides');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Min Selections'),
      '4',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Max Selections'),
      '2',
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    expect(repo.creates, 0);
    expect(
      find.text('Enter a minimum between 0 and the maximum'),
      findsOneWidget,
    );
  });

  testWidgets('modifier form saves default, availability and Grab price', (
    tester,
  ) async {
    final repo = ModifierFake();
    await tester.pumpWidget(modifierApp(repo));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Tab, 'Modifiers'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add Modifier'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Fries');
    await tester.tap(find.widgetWithText(SwitchListTile, 'Default'));
    await tester.tap(find.widgetWithText(SwitchListTile, 'Available'));
    await tester.enterText(
      find.widgetWithText(TextFormField, 'GrabFood price (optional)'),
      '12.50',
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();

    expect(repo.creates, 1);
    expect(repo.created!.isDefault, isTrue);
    expect(repo.created!.isAvailable, isFalse);
    expect(repo.grabSaves, 1);
    expect(repo.grabPrice, 1250);
    expect(repo.expectedPrice, isNull);
    expect(repo.expectedExists, isFalse);
  });

  testWidgets('resets the selected group when it disappears from the list', (
    tester,
  ) async {
    const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    final groupsState = StateProvider<List<ModifierGroupsRow>>(
      (ref) => [
        ModifierGroupsRow(id: firstId, name: 'First'),
        ModifierGroupsRow(id: secondId, name: 'Second'),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          menuRepositoryProvider.overrideWithValue(ModifierFake()),
          modifierGroupsProvider.overrideWith((ref) => ref.watch(groupsState)),
          modifiersForGroupProvider.overrideWith(
            (ref, id) async => <ModifiersRow>[],
          ),
        ],
        child: const MaterialApp(home: ModifierManagementScreen()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Tab, 'Modifiers'));
    await tester.pumpAndSettle();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(ModifierManagementScreen)),
    );
    container.read(groupsState.notifier).state = [
      ModifierGroupsRow(id: secondId, name: 'Second'),
    ];
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Second'), findsOneWidget);
  });
}
