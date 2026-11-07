import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/notifications/data/token_registration_manager.dart';

Future<void> flush() => Future<void>.delayed(Duration.zero);

void main() {
  late StreamController<String> refreshes;
  late String? currentUser;
  late List<String> registrations;
  late TokenRegistrationManager manager;

  setUp(() {
    refreshes = StreamController<String>.broadcast(sync: true);
    currentUser = 'staff-a';
    registrations = [];
    manager = TokenRegistrationManager(
      tokenRefreshes: refreshes.stream,
      currentUserId: () => currentUser,
      getToken: () async => 'initial',
      register: (userId, token) async => registrations.add('$userId:$token'),
      retryDelay: const Duration(days: 1),
    );
  });

  tearDown(() async {
    await manager.dispose();
    await refreshes.close();
  });

  test(
    'registers restored sessions and refreshes without stacking listeners',
    () async {
      manager.updateUser('staff-a');
      await flush();
      manager.updateUser('staff-a');
      refreshes.add('rotated');
      await flush();
      expect(registrations, ['staff-a:initial', 'staff-a:rotated']);
      currentUser = null;
      await manager.stop();
      refreshes.add('after-signout');
      await flush();
      expect(registrations, hasLength(2));
    },
  );

  test(
    'retries a failed registration without waiting for another token change',
    () async {
      await manager.dispose();
      var attempts = 0;
      manager = TokenRegistrationManager(
        tokenRefreshes: refreshes.stream,
        currentUserId: () => currentUser,
        getToken: () async => 'initial',
        register: (userId, token) async {
          attempts++;
          if (attempts == 1) throw StateError('offline');
          registrations.add('$userId:$token');
        },
        retryDelay: const Duration(days: 1),
      );
      manager.updateUser('staff-a');
      await flush();
      manager.retry();
      await flush();
      expect(attempts, 2);
      expect(registrations, ['staff-a:initial']);
    },
  );

  test('automatically retries a failed registration', () async {
    await manager.dispose();
    final retried = Completer<void>();
    var attempts = 0;
    manager = TokenRegistrationManager(
      tokenRefreshes: refreshes.stream,
      currentUserId: () => currentUser,
      getToken: () async => 'initial',
      register: (userId, token) async {
        attempts++;
        if (attempts == 1) throw StateError('offline');
        registrations.add('$userId:$token');
        retried.complete();
      },
      retryDelay: const Duration(milliseconds: 10),
    );
    manager.updateUser('staff-a');
    await retried.future.timeout(const Duration(seconds: 2));
    expect(attempts, 2);
    expect(registrations, ['staff-a:initial']);
  });

  test('serializes in-flight registrations across account switches', () async {
    await manager.dispose();
    final started = Completer<void>();
    final finishOld = Completer<void>();
    manager = TokenRegistrationManager(
      tokenRefreshes: refreshes.stream,
      currentUserId: () => currentUser,
      getToken: () async => 'token',
      register: (userId, token) async {
        registrations.add('$userId:start');
        if (userId == 'staff-a') {
          started.complete();
          await finishOld.future;
        }
        registrations.add('$userId:finish');
      },
      retryDelay: const Duration(days: 1),
    );
    manager.updateUser('staff-a');
    await started.future;
    currentUser = 'staff-b';
    manager.updateUser('staff-b');
    await flush();
    expect(registrations, ['staff-a:start']);
    finishOld.complete();
    await flush();
    expect(registrations, [
      'staff-a:start',
      'staff-a:finish',
      'staff-b:start',
      'staff-b:finish',
    ]);
  });

  test(
    'does not register an old account token after an account switch',
    () async {
      await manager.dispose();
      final oldToken = Completer<String?>();
      var calls = 0;
      manager = TokenRegistrationManager(
        tokenRefreshes: refreshes.stream,
        currentUserId: () => currentUser,
        getToken: () =>
            ++calls == 1 ? oldToken.future : Future.value('new-token'),
        register: (userId, token) async => registrations.add('$userId:$token'),
        retryDelay: const Duration(days: 1),
      );
      manager.updateUser('staff-a');
      await flush();
      currentUser = 'staff-b';
      manager.updateUser('staff-b');
      oldToken.complete('old-token');
      await flush();
      await flush();
      expect(registrations, ['staff-b:new-token']);
    },
  );

  test(
    'stop waits for an in-flight registration before sign-out cleanup',
    () async {
      await manager.dispose();
      final started = Completer<void>();
      final complete = Completer<void>();
      manager = TokenRegistrationManager(
        tokenRefreshes: refreshes.stream,
        currentUserId: () => currentUser,
        getToken: () async => 'token',
        register: (userId, token) async {
          started.complete();
          await complete.future;
        },
        retryDelay: const Duration(days: 1),
      );
      manager.updateUser('staff-a');
      await started.future;
      var stopped = false;
      final stopping = manager.stop().then((_) => stopped = true);
      await flush();
      expect(stopped, isFalse);
      complete.complete();
      await stopping;
      expect(stopped, isTrue);
    },
  );
}
