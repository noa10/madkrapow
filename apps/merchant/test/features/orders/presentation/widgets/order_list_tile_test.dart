import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_api_client.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_order_repository.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/order_list_tile.dart';
import 'package:madkrapow_merchant/features/orders/providers/admin_order_providers.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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

    testWidgets('shows the GrabFood short number on the order card', (
      tester,
    ) async {
      final order = _order();
      order.setField('source', 'grabfood');
      order.setField('channel_orders', [
        {'channel': 'grabfood', 'external_order_number': 'GF-123'},
      ]);
      await _pump(tester, order);

      expect(find.text('GF-123'), findsOneWidget);
      expect(find.text('MK-042'), findsNothing);
      expect(order.id, 'o1');
      expect(order.orderNumber, 'TEST001');
    });

    testWidgets('hides the action when the order is already ready', (
      tester,
    ) async {
      await _pump(tester, _order(status: 'ready', includeCutlery: false));

      expect(find.text('Ready'), findsOneWidget);
      expect(find.text('Mark as Ready'), findsNothing);
      expect(find.text('Cutlery'), findsNothing);
    });

    testWidgets('offers Start Preparing on a paid order', (tester) async {
      await _pump(tester, _order(status: 'paid'));

      expect(find.text('Start Preparing'), findsOneWidget);
      expect(find.text('Mark as Ready'), findsNothing);
    });

    testWidgets('leaves the legacy accepted status without a forward action', (
      tester,
    ) async {
      // The canonical spec gives `accepted` no forward transition, so the row
      // must not offer one.
      await _pump(tester, _order(status: 'accepted'));

      expect(find.text('Start Preparing'), findsNothing);
      expect(find.text('Mark as Ready'), findsNothing);
    });

    testWidgets('hides the action outside the preparing tab', (tester) async {
      await _pump(tester, _order(status: 'preparing'), showAdvanceAction: false);

      expect(find.text('Mark as Ready'), findsNothing);
      expect(find.text('Start Preparing'), findsNothing);
    });

    testWidgets('shows the table, pax and dine-in badge for a POS ticket', (
      tester,
    ) async {
      await _pump(
        tester,
        _order(
          status: 'pending',
          deliveryType: 'dine_in',
          tableLabel: 'T4',
          pax: 3,
          paymentMethod: 'qr_pay',
          stripePaymentIntentId: null,
        ),
      );

      expect(find.text('Table T4 · 3 pax'), findsOneWidget);
      expect(find.text('Dine-in'), findsOneWidget);
      expect(find.text('Company QR'), findsOneWidget);
      expect(find.text('Awaiting'), findsNothing);
    });

    testWidgets('falls back to a plain dine-in label when details are absent', (
      tester,
    ) async {
      await _pump(
        tester,
        _order(status: 'pending', deliveryType: 'dine_in', paymentMethod: 'cash'),
      );

      expect(find.text('Dine in'), findsOneWidget);
    });

    testWidgets(
      'refreshes the list after a successful update even if the row was '
      'disposed mid-request',
      (tester) async {
        final repository = _FakeOrderRepository();
        final order = _order();

        await tester.pumpWidget(_app(order: order, repository: repository));
        await tester.pump();
        expect(repository.fetchCalls, 1);

        await tester.tap(find.text('Mark as Ready'));
        await tester.pump();
        expect(repository.calls, ['o1:ready']);

        // The update succeeds after the row has already left the tree.
        await tester.pumpWidget(_app(order: null, repository: repository));
        repository.complete();

        await tester.pump();
        await tester.pump();
        // Only an invalidation refetches the list; rebuilding the widget tree
        // does not.
        expect(repository.fetchCalls, 2);
      },
    );

    testWidgets('ignores repeated taps while the update is in flight', (
      tester,
    ) async {
      final repository = _FakeOrderRepository();
      await tester.pumpWidget(_app(order: _order(), repository: repository));

      await tester.tap(find.text('Mark as Ready'));
      await tester.tap(find.text('Mark as Ready'));
      await tester.pump();

      expect(repository.calls, ['o1:ready']);

      repository.complete();
      await tester.pump();
    });

    testWidgets('reports a failed update and allows retrying it', (
      tester,
    ) async {
      final repository = _FakeOrderRepository();
      await tester.pumpWidget(_app(order: _order(), repository: repository));

      await tester.tap(find.text('Mark as Ready'));
      await tester.pump();
      repository.fail(StateError('boom'));
      await tester.pump();

      expect(
        find.text('Could not update order status. Please retry.'),
        findsOneWidget,
      );

      // Let the failure snackbar time out: it must not cover the button, and
      // its timer must not outlive the test.
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(seconds: 5));
      await tester.pump(const Duration(milliseconds: 500));

      await tester.tap(find.text('Mark as Ready'));
      await tester.pump();

      expect(repository.calls, ['o1:ready', 'o1:ready']);
      repository.complete();
      await tester.pump();
    });
  });
}

Widget _app({required OrdersRow? order, required _FakeOrderRepository repository}) {
  return ProviderScope(
    overrides: [merchantOrderRepositoryProvider.overrideWithValue(repository)],
    child: MaterialApp(
      theme: AppTheme.darkTheme,
      home: Scaffold(
        body: Consumer(
          builder: (context, ref, _) {
            // Keep the list provider alive so an invalidation after the row is
            // disposed shows up as a refetch.
            ref.watch(adminOrdersProvider(OrderTab.preparing));

            return Column(
              children: [
                if (order != null)
                  OrderListTile(order: order, showAdvanceAction: true),
              ],
            );
          },
        ),
      ),
    ),
  );
}

class _MockSupabaseClient extends Mock implements SupabaseClient {}

class _MockMerchantApiClient extends Mock implements MerchantApiClient {}

class _FakeOrderRepository extends MerchantOrderRepository {
  _FakeOrderRepository()
      : super(_MockSupabaseClient(), _MockMerchantApiClient());

  final List<String> calls = [];
  final List<Completer<void>> _pending = [];
  var fetchCalls = 0;

  @override
  Future<List<OrdersRow>> fetchOrders({
    List<String>? statuses,
    DateTime? startDate,
    DateTime? endDate,
    String? orderKind,
    String? fulfillmentType,
  }) async {
    fetchCalls++;
    return const [];
  }

  @override
  Future<void> updateOrderStatus(String orderId, String newStatus) {
    calls.add('$orderId:$newStatus');
    final completer = Completer<void>();
    _pending.add(completer);
    return completer.future;
  }

  void complete() {
    _pending.removeAt(0).complete();
  }

  void fail(Object error) {
    _pending.removeAt(0).completeError(error);
  }
}

Future<void> _pump(
  WidgetTester tester,
  OrdersRow order, {
  bool showAdvanceAction = true,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: SingleChildScrollView(
            child: OrderListTile(
              order: order,
              showAdvanceAction: showAdvanceAction,
            ),
          ),
        ),
      ),
    ),
  );
}

OrdersRow _order({
  String status = 'preparing',
  bool includeCutlery = true,
  String deliveryType = 'delivery',
  String? tableLabel,
  int? pax,
  String? paymentMethod,
  String? stripePaymentIntentId = 'pi_123',
}) {
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
    'delivery_type': deliveryType,
    'table_label': ?tableLabel,
    'pax': ?pax,
    'payment_method': ?paymentMethod,
    'fulfillment_type': 'asap',
    'order_kind': 'standard',
    'dispatch_status': 'not_ready',
    'approval_status': 'auto_approved',
    'hubbo_pos_sync_status': 'pending',
    'requires_manual_review': false,
    'include_cutlery': includeCutlery,
    'stripe_payment_intent_id': ?stripePaymentIntentId,
  });
}
