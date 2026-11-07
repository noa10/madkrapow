import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madkrapow_merchant/features/notifications/data/device_identity.dart';
import 'package:madkrapow_merchant/features/notifications/data/fcm_repository.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences_store.dart';
import 'package:madkrapow_merchant/main.dart' as app;
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MockMessaging extends Mock implements FirebaseMessaging {}

class MockSupabaseClient extends Mock implements SupabaseClient {}

class MockAuthClient extends Mock implements GoTrueClient {}

class MockUser extends Mock implements User {}

class FakeDeviceIdentity extends DeviceIdentity {
  @override
  Future<String> get id async => 'abcdefghijklmnopqrstuvwx';
}

User staffUser(String id, {String role = 'cashier'}) {
  final user = MockUser();
  when(() => user.id).thenReturn(id);
  when(() => user.appMetadata).thenReturn({'role': role});
  return user;
}

Future<void> flush() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FcmRepository repository;
  late User? currentUser;
  late List<String> events;
  late StreamController<String> refreshes;
  late Completer<void> deletionStarted;
  late Completer<void> deletionFinished;
  late SupabaseClient rpcClient;
  late bool previousFirebaseReady;

  setUp(() async {
    previousFirebaseReady = app.firebaseInitialized;
    app.firebaseInitialized = true;
    currentUser = staffUser('staff-a');
    events = [];
    refreshes = StreamController<String>.broadcast(sync: true);
    deletionStarted = Completer<void>();
    deletionFinished = Completer<void>();
    final auth = MockAuthClient();
    when(() => auth.currentUser).thenAnswer((_) => currentUser);
    final supabase = MockSupabaseClient();
    when(() => supabase.auth).thenReturn(auth);
    rpcClient = SupabaseClient(
      'https://example.test',
      'test-anon-key',
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/register_merchant_fcm_token')) {
          events.add('register:${currentUser?.id}');
          return http.Response(
            'null',
            200,
            headers: {'content-type': 'application/json'},
            request: request,
          );
        }
        return http.Response(
          'true',
          200,
          headers: {'content-type': 'application/json'},
          request: request,
        );
      }),
    );
    when(() => supabase.rpc(any(), params: any(named: 'params'))).thenAnswer(
      (invocation) => rpcClient.rpc(
        invocation.positionalArguments.single as String,
        params: invocation.namedArguments[#params] as Map<String, dynamic>?,
      ),
    );
    final messaging = MockMessaging();
    when(() => messaging.onTokenRefresh).thenAnswer((_) => refreshes.stream);
    when(() => messaging.getToken()).thenAnswer((_) async => 'fcm-token');
    when(() => messaging.deleteToken()).thenAnswer((_) async {
      events.add('delete:start');
      deletionStarted.complete();
      await deletionFinished.future;
      events.add('delete:finish');
    });
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    repository = FcmRepository(
      supabase,
      identity: FakeDeviceIdentity(),
      preferences: NotificationPreferencesStore(preferences),
      messaging: messaging,
    );
  });

  tearDown(() async {
    if (!deletionFinished.isCompleted) deletionFinished.complete();
    await repository.dispose();
    await refreshes.close();
    await rpcClient.dispose();
    app.firebaseInitialized = previousFirebaseReady;
  });

  test(
    'replays a new staff session after remote token invalidation completes',
    () async {
      repository.updateUser('staff-a');
      await flush();
      expect(events, ['register:staff-a']);

      currentUser = null;
      final invalidating = repository.invalidate();
      await deletionStarted.future;
      currentUser = staffUser('staff-b');
      repository.updateUser('staff-b');
      await flush();
      expect(events, ['register:staff-a', 'delete:start']);

      deletionFinished.complete();
      await invalidating;
      await flush();
      expect(events, [
        'register:staff-a',
        'delete:start',
        'delete:finish',
        'register:staff-b',
      ]);
    },
  );

  test('does not replay a nonstaff session after invalidation', () async {
    final invalidating = repository.invalidate();
    await deletionStarted.future;
    currentUser = staffUser('customer', role: 'customer');
    repository.updateUser(null);
    deletionFinished.complete();
    await invalidating;
    await flush();
    expect(events, ['delete:start', 'delete:finish']);
  });

  test(
    'does not recreate registration when disposed during invalidation',
    () async {
      final invalidating = repository.invalidate();
      await deletionStarted.future;
      await repository.dispose();
      currentUser = staffUser('staff-b');
      repository.updateUser('staff-b');
      deletionFinished.complete();
      await invalidating;
      await flush();
      expect(events, ['delete:start', 'delete:finish']);
    },
  );
}
