import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/utils/auth_exceptions.dart';
import 'package:madkrapow_merchant/core/constants/roles.dart';
import 'package:madkrapow_merchant/features/auth/providers/admin_auth_providers.dart';
import 'package:madkrapow_merchant/features/notifications/data/device_identity.dart';
import 'package:madkrapow_merchant/features/notifications/data/local_order_notifications.dart';
import 'package:madkrapow_merchant/features/notifications/data/order_view_acknowledger.dart';
import 'package:madkrapow_merchant/features/notifications/data/viewed_order_registry.dart';
import 'package:madkrapow_merchant/features/notifications/providers/notification_providers.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_api_client.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_order_repository.dart';
import 'package:madkrapow_merchant/features/orders/presentation/screens/admin_order_detail_screen.dart';
import 'package:madkrapow_merchant/features/orders/providers/admin_order_providers.dart';
import 'package:madkrapow_merchant/generated/tables/orders.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const orderId = 'ef72d60e-9e92-4b0a-a0a9-cd3b4095780a';
const deviceId = 'abcdefghijklmnopqrstuvwx';

class MockSupabaseClient extends Mock implements SupabaseClient {}

class MockMerchantApiClient extends Mock implements MerchantApiClient {}

class MockRealtimeChannel extends Mock implements RealtimeChannel {}

class FakeMerchantOrderRepository extends MerchantOrderRepository {
  FakeMerchantOrderRepository(this.channel)
    : super(MockSupabaseClient(), MockMerchantApiClient());

  final RealtimeChannel channel;

  @override
  RealtimeChannel subscribeToOrder(
    String orderId, {
    required void Function() onUpdate,
  }) => channel;
}

class FakeLocalOrderNotifications extends LocalOrderNotifications {
  final dismissedOrders = <String>[];

  @override
  Future<void> dismissOrder(String orderId) async {
    dismissedOrders.add(orderId);
  }
}

class FakeDeviceIdentity extends DeviceIdentity {
  @override
  Future<String> get id async => deviceId;
}

OrderDetail detailFixture() {
  return OrderDetail(
    order: OrdersRow(
      id: orderId,
      orderNumber: 'MK-1001',
      totalCents: 1250,
      subtotalCents: 1250,
      status: 'paid',
      deliveryType: 'pickup',
      fulfillmentType: 'asap',
      createdAt: DateTime(2026, 11, 7, 10),
    ),
    items: const [],
    events: const [],
  );
}

void main() {
  late FakeLocalOrderNotifications local;
  late ViewedOrderRegistry registry;
  late MockRealtimeChannel channel;
  late MockMerchantApiClient api;
  const printChannel = MethodChannel('com.madkrapow.merchant/receipt_print');

  setUp(() {
    local = FakeLocalOrderNotifications();
    registry = ViewedOrderRegistry();
    channel = MockRealtimeChannel();
    api = MockMerchantApiClient();
    when(() => channel.unsubscribe()).thenAnswer((_) async => 'ok');
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(printChannel, null);
  });

  Future<void> pumpDetail(
    WidgetTester tester,
    OrderViewAcknowledger acknowledger,
  ) async {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          adminOrderDetailProvider(
            orderId,
          ).overrideWith((ref) async => detailFixture()),
          merchantOrderRepositoryProvider.overrideWithValue(
            FakeMerchantOrderRepository(channel),
          ),
          merchantApiClientProvider.overrideWithValue(api),
          staffRoleProvider.overrideWithValue(StaffRole.manager),
          localOrderNotificationsProvider.overrideWithValue(local),
          orderViewAcknowledgerProvider.overrideWithValue(acknowledger),
          viewedOrderRegistryProvider.overrideWithValue(registry),
        ],
        child: const MaterialApp(
          home: AdminOrderDetailScreen(orderId: orderId),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('prints the fetched receipt once and prevents duplicate taps', (
    tester,
  ) async {
    final response = Completer<Map<String, dynamic>>();
    when(
      () => api.post('/print/jobs/receipt-document', {'order_id': orderId}),
    ).thenAnswer((_) => response.future);
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(printChannel, (call) async {
          calls.add(call);
          return null;
        });
    final acknowledger = OrderViewAcknowledger.withRpc(
      (_, _) async => true,
      FakeDeviceIdentity(),
    );
    await pumpDetail(tester, acknowledger);
    await tester.tap(find.byTooltip('Print receipt'));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(
      tester
          .widget<IconButton>(
            find.byWidgetPredicate(
              (widget) =>
                  widget is IconButton && widget.tooltip == 'Print receipt',
            ),
          )
          .onPressed,
      isNull,
    );
    response.complete({'html': '<p>Receipt</p>'});
    await tester.pumpAndSettle();
    verify(
      () => api.post('/print/jobs/receipt-document', {'order_id': orderId}),
    ).called(1);
    expect(calls.single.method, 'printReceipt');
    expect(calls.single.arguments, {'html': '<p>Receipt</p>'});
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('reports invalid receipt response without opening print dialog', (
    tester,
  ) async {
    when(
      () => api.post('/print/jobs/receipt-document', {'order_id': orderId}),
    ).thenAnswer((_) async => {'html': ''});
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(printChannel, (call) async {
          calls.add(call);
          return null;
        });
    final acknowledger = OrderViewAcknowledger.withRpc(
      (_, _) async => true,
      FakeDeviceIdentity(),
    );
    await pumpDetail(tester, acknowledger);
    await tester.tap(find.byTooltip('Print receipt'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not print receipt'), findsOneWidget);
    expect(calls, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('authentication failure explains access and permits retry', (
    tester,
  ) async {
    when(
      () => api.post('/print/jobs/receipt-document', {'order_id': orderId}),
    ).thenThrow(const AuthRequiredException('expired'));
    final acknowledger = OrderViewAcknowledger.withRpc(
      (_, _) async => true,
      FakeDeviceIdentity(),
    );
    await pumpDetail(tester, acknowledger);
    await tester.tap(find.byTooltip('Print receipt'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Session expired or access denied'),
      findsOneWidget,
    );
    await tester.tap(find.byTooltip('Print receipt'));
    await tester.pumpAndSettle();
    verify(
      () => api.post('/print/jobs/receipt-document', {'order_id': orderId}),
    ).called(2);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('print dialog failure is reported and allows retry', (
    tester,
  ) async {
    when(
      () => api.post('/print/jobs/receipt-document', {'order_id': orderId}),
    ).thenAnswer((_) async => {'html': '<p>Receipt</p>'});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(printChannel, (_) async {
          throw PlatformException(code: 'print_error');
        });
    final acknowledger = OrderViewAcknowledger.withRpc(
      (_, _) async => true,
      FakeDeviceIdentity(),
    );
    await pumpDetail(tester, acknowledger);
    await tester.tap(find.byTooltip('Print receipt'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not print receipt'), findsOneWidget);
    expect(
      tester
          .widget<IconButton>(
            find.byWidgetPredicate(
              (widget) =>
                  widget is IconButton && widget.tooltip == 'Print receipt',
            ),
          )
          .onPressed,
      isNotNull,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('does not open print dialog after screen disposal', (
    tester,
  ) async {
    final response = Completer<Map<String, dynamic>>();
    when(
      () => api.post('/print/jobs/receipt-document', {'order_id': orderId}),
    ).thenAnswer((_) => response.future);
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(printChannel, (call) async {
          calls.add(call);
          return null;
        });
    final acknowledger = OrderViewAcknowledger.withRpc(
      (_, _) async => true,
      FakeDeviceIdentity(),
    );
    await pumpDetail(tester, acknowledger);
    await tester.tap(find.byTooltip('Print receipt'));
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    response.complete({'html': '<p>Receipt</p>'});
    await tester.pump();
    expect(calls, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('acknowledges the opened order after the first frame', (
    tester,
  ) async {
    final calls = <(String, Map<String, dynamic>)>[];
    final acknowledger = OrderViewAcknowledger.withRpc((
      function,
      params,
    ) async {
      calls.add((function, params));
      return true;
    }, FakeDeviceIdentity());

    await pumpDetail(tester, acknowledger);

    expect(calls, hasLength(1));
    expect(calls.single.$1, 'acknowledge_merchant_order_view');
    expect(calls.single.$2, {'p_device_id': deviceId, 'p_order_id': orderId});
    expect(registry.contains(orderId), isTrue);
    expect(local.dismissedOrders, [orderId]);

    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('retries the acknowledgement when the app resumes', (
    tester,
  ) async {
    var fail = true;
    var calls = 0;
    final acknowledger = OrderViewAcknowledger.withRpc((
      function,
      params,
    ) async {
      calls++;
      if (fail) throw Exception('offline');
      return true;
    }, FakeDeviceIdentity());

    await pumpDetail(tester, acknowledger);
    expect(calls, 1);
    expect(registry.contains(orderId), isFalse);

    fail = false;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(calls, 2);
    expect(registry.contains(orderId), isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('does not acknowledge while another route covers the order', (
    tester,
  ) async {
    var calls = 0;
    final acknowledger = OrderViewAcknowledger.withRpc((
      function,
      params,
    ) async {
      calls++;
      return false;
    }, FakeDeviceIdentity());

    await pumpDetail(tester, acknowledger);
    expect(calls, 1);

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    unawaited(
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Covering route')),
        ),
      ),
    );
    await tester.pumpAndSettle();

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(calls, 1);

    navigator.pop();
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(calls, 2);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
