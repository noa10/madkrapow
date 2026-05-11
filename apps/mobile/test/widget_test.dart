import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:madkrapow_mobile/app.dart';
import 'package:madkrapow_mobile/core/services/update/update_providers.dart';
import 'package:madkrapow_mobile/core/services/update/update_settings_service.dart';
import 'package:madkrapow_mobile/core/services/update/updater_config.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// In-memory GotrueAsyncStorage to avoid shared_preferences platform channel
/// in the test environment.
class _InMemoryStorage implements GotrueAsyncStorage {
  final _data = <String, String>{};

  @override
  Future<String?> getItem({required String key}) async => _data[key];

  @override
  Future<void> setItem({required String key, required String value}) async =>
      _data[key] = value;

  @override
  Future<void> removeItem({required String key}) async => _data.remove(key);
}

void main() {
  setUpAll(() async {
    await Supabase.initialize(
      url: 'https://placeholder.supabase.co',
      anonKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDYzNjE4MTMsImV4cCI6MTk2MTkzNzgxM30.placeholder',
      authOptions: FlutterAuthClientOptions(
        localStorage: EmptyLocalStorage(),
        pkceAsyncStorage: _InMemoryStorage(),
      ),
    );
  });

  testWidgets('App renders without errors', (WidgetTester tester) async {
    // Stub SharedPreferences so UpdateSettingsService can be created in tests.
    SharedPreferences.setMockInitialValues({});
    final updateSettings = await UpdateSettingsService.create();
    final packageInfo = PackageInfo(
      appName: 'test',
      packageName: 'com.test',
      version: '1.0.0',
      buildNumber: '1',
    );
    const updaterConfig = UpdaterConfig(
      appType: 'mobile',
      tagPrefix: 'mobile-v',
      repoOwner: 'noa10',
      repoName: 'madkrapow',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          updaterConfigProvider.overrideWithValue(updaterConfig),
          updateSettingsProvider.overrideWithValue(updateSettings),
          packageInfoProvider.overrideWithValue(packageInfo),
        ],
        child: const MadKrapowApp(),
      ),
    );

    // Allow the splash screen to render
    await tester.pumpAndSettle();

    // The app should render without throwing
    expect(find.byType(MadKrapowApp), findsOneWidget);

    // Drain the 3-second deferred updater check timer so it doesn't leak
    // past widget disposal and trigger a pending-timer assertion.
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
  });
}
