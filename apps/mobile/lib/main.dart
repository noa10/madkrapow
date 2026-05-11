import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config/env.dart';
import 'core/services/update/update_providers.dart';
import 'core/services/update/update_settings_service.dart';
import 'core/services/update/updater_config.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: AppEnv.supabaseUrl,
    anonKey: AppEnv.supabaseAnonKey,
  );

  await Hive.initFlutter();

  // In-app updater prerequisites. Loaded here so first frame sees them.
  final updateSettings = await UpdateSettingsService.create();
  final packageInfo = await PackageInfo.fromPlatform();

  const updaterConfig = UpdaterConfig(
    appType: 'mobile',
    tagPrefix: 'mobile-v',
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
      ],
      child: const MadKrapowApp(),
    ),
  );
}
