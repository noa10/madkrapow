import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_merchant/core/providers/supabase_provider.dart';
import 'package:madkrapow_merchant/features/notifications/data/fcm_repository.dart';
import 'package:madkrapow_merchant/features/notifications/data/local_order_notifications.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences_store.dart';
import 'package:madkrapow_merchant/features/notifications/data/order_notification.dart';
import 'package:madkrapow_merchant/features/notifications/data/viewed_order_registry.dart';
import 'package:madkrapow_merchant/features/notifications/presentation/order_notification_handler.dart';
import 'package:madkrapow_merchant/features/notifications/providers/notification_providers.dart';
import 'package:madkrapow_merchant/features/orders/providers/admin_order_providers.dart';
import 'package:madkrapow_merchant/features/orders/providers/kitchen_providers.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MockFcmRepository extends Mock implements FcmRepository {}

class MockUser extends Mock implements User {}

class MockSession extends Mock implements Session {}

class RecordingLocalNotifications extends LocalOrderNotifications {
  final shown = <String>[];
  final dedupeKeys = <String>[];
  final preferences = <NotificationPreferences>[];

  @override
  Future<void> show(
    OrderNotification order,
    RemoteNotification? message,
    NotificationPreferences preferences,
  ) async {
    shown.add(order.eventId);
    dedupeKeys.add(order.dedupeKey);
    this.preferences.add(preferences);
  }
}

const orderId = 'ef72d60e-9e92-4b0a-a0a9-cd3b4095780a';
const payload = {
  'type': 'new_order',
  'order_id': orderId,
  'event_id': 'event-1',
};
const secondOrderPayload = {
  'type': 'new_order',
  'order_id': 'a7fe288f-d4a3-4f2a-96c0-bd6c12ef952b',
  'event_id': 'event-2',
};

Session staffSession(String role) {
  final user = MockUser();
  final session = MockSession();
  when(() => user.id).thenReturn('staff-a');
  when(() => user.appMetadata).thenReturn({'role': role});
  when(() => session.user).thenReturn(user);
  return session;
}

typedef ForegroundHarness = ({
  RecordingLocalNotifications local,
  StreamController<RemoteMessage> foreground,
  StreamController<AuthState> auth,
});

/// Delivers foreground alerts before the restored session settles, then waits
/// for them to be presented with [storedPreferences] loaded from disk.
Future<ForegroundHarness> pumpForegroundAlert(
  WidgetTester tester, {
  required Map<String, Object> storedPreferences,
  ViewedOrderRegistry? viewedRegistry,
  List<Map<String, dynamic>> initialPayloads = const [payload],
  AuthState? restoredAuthState,
}) async {
  final auth = StreamController<AuthState>.broadcast(sync: true);
  final foreground = StreamController<RemoteMessage>.broadcast(sync: true);
  final opened = StreamController<RemoteMessage>.broadcast(sync: true);
  final local = RecordingLocalNotifications();
  final fcm = MockFcmRepository();
  when(() => fcm.invalidate()).thenAnswer((_) async {});
  final navigatorKey = GlobalKey<NavigatorState>();
  SharedPreferences.setMockInitialValues(storedPreferences);
  final sharedPreferences = await SharedPreferences.getInstance();
  final router = GoRouter(
    navigatorKey: navigatorKey,
    initialLocation: '/signin',
    routes: [
      GoRoute(path: '/signin', builder: (_, _) => const Text('Sign in')),
    ],
  );
  addTearDown(() async {
    router.dispose();
    await auth.close();
    await foreground.close();
    await opened.close();
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith((ref) => auth.stream),
        fcmRepositoryProvider.overrideWithValue(fcm),
        notificationPreferencesStoreProvider.overrideWithValue(
          NotificationPreferencesStore(sharedPreferences),
        ),
        if (viewedRegistry != null)
          viewedOrderRegistryProvider.overrideWithValue(viewedRegistry),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (_, child) => OrderNotificationHandler(
          router: router,
          navigatorKey: navigatorKey,
          firebaseReady: true,
          localNotifications: local,
          foregroundMessages: foreground.stream,
          openedMessages: opened.stream,
          initialMessage: () async => null,
          child: child!,
        ),
      ),
    ),
  );
  for (final data in initialPayloads) {
    foreground.add(RemoteMessage(data: data));
  }
  await tester.pump();
  auth.add(
    restoredAuthState ??
        AuthState(AuthChangeEvent.initialSession, staffSession('cashier')),
  );
  await tester.pumpAndSettle();
  return (local: local, foreground: foreground, auth: auth);
}

void main() {
  testWidgets(
    'initial tap waits for a restored cashier session and is handled once',
    (tester) async {
      final auth = StreamController<AuthState>.broadcast(sync: true);
      final foreground = StreamController<RemoteMessage>.broadcast(sync: true);
      final opened = StreamController<RemoteMessage>.broadcast(sync: true);
      final fcm = MockFcmRepository();
      final navigatorKey = GlobalKey<NavigatorState>();
      final router = GoRouter(
        navigatorKey: navigatorKey,
        initialLocation: '/signin',
        routes: [
          GoRoute(path: '/signin', builder: (_, _) => const Text('Sign in')),
          GoRoute(
            path: '/orders/:id',
            builder: (_, state) => Text('Order ${state.pathParameters['id']}'),
          ),
        ],
      );
      addTearDown(() async {
        router.dispose();
        await auth.close();
        await foreground.close();
        await opened.close();
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith((ref) => auth.stream),
            fcmRepositoryProvider.overrideWithValue(fcm),
          ],
          child: MaterialApp.router(
            routerConfig: router,
            builder: (_, child) => OrderNotificationHandler(
              router: router,
              navigatorKey: navigatorKey,
              firebaseReady: true,
              localNotifications: null,
              foregroundMessages: foreground.stream,
              openedMessages: opened.stream,
              initialMessage: () async => const RemoteMessage(data: payload),
              child: child!,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Sign in'), findsOneWidget);
      auth.add(
        AuthState(AuthChangeEvent.initialSession, staffSession('cashier')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Order $orderId'), findsOneWidget);
      verify(() => fcm.updateUser('staff-a')).called(1);

      router.go('/signin');
      await tester.pumpAndSettle();
      opened.add(const RemoteMessage(data: payload));
      await tester.pumpAndSettle();
      expect(find.text('Sign in'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      expect(foreground.hasListener, isFalse);
      expect(opened.hasListener, isFalse);
    },
  );

  testWidgets('pending tap is retried when the navigator mounts later', (
    tester,
  ) async {
    final auth = StreamController<AuthState>.broadcast(sync: true);
    final foreground = StreamController<RemoteMessage>.broadcast(sync: true);
    final opened = StreamController<RemoteMessage>.broadcast(sync: true);
    final visible = ValueNotifier(false);
    final navigatorKey = GlobalKey<NavigatorState>();
    final router = GoRouter(
      navigatorKey: navigatorKey,
      initialLocation: '/signin',
      routes: [
        GoRoute(path: '/signin', builder: (_, _) => const Text('Sign in')),
        GoRoute(
          path: '/orders/:id',
          builder: (_, state) => Text('Order ${state.pathParameters['id']}'),
        ),
      ],
    );
    addTearDown(() async {
      visible.dispose();
      router.dispose();
      await auth.close();
      await foreground.close();
      await opened.close();
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWith((ref) => auth.stream),
          fcmRepositoryProvider.overrideWithValue(MockFcmRepository()),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          builder: (_, child) => OrderNotificationHandler(
            router: router,
            navigatorKey: navigatorKey,
            firebaseReady: true,
            localNotifications: null,
            foregroundMessages: foreground.stream,
            openedMessages: opened.stream,
            initialMessage: () async => const RemoteMessage(data: payload),
            child: ValueListenableBuilder<bool>(
              valueListenable: visible,
              builder: (_, show, _) => show ? child! : const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    );
    auth.add(
      AuthState(AuthChangeEvent.initialSession, staffSession('manager')),
    );
    await tester.pump();
    await tester.pump();
    expect(navigatorKey.currentState, isNull);
    visible.value = true;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));
    await tester.pumpAndSettle();
    expect(find.text('Order $orderId'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('refreshes orders on resume and initial delivery, not repeats', (
    tester,
  ) async {
    final auth = StreamController<AuthState>.broadcast(sync: true);
    final foreground = StreamController<RemoteMessage>.broadcast(sync: true);
    final opened = StreamController<RemoteMessage>.broadcast(sync: true);
    final fcm = MockFcmRepository();
    final navigatorKey = GlobalKey<NavigatorState>();
    var orderReads = 0;
    var kitchenReads = 0;
    final router = GoRouter(
      navigatorKey: navigatorKey,
      initialLocation: '/orders',
      routes: [
        GoRoute(
          path: '/orders',
          builder: (_, _) => Consumer(
            builder: (_, ref, _) {
              ref.watch(adminOrdersProvider(OrderTab.preparing));
              ref.watch(kitchenOrderCardsProvider);
              return const Text('Orders');
            },
          ),
        ),
      ],
    );
    addTearDown(() async {
      router.dispose();
      await auth.close();
      await foreground.close();
      await opened.close();
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWith((ref) => auth.stream),
          fcmRepositoryProvider.overrideWithValue(fcm),
          adminOrdersProvider(OrderTab.preparing).overrideWith((ref) async {
            orderReads++;
            return [];
          }),
          kitchenOrderCardsProvider.overrideWith((ref) async {
            kitchenReads++;
            return [];
          }),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          builder: (_, child) => OrderNotificationHandler(
            router: router,
            navigatorKey: navigatorKey,
            firebaseReady: true,
            localNotifications: null,
            foregroundMessages: foreground.stream,
            openedMessages: opened.stream,
            initialMessage: () async => null,
            child: child!,
          ),
        ),
      ),
    );
    auth.add(
      AuthState(AuthChangeEvent.initialSession, staffSession('kitchen')),
    );
    await tester.pumpAndSettle();
    expect(orderReads, 1);
    expect(kitchenReads, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(orderReads, 2);
    expect(kitchenReads, 2);
    verify(() => fcm.retry()).called(1);

    foreground.add(const RemoteMessage(data: payload));
    await tester.pumpAndSettle();
    expect(orderReads, 3);
    expect(kitchenReads, 3);

    foreground.add(const RemoteMessage(data: {...payload, 'repeat': '1'}));
    await tester.pumpAndSettle();
    expect(orderReads, 3);
    expect(kitchenReads, 3);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('holds a foreground alert until the restored session is ready', (
    tester,
  ) async {
    final auth = StreamController<AuthState>.broadcast(sync: true);
    final foreground = StreamController<RemoteMessage>.broadcast(sync: true);
    final opened = StreamController<RemoteMessage>.broadcast(sync: true);
    final local = RecordingLocalNotifications();
    final navigatorKey = GlobalKey<NavigatorState>();
    SharedPreferences.setMockInitialValues({});
    final sharedPreferences = await SharedPreferences.getInstance();
    final router = GoRouter(
      navigatorKey: navigatorKey,
      initialLocation: '/signin',
      routes: [
        GoRoute(path: '/signin', builder: (_, _) => const Text('Sign in')),
      ],
    );
    addTearDown(() async {
      router.dispose();
      await auth.close();
      await foreground.close();
      await opened.close();
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWith((ref) => auth.stream),
          fcmRepositoryProvider.overrideWithValue(MockFcmRepository()),
          notificationPreferencesStoreProvider.overrideWithValue(
            NotificationPreferencesStore(sharedPreferences),
          ),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          builder: (_, child) => OrderNotificationHandler(
            router: router,
            navigatorKey: navigatorKey,
            firebaseReady: true,
            localNotifications: local,
            foregroundMessages: foreground.stream,
            openedMessages: opened.stream,
            initialMessage: () async => null,
            child: child!,
          ),
        ),
      ),
    );

    // FCM can deliver before the restored session settles. The alert must not
    // be dropped (the message is not redelivered) or marked seen.
    foreground.add(const RemoteMessage(data: payload));
    await tester.pump();
    expect(local.shown, isEmpty);

    auth.add(
      AuthState(AuthChangeEvent.initialSession, staffSession('cashier')),
    );
    await tester.pumpAndSettle();
    expect(local.shown, ['event-1']);

    // A duplicate delivery after the alert was shown stays suppressed.
    foreground.add(const RemoteMessage(data: payload));
    await tester.pumpAndSettle();
    expect(local.shown, ['event-1']);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('passes the stored sound and vibration settings to the alert', (
    tester,
  ) async {
    final harness = await pumpForegroundAlert(
      tester,
      storedPreferences: {
        NotificationPreferencesStore.soundKey: false,
        NotificationPreferencesStore.vibrationKey: false,
      },
    );
    expect(
      harness.local.preferences.single,
      const NotificationPreferences(sound: false, vibration: false),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('retains every distinct held order when repeats are disabled', (
    tester,
  ) async {
    final harness = await pumpForegroundAlert(
      tester,
      storedPreferences: {
        NotificationPreferencesStore.repeatUntilViewedKey: false,
      },
      initialPayloads: const [payload, secondOrderPayload, payload],
    );

    expect(harness.local.shown, ['event-1', 'event-2']);
    expect(
      harness.local.preferences.every((value) => !value.repeatUntilViewed),
      isTrue,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('coalesces held repeats without dropping another order', (
    tester,
  ) async {
    final harness = await pumpForegroundAlert(
      tester,
      storedPreferences: {},
      initialPayloads: const [
        payload,
        secondOrderPayload,
        {...payload, 'repeat': '1'},
        {...payload, 'repeat': '1'},
        payload,
      ],
    );

    expect(harness.local.dedupeKeys, ['event-1#1', 'event-2#0']);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final signedOut in [true, false]) {
    testWidgets(
      'drops held foreground alerts when auth resolves ${signedOut ? 'signed out' : 'without a staff role'}',
      (tester) async {
        final harness = await pumpForegroundAlert(
          tester,
          storedPreferences: {},
          initialPayloads: const [payload, secondOrderPayload],
          restoredAuthState: AuthState(
            AuthChangeEvent.initialSession,
            signedOut ? null : staffSession('customer'),
          ),
        );
        expect(harness.local.shown, isEmpty);

        // A stale push arriving after auth settled must not be held for the
        // next staff account either.
        harness.foreground.add(const RemoteMessage(data: payload));
        await tester.pumpAndSettle();
        harness.auth.add(
          AuthState(AuthChangeEvent.signedIn, staffSession('manager')),
        );
        await tester.pumpAndSettle();
        expect(harness.local.shown, isEmpty);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('suppresses foreground alerts when order alerts are off', (
    tester,
  ) async {
    final harness = await pumpForegroundAlert(
      tester,
      storedPreferences: {NotificationPreferencesStore.orderAlertsKey: false},
    );
    expect(harness.local.shown, isEmpty);
    expect(harness.local.preferences, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'shows each repeat of an order and suppresses duplicate repeats',
    (tester) async {
      final harness = await pumpForegroundAlert(tester, storedPreferences: {});
      expect(harness.local.dedupeKeys, ['event-1#0']);

      harness.foreground.add(
        const RemoteMessage(data: {...payload, 'repeat': '1'}),
      );
      await tester.pumpAndSettle();
      harness.foreground.add(
        const RemoteMessage(data: {...payload, 'repeat': '1'}),
      );
      await tester.pumpAndSettle();
      harness.foreground.add(
        const RemoteMessage(data: {...payload, 'repeat': '2'}),
      );
      await tester.pumpAndSettle();

      expect(harness.local.dedupeKeys, ['event-1#0', 'event-1#1', 'event-1#2']);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('preserves other tray entries when a different order arrives', (
    tester,
  ) async {
    final harness = await pumpForegroundAlert(tester, storedPreferences: {});

    harness.foreground.add(const RemoteMessage(data: secondOrderPayload));
    await tester.pumpAndSettle();

    expect(harness.local.dedupeKeys.last, 'event-2#0');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('suppresses alerts for an order already opened on this device', (
    tester,
  ) async {
    final registry = ViewedOrderRegistry()..add(orderId);
    final harness = await pumpForegroundAlert(
      tester,
      storedPreferences: {},
      viewedRegistry: registry,
    );

    expect(harness.local.shown, isEmpty);

    harness.foreground.add(
      const RemoteMessage(data: {...payload, 'repeat': '1'}),
    );
    await tester.pumpAndSettle();
    expect(harness.local.shown, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('clears viewed orders when the signed-in account changes', (
    tester,
  ) async {
    final registry = ViewedOrderRegistry()..add(orderId);
    final harness = await pumpForegroundAlert(
      tester,
      storedPreferences: {},
      viewedRegistry: registry,
    );
    expect(harness.local.shown, isEmpty);

    harness.auth.add(const AuthState(AuthChangeEvent.signedOut, null));
    await tester.pumpAndSettle();
    expect(registry.contains(orderId), isFalse);

    harness.auth.add(
      AuthState(AuthChangeEvent.signedIn, staffSession('manager')),
    );
    await tester.pumpAndSettle();
    harness.foreground.add(const RemoteMessage(data: payload));
    await tester.pumpAndSettle();
    expect(harness.local.shown, ['event-1']);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('invalidates the device when the session ends remotely', (
    tester,
  ) async {
    final auth = StreamController<AuthState>.broadcast(sync: true);
    final foreground = StreamController<RemoteMessage>.broadcast(sync: true);
    final opened = StreamController<RemoteMessage>.broadcast(sync: true);
    final fcm = MockFcmRepository();
    when(() => fcm.invalidate()).thenAnswer((_) async {});
    final navigatorKey = GlobalKey<NavigatorState>();
    final router = GoRouter(
      navigatorKey: navigatorKey,
      initialLocation: '/signin',
      routes: [
        GoRoute(path: '/signin', builder: (_, _) => const Text('Sign in')),
      ],
    );
    addTearDown(() async {
      router.dispose();
      await auth.close();
      await foreground.close();
      await opened.close();
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWith((ref) => auth.stream),
          fcmRepositoryProvider.overrideWithValue(fcm),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          builder: (_, child) => OrderNotificationHandler(
            router: router,
            navigatorKey: navigatorKey,
            firebaseReady: true,
            localNotifications: null,
            foregroundMessages: foreground.stream,
            openedMessages: opened.stream,
            initialMessage: () async => null,
            child: child!,
          ),
        ),
      ),
    );
    auth.add(
      AuthState(AuthChangeEvent.initialSession, staffSession('manager')),
    );
    await tester.pumpAndSettle();
    verify(() => fcm.updateUser('staff-a')).called(1);

    // Expiry or a remote sign-out never reaches AdminSignInNotifier.signOut.
    auth.add(const AuthState(AuthChangeEvent.signedOut, null));
    await tester.pumpAndSettle();
    verify(() => fcm.invalidate()).called(1);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
