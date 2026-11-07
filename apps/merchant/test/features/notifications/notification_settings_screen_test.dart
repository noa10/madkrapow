import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/notifications/data/local_order_notifications.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences_repository.dart';
import 'package:madkrapow_merchant/features/notifications/data/notification_preferences_store.dart';
import 'package:madkrapow_merchant/features/notifications/presentation/screens/notification_settings_screen.dart';
import 'package:madkrapow_merchant/features/notifications/providers/notification_providers.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MockNotificationPreferencesRepository extends Mock
    implements NotificationPreferencesRepository {}

class FakeLocalOrderNotifications extends LocalOrderNotifications {
  NotificationPreferences? tested;

  @override
  Future<void> showTest(NotificationPreferences preferences) async {
    tested = preferences;
  }
}

void main() {
  late MockNotificationPreferencesRepository repository;
  late FakeLocalOrderNotifications local;
  late NotificationPreferencesStore store;

  Future<void> pumpScreen(
    WidgetTester tester, {
    NotificationPermissionState permission =
        NotificationPermissionState.granted,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          notificationPreferencesStoreProvider.overrideWithValue(store),
          notificationPreferencesRepositoryProvider.overrideWithValue(
            repository,
          ),
          notificationPermissionProvider.overrideWith(
            (ref) async => permission,
          ),
          localOrderNotificationsProvider.overrideWithValue(local),
        ],
        child: const MaterialApp(home: NotificationSettingsScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  SwitchListTile tile(WidgetTester tester, String title) =>
      tester.widget<SwitchListTile>(find.widgetWithText(SwitchListTile, title));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    store = NotificationPreferencesStore(await SharedPreferences.getInstance());
    repository = MockNotificationPreferencesRepository();
    local = FakeLocalOrderNotifications();
  });

  testWidgets('turns off sound and vibration controls with the master switch', (
    tester,
  ) async {
    const next = NotificationPreferences(orderAlerts: false);
    when(() => repository.save(next)).thenAnswer((_) async => true);
    await pumpScreen(tester);

    expect(tile(tester, 'New order alerts').value, isTrue);
    expect(tile(tester, 'Repeat until viewed').value, isTrue);
    expect(tile(tester, 'Repeat until viewed').onChanged, isNotNull);
    expect(tile(tester, 'Sound').onChanged, isNotNull);
    expect(tile(tester, 'Vibration').onChanged, isNotNull);

    await tester.tap(find.text('New order alerts'));
    await tester.pumpAndSettle();

    expect(tile(tester, 'New order alerts').value, isFalse);
    expect(tile(tester, 'Repeat until viewed').value, isTrue);
    expect(tile(tester, 'Repeat until viewed').onChanged, isNull);
    expect(tile(tester, 'Sound').value, isTrue);
    expect(tile(tester, 'Sound').onChanged, isNull);
    expect(tile(tester, 'Vibration').onChanged, isNull);
    verify(() => repository.save(next)).called(1);
  });

  testWidgets('saves the repeat-until-viewed preference', (tester) async {
    const next = NotificationPreferences(repeatUntilViewed: false);
    when(() => repository.save(next)).thenAnswer((_) async => true);
    await pumpScreen(tester);

    await tester.tap(find.text('Repeat until viewed'));
    await tester.pumpAndSettle();

    expect(tile(tester, 'Repeat until viewed').value, isFalse);
    expect(tile(tester, 'Sound').value, isTrue);
    verify(() => repository.save(next)).called(1);
  });

  testWidgets('saves a sound change and keeps it after the rebuild', (
    tester,
  ) async {
    const next = NotificationPreferences(sound: false);
    when(() => repository.save(next)).thenAnswer((_) async => true);
    await pumpScreen(tester);

    await tester.tap(find.text('Sound'));
    await tester.pumpAndSettle();

    expect(tile(tester, 'Sound').value, isFalse);
    verify(() => repository.save(next)).called(1);
  });

  testWidgets('hides the sound choices while sound is off', (tester) async {
    const next = NotificationPreferences(sound: false);
    when(() => repository.save(next)).thenAnswer((_) async => true);
    await pumpScreen(tester);

    expect(find.text('Krapow chime'), findsOneWidget);
    expect(find.text('Service bell'), findsOneWidget);
    expect(find.text('Light chime'), findsOneWidget);
    expect(find.text('System default'), findsOneWidget);

    await tester.tap(find.text('Sound'));
    await tester.pumpAndSettle();

    expect(find.text('Krapow chime'), findsNothing);
    expect(find.text('Service bell'), findsNothing);
  });

  testWidgets('saves a chosen alert sound and previews it with the test alert', (
    tester,
  ) async {
    const next = NotificationPreferences(alertSound: AlertSound.bell);
    when(() => repository.save(next)).thenAnswer((_) async => true);
    await pumpScreen(tester);

    RadioGroup<AlertSound> group() =>
        tester.widget<RadioGroup<AlertSound>>(
          find.byType(RadioGroup<AlertSound>),
        );
    expect(group().groupValue, AlertSound.krapow);

    await tester.ensureVisible(find.text('Service bell'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Service bell'));
    await tester.pumpAndSettle();

    expect(group().groupValue, AlertSound.bell);
    verify(() => repository.save(next)).called(1);

    await tester.ensureVisible(find.text('Send test alert'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send test alert'));
    await tester.pumpAndSettle();
    expect(local.tested?.alertSound, AlertSound.bell);
  });

  testWidgets('keeps the old value when the server rejects the save', (
    tester,
  ) async {
    const next = NotificationPreferences(sound: false);
    when(() => repository.save(next)).thenAnswer((_) async => false);
    await pumpScreen(tester);

    await tester.tap(find.text('Sound'));
    await tester.pumpAndSettle();

    expect(tile(tester, 'Sound').value, isTrue);
    expect(
      find.text(
        'Could not save. This device may not be registered for alerts yet.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('sends a test alert with the current preferences', (
    tester,
  ) async {
    await pumpScreen(tester);

    await tester.scrollUntilVisible(
      find.text('Send test alert'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send test alert'));
    await tester.pumpAndSettle();

    expect(local.tested, NotificationPreferences.defaults);
    expect(find.text('Test alert sent.'), findsOneWidget);
  });

  testWidgets('explains a blocked permission and offers system settings', (
    tester,
  ) async {
    await pumpScreen(tester, permission: NotificationPermissionState.denied);

    expect(find.text('Notifications are blocked'), findsOneWidget);
    expect(find.text('Open system settings'), findsOneWidget);
  });
}
