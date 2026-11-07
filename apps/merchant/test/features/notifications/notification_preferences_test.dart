import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences_repository.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences_store.dart';
import 'package:madkrapow_merchant/features/notifications/providers/notification_providers.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MockNotificationPreferencesRepository extends Mock
    implements NotificationPreferencesRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('NotificationPreferences', () {
    test('defaults to every alert enabled', () {
      const preferences = NotificationPreferences.defaults;
      expect(preferences.orderAlerts, isTrue);
      expect(preferences.sound, isTrue);
      expect(preferences.vibration, isTrue);
      expect(preferences.repeatUntilViewed, isTrue);
      expect(preferences.alertSound, AlertSound.krapow);
    });

    test('copyWith changes only the named values', () {
      const preferences = NotificationPreferences.defaults;
      expect(
        preferences.copyWith(sound: false),
        const NotificationPreferences(sound: false),
      );
      expect(
        preferences.copyWith(orderAlerts: false, vibration: false),
        const NotificationPreferences(orderAlerts: false, vibration: false),
      );
      expect(
        preferences.copyWith(repeatUntilViewed: false),
        const NotificationPreferences(repeatUntilViewed: false),
      );
      expect(
        preferences.copyWith(alertSound: AlertSound.system),
        const NotificationPreferences(alertSound: AlertSound.system),
      );
      expect(preferences.copyWith(), preferences);
    });

    test('maps every sound/vibration combination to a declared channel', () {
      for (final alertSound in AlertSound.values) {
        for (final sound in [true, false]) {
          for (final vibration in [true, false]) {
            final id = NotificationPreferences(
              sound: sound,
              vibration: vibration,
              alertSound: alertSound,
            ).channelId;
            final channel = orderNotificationChannels.firstWhere(
              (candidate) => candidate.id == id,
            );
            expect(channel.sound, sound, reason: 'sound for $id');
            expect(channel.vibration, vibration, reason: 'vibration for $id');
          }
        }
      }
      expect(
        orderNotificationChannels.map((channel) => channel.id).toSet(),
        hasLength(10),
      );
    });

    test('custom sounds use per-sound channels and system keeps the legacy ones', () {
      expect(
        const NotificationPreferences(
          sound: true,
          vibration: true,
          alertSound: AlertSound.krapow,
        ).channelId,
        'merchant_orders_krapow',
      );
      expect(
        const NotificationPreferences(
          sound: true,
          vibration: false,
          alertSound: AlertSound.bell,
        ).channelId,
        'merchant_orders_bell_quiet',
      );
      expect(
        const NotificationPreferences(
          sound: true,
          vibration: true,
          alertSound: AlertSound.chime,
        ).channelId,
        'merchant_orders_chime',
      );
      expect(
        const NotificationPreferences(
          sound: true,
          vibration: true,
          alertSound: AlertSound.system,
        ).channelId,
        'merchant_orders',
      );
      expect(
        const NotificationPreferences(
          sound: true,
          vibration: false,
          alertSound: AlertSound.system,
        ).channelId,
        'merchant_orders_sound',
      );
    });

    test('per-sound channels carry their raw sound resource', () {
      for (final channel in orderNotificationChannels) {
        if (channel.id.startsWith('merchant_orders_krapow')) {
          expect(channel.rawSound, 'krapow_mallet', reason: channel.id);
        } else if (channel.id.startsWith('merchant_orders_bell')) {
          expect(channel.rawSound, 'service_bell', reason: channel.id);
        } else if (channel.id.startsWith('merchant_orders_chime')) {
          expect(channel.rawSound, 'light_chime', reason: channel.id);
        } else {
          expect(channel.rawSound, isNull, reason: channel.id);
        }
      }
    });
  });

  group('AlertSound', () {
    test('fromWire tolerates missing and unknown values', () {
      expect(AlertSound.fromWire(null), AlertSound.krapow);
      expect(AlertSound.fromWire('krapow'), AlertSound.krapow);
      expect(AlertSound.fromWire('bell'), AlertSound.bell);
      expect(AlertSound.fromWire('chime'), AlertSound.chime);
      expect(AlertSound.fromWire('system'), AlertSound.system);
      expect(AlertSound.fromWire('mystery'), AlertSound.krapow);
    });
  });

  group('NotificationPreferencesStore', () {
    test('defaults to enabled when nothing has been saved', () async {
      SharedPreferences.setMockInitialValues({});
      final store = NotificationPreferencesStore(
        await SharedPreferences.getInstance(),
      );
      expect(store.read(), NotificationPreferences.defaults);
    });

    test('round-trips values through SharedPreferences', () async {
      SharedPreferences.setMockInitialValues({});
      final store = NotificationPreferencesStore(
        await SharedPreferences.getInstance(),
      );
      const preferences = NotificationPreferences(
        orderAlerts: false,
        sound: false,
        vibration: true,
        repeatUntilViewed: false,
        alertSound: AlertSound.bell,
      );

      await store.write(preferences);

      expect(store.read(), preferences);
      final reloaded = await SharedPreferences.getInstance();
      expect(
        reloaded.getBool(NotificationPreferencesStore.orderAlertsKey),
        isFalse,
      );
      expect(reloaded.getBool(NotificationPreferencesStore.soundKey), isFalse);
      expect(
        reloaded.getBool(NotificationPreferencesStore.vibrationKey),
        isTrue,
      );
      expect(
        reloaded.getBool(NotificationPreferencesStore.repeatUntilViewedKey),
        isFalse,
      );
      expect(
        reloaded.getString(NotificationPreferencesStore.alertSoundKey),
        'bell',
      );
    });

    test('reads an unknown saved alert sound as the shipped default', () async {
      SharedPreferences.setMockInitialValues({
        NotificationPreferencesStore.alertSoundKey: 'mystery',
      });
      final store = NotificationPreferencesStore(
        await SharedPreferences.getInstance(),
      );
      expect(store.read(), NotificationPreferences.defaults);
    });
  });

  group('NotificationPreferencesController', () {
    late MockNotificationPreferencesRepository repository;
    late ProviderContainer container;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      final store = NotificationPreferencesStore(
        await SharedPreferences.getInstance(),
      );
      repository = MockNotificationPreferencesRepository();
      container = ProviderContainer(
        overrides: [
          notificationPreferencesStoreProvider.overrideWithValue(store),
          notificationPreferencesRepositoryProvider.overrideWithValue(
            repository,
          ),
        ],
      );
      addTearDown(container.dispose);
    });

    test('builds from the local store', () {
      expect(
        container.read(notificationPreferencesControllerProvider),
        NotificationPreferences.defaults,
      );
    });

    test('updates state only after the server accepts', () async {
      const next = NotificationPreferences(
        orderAlerts: false,
        sound: true,
        vibration: false,
      );
      when(() => repository.save(next)).thenAnswer((_) async => true);

      final saved = await container
          .read(notificationPreferencesControllerProvider.notifier)
          .update(next);

      expect(saved, isTrue);
      expect(container.read(notificationPreferencesControllerProvider), next);
      verify(() => repository.save(next)).called(1);
    });

    test('keeps the old state when the server rejects', () async {
      const next = NotificationPreferences(orderAlerts: false);
      when(() => repository.save(next)).thenAnswer((_) async => false);

      final saved = await container
          .read(notificationPreferencesControllerProvider.notifier)
          .update(next);

      expect(saved, isFalse);
      expect(
        container.read(notificationPreferencesControllerProvider),
        NotificationPreferences.defaults,
      );
    });
  });
}
