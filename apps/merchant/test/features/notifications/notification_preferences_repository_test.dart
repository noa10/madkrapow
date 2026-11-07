import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madkrapow_merchant/core/providers/supabase_provider.dart';
import 'package:madkrapow_merchant/features/notifications/data/device_identity.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences_store.dart';
import 'package:madkrapow_merchant/features/notifications/providers/notification_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _DeviceIdentity extends DeviceIdentity {
  @override
  Future<String> get id async => 'abcdefghijklmnopqrstuvwx';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const next = NotificationPreferences(
    orderAlerts: true,
    sound: false,
    vibration: false,
    repeatUntilViewed: false,
    alertSound: AlertSound.bell,
  );
  late List<http.Request> requests;
  late NotificationPreferencesStore store;

  Future<ProviderContainer> containerWithResponse(
    String response, {
    int status = 200,
  }) async {
    SharedPreferences.setMockInitialValues({});
    store = NotificationPreferencesStore(await SharedPreferences.getInstance());
    requests = [];
    final client = SupabaseClient(
      'https://notification-tests.supabase.co',
      'test-anon-key',
      httpClient: MockClient((request) async {
        requests.add(request);
        return http.Response(
          response,
          status,
          headers: {'content-type': 'application/json'},
          request: request,
        );
      }),
      authOptions: const AuthClientOptions(autoRefreshToken: false),
    );
    addTearDown(client.dispose);
    final container = ProviderContainer(
      overrides: [
        supabaseProvider.overrideWithValue(client),
        deviceIdentityProvider.overrideWithValue(_DeviceIdentity()),
        notificationPreferencesStoreProvider.overrideWithValue(store),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('persists settings only after v3 accepts this installation', () async {
    final container = await containerWithResponse('true');

    expect(
      await container.read(notificationPreferencesRepositoryProvider).save(next),
      isTrue,
    );
    expect(store.read(), next);
    expect(requests, hasLength(1));
    expect(
      requests.single.url.path,
      '/rest/v1/rpc/set_merchant_notification_preferences_v3',
    );
    expect(jsonDecode(requests.single.body), {
      'p_device_id': 'abcdefghijklmnopqrstuvwx',
      'p_order_alerts': true,
      'p_sound': false,
      'p_vibration': false,
      'p_repeat_until_viewed': false,
      'p_alert_sound': 'bell',
    });
  });

  for (final response in ['false', 'null']) {
    test('retains local settings when the server returns $response', () async {
      final container = await containerWithResponse(response);

      expect(
        await container
            .read(notificationPreferencesRepositoryProvider)
            .save(next),
        isFalse,
      );
      expect(store.read(), NotificationPreferences.defaults);
    });
  }

  test('retains local settings and surfaces rejected saves for retry', () async {
    final container = await containerWithResponse(
      '{"code":"42501","message":"Authorized merchant staff required"}',
      status: 403,
    );

    await expectLater(
      container.read(notificationPreferencesRepositoryProvider).save(next),
      throwsA(isA<PostgrestException>()),
    );
    expect(store.read(), NotificationPreferences.defaults);
  });
}
