import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_order_repository.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/order_item_card.dart';
import 'package:madkrapow_merchant/generated/tables/order_items.dart';
import 'package:madkrapow_merchant/generated/tables/order_item_modifiers.dart';

void main() {
  group('OrderItemCard', () {
    testWidgets('displays main item name, quantity and line total',
        (tester) async {
      final item = _makeItem(
        menuItemName: 'Pad Krapow',
        quantity: 2,
        menuItemPriceCents: 1200,
        lineTotalCents: 2400,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OrderItemCard(
              itemWithModifiers: OrderItemWithModifiers(
                item: item,
                modifiers: [],
              ),
            ),
          ),
        ),
      );

      expect(find.text('Pad Krapow'), findsOneWidget);
      expect(find.text('2x'), findsOneWidget);
      expect(find.text('RM 12.00'), findsOneWidget); // unit price
      expect(find.text('RM 24.00'), findsOneWidget); // line total
    });

    testWidgets('displays modifiers with names and price deltas',
        (tester) async {
      final item = _makeItem(
        menuItemName: 'Pad Krapow',
        quantity: 1,
        menuItemPriceCents: 1200,
        lineTotalCents: 1500,
      );
      final modifiers = [
        _makeModifier(
          orderItemId: item.id,
          modifierName: 'Extra Spicy',
          modifierPriceDeltaCents: 100,
        ),
        _makeModifier(
          orderItemId: item.id,
          modifierName: 'Add Egg',
          modifierPriceDeltaCents: 200,
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OrderItemCard(
              itemWithModifiers: OrderItemWithModifiers(
                item: item,
                modifiers: modifiers,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Extra Spicy'), findsOneWidget);
      expect(find.text('+ RM 1.00'), findsOneWidget);
      expect(find.text('Add Egg'), findsOneWidget);
      expect(find.text('+ RM 2.00'), findsOneWidget);
    });

    testWidgets('displays modifier name without price when delta is zero',
        (tester) async {
      final item = _makeItem(
        menuItemName: 'Pad Krapow',
        quantity: 1,
        menuItemPriceCents: 1200,
        lineTotalCents: 1200,
      );
      final modifiers = [
        _makeModifier(
          orderItemId: item.id,
          modifierName: 'Normal Spicy',
          modifierPriceDeltaCents: 0,
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OrderItemCard(
              itemWithModifiers: OrderItemWithModifiers(
                item: item,
                modifiers: modifiers,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Normal Spicy'), findsOneWidget);
      expect(find.text('+ RM 0.00'), findsNothing);
    });

    testWidgets('displays notes when present', (tester) async {
      final item = _makeItem(
        menuItemName: 'Pad Krapow',
        quantity: 1,
        menuItemPriceCents: 1200,
        lineTotalCents: 1200,
        notes: 'Less oil please',
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OrderItemCard(
              itemWithModifiers: OrderItemWithModifiers(
                item: item,
                modifiers: [],
              ),
            ),
          ),
        ),
      );

      expect(find.text('Note: Less oil please'), findsOneWidget);
    });

    testWidgets('does not display notes section when notes are null',
        (tester) async {
      final item = _makeItem(
        menuItemName: 'Pad Krapow',
        quantity: 1,
        menuItemPriceCents: 1200,
        lineTotalCents: 1200,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OrderItemCard(
              itemWithModifiers: OrderItemWithModifiers(
                item: item,
                modifiers: [],
              ),
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.notes_outlined), findsNothing);
    });

    testWidgets('does not display modifier section when no modifiers',
        (tester) async {
      final item = _makeItem(
        menuItemName: 'Pad Krapow',
        quantity: 1,
        menuItemPriceCents: 1200,
        lineTotalCents: 1200,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OrderItemCard(
              itemWithModifiers: OrderItemWithModifiers(
                item: item,
                modifiers: [],
              ),
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.add_circle_outline), findsNothing);
    });
  });
}

OrderItemsRow _makeItem({
  required String menuItemName,
  required int quantity,
  required int menuItemPriceCents,
  required int lineTotalCents,
  String? notes,
}) {
  return OrderItemsRow(
    orderId: 'order-1',
    menuItemId: 'menu-1',
    menuItemName: menuItemName,
    menuItemPriceCents: menuItemPriceCents,
    lineTotalCents: lineTotalCents,
    quantity: quantity,
    notes: notes,
  );
}

OrderItemModifiersRow _makeModifier({
  required String orderItemId,
  required String modifierName,
  int modifierPriceDeltaCents = 0,
}) {
  return OrderItemModifiersRow(
    orderItemId: orderItemId,
    modifierId: 'mod-${modifierName.hashCode}',
    modifierName: modifierName,
    modifierPriceDeltaCents: modifierPriceDeltaCents,
  );
}
