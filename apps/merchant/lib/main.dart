import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config/env.dart';
import 'core/services/update/update_providers.dart';
import 'core/services/update/update_settings_service.dart';
import 'core/services/update/updater_config.dart';
import 'features/notifications/data/local_order_notifications.dart';
import 'features/notifications/data/notification_preferences_store.dart';
import 'features/notifications/providers/notification_providers.dart';

/// Whether Firebase initialized successfully.
/// Used to guard FCM calls when config files are missing.
bool firebaseInitialized = false;
LocalOrderNotifications? localOrderNotifications;

/// Top-level background message handler.
/// Required for FCM to work when the app is in the background/terminated.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  registerMadkrapowUiLicenses();

  await Supabase.initialize(
    url: AppEnv.supabaseUrl,
    anonKey: AppEnv.supabaseAnonKey,
  );

  // Android reads the real configuration generated from google-services.json.
  // Debug builds without that file stay usable, with a visible warning.
  try {
    await Firebase.initializeApp();
    firebaseInitialized = true;
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  } catch (_) {
    debugPrint(
      'Firebase initialization failed; order notifications are unavailable.',
    );
  }

  if (firebaseInitialized) {
    try {
      final localNotifications = LocalOrderNotifications();
      await localNotifications.initialize();
      localOrderNotifications = localNotifications;
    } catch (_) {
      debugPrint('Local order notification setup failed.');
    }
    try {
      await FirebaseMessaging.instance.requestPermission();
    } catch (_) {
      debugPrint('Could not request order notification permission.');
    }
  }

  await Hive.initFlutter();

  // Local notification preferences are read synchronously by the settings UI
  // and the foreground alert handler.
  final sharedPreferences = await SharedPreferences.getInstance();
  final notificationPreferences = NotificationPreferencesStore(sharedPreferences);

  // In-app updater prerequisites. Loaded here so first frame sees them.
  final updateSettings = await UpdateSettingsService.create();
  final packageInfo = await PackageInfo.fromPlatform();

  const updaterConfig = UpdaterConfig(
    appType: 'merchant',
    tagPrefix: 'merchant-v',
    repoOwner: 'noa10',
    repoName: 'madkrapow',
    githubToken: String.fromEnvironment('GITHUB_TOKEN'),
  );

  runApp(
    ProviderScope(
      overrides: [
        updaterConfigProvider.overrideWithValue(updaterConfig),
        updateSettingsProvider.overrideWithValue(updateSettings),
        packageInfoProvider.overrideWithValue(packageInfo),
        notificationPreferencesStoreProvider.overrideWithValue(
          notificationPreferences,
        ),
      ],
      child: const MerchantApp(),
    ),
  );
}
