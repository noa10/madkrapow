import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/order_list_tile.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

const _createdAt = '2026-10-17T19:42:00';

void main() {
  group('OrderListTile', () {
    testWidgets('renders the web-style card content', (tester) async {
      await _pump(tester, _order());

      expect(find.text('MK-042'), findsOneWidget);
      expect(find.text('Preparing'), findsOneWidget);
      expect(find.text('RM 131.00'), findsOneWidget);
      expect(find.text('Ahmad'), findsOneWidget);
      expect(find.text('Stripe'), findsOneWidget);
      expect(find.text('Pending Dispatch'), findsOneWidget);
      expect(find.text('Cutlery'), findsOneWidget);
      expect(find.text('17/10 7:42 PM'), findsOneWidget);
      expect(find.text('Mark as Ready'), findsOneWidget);

      final card = tester.widget<Material>(
        find
            .descendant(
              of: find.byType(OrderListTile),
              matching: find.byType(Material),
            )
            .first,
      );
      expect(card.shape, isA<RoundedRectangleBorder>());
    });

    testWidgets('hides the action when the order is already ready', (
      tester,
    ) async {
      await _pump(tester, _order(status: 'ready', includeCutlery: false));

      expect(find.text('Ready'), findsOneWidget);
      expect(find.text('Mark as Ready'), findsNothing);
      expect(find.text('Cutlery'), findsNothing);
    });
  });
}

Future<void> _pump(WidgetTester tester, OrdersRow order) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: SingleChildScrollView(child: OrderListTile(order: order)),
        ),
      ),
    ),
  );
}

OrdersRow _order({String status = 'preparing', bool includeCutlery = true}) {
  return OrdersRow.fromJson({
    'id': 'o1',
    'order_number': 'TEST001',
    'display_code': 'MK-042',
    'status': status,
    'subtotal_cents': 12600,
    'delivery_fee_cents': 500,
    'discount_cents': 0,
    'total_cents': 13100,
    'created_at': _createdAt,
    'updated_at': _createdAt,
    'customer_name': 'Ahmad',
    'customer_phone': '012-3456789',
    'delivery_type': 'delivery',
    'fulfillment_type': 'asap',
    'order_kind': 'standard',
    'dispatch_status': 'not_ready',
    'approval_status': 'auto_approved',
    'hubbo_pos_sync_status': 'pending',
    'requires_manual_review': false,
    'include_cutlery': includeCutlery,
    'stripe_payment_intent_id': 'pi_123',
  });
}
