import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_order_repository.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/kitchen_order_card.dart';
import 'package:madkrapow_merchant/generated/tables/order_item_modifiers.dart';
import 'package:madkrapow_merchant/generated/tables/order_items.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';

const _createdAt = '2026-10-17T19:42:00';
final _now = DateTime(2026, 10, 17, 19, 54); // 12 minutes after _createdAt

void main() {
  group('ticketAge', () {
    final created = DateTime(2026, 10, 17, 12, 0);

    test('is fresh below 15 minutes', () {
      expect(
        ticketAge(created, created.add(const Duration(minutes: 14))),
        TicketAge.fresh,
      );
    });

    test('is aging at 15 minutes', () {
      expect(
        ticketAge(created, created.add(const Duration(minutes: 15))),
        TicketAge.aging,
      );
    });

    test('is aging at 24 minutes', () {
      expect(
        ticketAge(created, created.add(const Duration(minutes: 24))),
        TicketAge.aging,
      );
    });

    test('is overdue at 25 minutes', () {
      expect(
        ticketAge(created, created.add(const Duration(minutes: 25))),
        TicketAge.overdue,
      );
    });
  });

  group('KitchenOrderCard', () {
    testWidgets('renders the stored display code, not the raw uuid', (
      tester,
    ) async {
      await _pump(
        tester,
        order: _order(
          id: 'a3f9c1e2-4b7d-4f1a-9c3e-8d2b5a7f0e11',
          displayCode: 'MK-042',
        ),
      );

      expect(find.text('MK-042'), findsOneWidget);
      expect(find.textContaining('a3f9c1e2'), findsNothing);
    });

    testWidgets('falls back to a generated code when none is stored', (
      tester,
    ) async {
      await _pump(tester, order: _order(displayCode: null));

      expect(find.textContaining('MK-'), findsOneWidget);
    });

    testWidgets('renders every item with its quantity and name', (
      tester,
    ) async {
      await _pump(
        tester,
        items: [
          _item(name: 'Nasi Goreng', quantity: 2, lineTotalCents: 2400),
          _item(name: 'Tom Yam', quantity: 1),
        ],
      );

      expect(find.text('Nasi Goreng'), findsOneWidget);
      expect(find.text('2x'), findsOneWidget);
      expect(find.text('Tom Yam'), findsOneWidget);
      expect(find.text('1x'), findsOneWidget);
    });

    testWidgets('renders addons beneath their item', (tester) async {
      await _pump(
        tester,
        items: [
          _item(
            name: 'Nasi Goreng',
            addons: ['Extra Spicy', 'Add Egg'],
          ),
        ],
      );

      expect(find.text('Extra Spicy'), findsOneWidget);
      expect(find.text('Add Egg'), findsOneWidget);
    });

    testWidgets('renders item notes', (tester) async {
      await _pump(
        tester,
        items: [_item(name: 'Nasi Goreng', notes: 'Less oil please')],
      );

      expect(find.text('Note: Less oil please'), findsOneWidget);
    });

    testWidgets('renders the order-level note', (tester) async {
      await _pump(
        tester,
        order: _order(notes: 'allergy peanuts'),
      );

      expect(find.textContaining('allergy peanuts'), findsOneWidget);
    });

    testWidgets('omits the order note when there is none', (tester) async {
      await _pump(tester, order: _order(notes: null));

      expect(find.byIcon(Icons.sticky_note_2_outlined), findsNothing);
    });

    testWidgets('omits per-item prices but keeps the order total', (
      tester,
    ) async {
      await _pump(
        tester,
        items: [
          _item(
            name: 'Nasi Goreng',
            quantity: 2,
            unitPriceCents: 1200,
            lineTotalCents: 2400,
          ),
        ],
      );

      expect(find.text('RM 12.00'), findsNothing); // unit price
      expect(find.text('RM 24.00'), findsNothing); // line total
      expect(find.text('RM 131.00'), findsOneWidget); // order total
    });

    testWidgets('does not inflate the total by the delivery fee', (
      tester,
    ) async {
      await _pump(
        tester,
        order: _order(
          subtotalCents: 12600,
          deliveryFeeCents: 500,
          totalCents: 13100,
        ),
      );

      // total_cents already includes delivery_fee_cents
      expect(find.text('RM 131.00'), findsOneWidget);
      expect(find.text('RM 136.00'), findsNothing);
    });

    testWidgets('shows the delivery address for delivery orders', (
      tester,
    ) async {
      await _pump(tester, order: _order(deliveryType: 'delivery'));

      expect(find.text('Delivery Address'), findsOneWidget);
      expect(
        find.text('12 Jalan Ampang, Kuala Lumpur, WP'),
        findsOneWidget,
      );
    });

    testWidgets('hides the address for pickup orders', (tester) async {
      await _pump(tester, order: _order(deliveryType: 'pickup'));

      expect(find.text('Delivery Address'), findsNothing);
      expect(find.textContaining('Jalan Ampang'), findsNothing);
      expect(find.text('No address'), findsNothing);
    });

    testWidgets('shows the cutlery badge when cutlery is requested', (
      tester,
    ) async {
      await _pump(tester, order: _order(includeCutlery: true));

      expect(find.byIcon(Icons.flatware), findsOneWidget);
    });

    testWidgets('hides the cutlery badge when cutlery is not requested', (
      tester,
    ) async {
      await _pump(tester, order: _order(includeCutlery: false));

      expect(find.byIcon(Icons.flatware), findsNothing);
    });

    testWidgets('shows the clock time and the elapsed time', (tester) async {
      await _pump(tester);

      expect(find.text('7:42 PM'), findsOneWidget);
      expect(find.text('12 min ago'), findsOneWidget);
    });

    testWidgets('tints the elapsed time differently as the ticket ages', (
      tester,
    ) async {
      final fresh = await _elapsedColor(tester, minutes: 5);
      final aging = await _elapsedColor(tester, minutes: 20);
      final overdue = await _elapsedColor(tester, minutes: 40);

      expect(fresh, isNot(aging));
      expect(aging, isNot(overdue));
      expect(fresh, isNot(overdue));
    });

    testWidgets('shows a placeholder when the order has no items', (
      tester,
    ) async {
      await _pump(tester, items: []);

      expect(find.text('No items recorded'), findsOneWidget);
    });

    testWidgets('invokes onMarkReady when the button is tapped', (
      tester,
    ) async {
      var tapped = 0;
      await _pump(tester, onMarkReady: () => tapped++);

      await tester.ensureVisible(find.text('Mark Ready'));
      await tester.tap(find.text('Mark Ready'));
      await tester.pump();

      expect(tapped, 1);
    });

    testWidgets('hides the button when no callback is given', (tester) async {
      await _pump(tester, allowAction: false);

      expect(find.text('Mark Ready'), findsNothing);
    });

    testWidgets(
      'shows every item and addon at the narrowest column width',
      (tester) async {
        // 320px is the tightest column the board produces (three columns on a
        // ~1024px tablet). Nothing may be clipped or scrolled out of sight.
        const itemCount = 10;
        final longOrder = [
          for (var i = 0; i < itemCount; i++)
            _item(
              name: 'Pad Thai with Extra Noodles $i',
              quantity: i + 1,
              addons: ['Addon Alpha $i', 'Addon Bravo $i'],
              notes: 'Note number $i',
            ),
        ];

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: Wrap(
                  children: [
                    SizedBox(
                      width: 320,
                      child: KitchenOrderCard(
                        order: _order(notes: 'allergy peanuts'),
                        items: longOrder,
                        now: _now,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

        for (var i = 0; i < itemCount; i++) {
          expect(find.text('Pad Thai with Extra Noodles $i'), findsOneWidget);
          expect(find.text('Addon Alpha $i'), findsOneWidget);
          expect(find.text('Addon Bravo $i'), findsOneWidget);
          expect(find.text('Note: Note number $i'), findsOneWidget);
        }
        expect(find.textContaining('allergy peanuts'), findsOneWidget);
        expect(find.text('RM 131.00'), findsOneWidget);

        // find.text locates built-but-clipped widgets, so the assertions above
        // would also pass on the old design. These two are what actually pin
        // "nothing is hidden": no scroll container inside the card (which is
        // how the old fixed-aspect layout clipped content), and a card that
        // grew past the old 320 / 0.75 ≈ 427px grid box instead of being capped.
        expect(
          find.descendant(
            of: find.byType(KitchenOrderCard),
            matching: find.byType(Scrollable),
          ),
          findsNothing,
        );
        expect(
          tester.getSize(find.byType(KitchenOrderCard)).height,
          greaterThan(320 / 0.75),
        );

        // The last line is reachable by scrolling the page itself.
        await tester.ensureVisible(find.text('Pad Thai with Extra Noodles 9'));
        await tester.pumpAndSettle();
        expect(
          find.text('Pad Thai with Extra Noodles 9').hitTestable(),
          findsOneWidget,
        );
      },
    );
  });
}

Future<void> _pump(
  WidgetTester tester, {
  OrdersRow? order,
  List<OrderItemWithModifiers>? items,
  VoidCallback? onMarkReady,
  bool allowAction = true,
  DateTime? now,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: KitchenOrderCard(
            order: order ?? _order(),
            items: items ?? [_item(name: 'Nasi Goreng')],
            onMarkReady: allowAction ? (onMarkReady ?? () {}) : null,
            now: now ?? _now,
          ),
        ),
      ),
    ),
  );
}

/// Renders a card for a ticket [minutes] old and returns the elapsed label's
/// colour, so the age tint can be compared across buckets.
Future<Color> _elapsedColor(WidgetTester tester, {required int minutes}) async {
  final now = DateTime(2026, 10, 17, 19, 42).add(Duration(minutes: minutes));
  await _pump(tester, now: now);

  final label = tester.widget<Text>(
    find.byWidgetPredicate(
      (w) => w is Text && (w.data?.endsWith('ago') ?? false),
    ),
  );
  return label.style!.color!;
}

OrdersRow _order({
  String id = 'o1',
  String? displayCode = 'MK-042',
  String status = 'preparing',
  String deliveryType = 'delivery',
  bool includeCutlery = true,
  String? notes,
  int subtotalCents = 12600,
  int deliveryFeeCents = 500,
  int totalCents = 13100,
}) {
  return OrdersRow.fromJson({
    'id': id,
    'order_number': 'TEST001',
    'status': status,
    'subtotal_cents': subtotalCents,
    'delivery_fee_cents': deliveryFeeCents,
    'discount_cents': 0,
    'total_cents': totalCents,
    'created_at': _createdAt,
    'updated_at': _createdAt,
    'customer_name': 'Ahmad',
    'customer_phone': '012-3456789',
    'delivery_type': deliveryType,
    'fulfillment_type': 'asap',
    'order_kind': 'standard',
    'dispatch_status': 'not_ready',
    'approval_status': 'auto_approved',
    'hubbo_pos_sync_status': 'pending',
    'requires_manual_review': false,
    'include_cutlery': includeCutlery,
    'display_code': ?displayCode,
    'notes': ?notes,
    'delivery_address_json': {
      'address_line1': '12 Jalan Ampang',
      'city': 'Kuala Lumpur',
      'state': 'WP',
    },
  });
}

OrderItemWithModifiers _item({
  required String name,
  int quantity = 1,
  int unitPriceCents = 1200,
  int lineTotalCents = 1200,
  String? notes,
  List<String> addons = const [],
}) {
  final item = OrderItemsRow(
    id: 'i-$name',
    orderId: 'o1',
    menuItemId: 'menu-$name',
    menuItemName: name,
    menuItemPriceCents: unitPriceCents,
    lineTotalCents: lineTotalCents,
    quantity: quantity,
    notes: notes,
  );

  return OrderItemWithModifiers(
    item: item,
    modifiers: [
      for (final addon in addons)
        OrderItemModifiersRow(
          orderItemId: 'i-$name',
          modifierId: 'mod-$addon',
          modifierName: addon,
        ),
    ],
  );
}
