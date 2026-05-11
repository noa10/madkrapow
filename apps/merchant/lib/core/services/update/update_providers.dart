import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'github_updater.dart';
import 'update_controller.dart';
import 'update_settings_service.dart';
import 'updater_config.dart';

final updaterConfigProvider = Provider<UpdaterConfig>((ref) {
  throw UnimplementedError(
    'updaterConfigProvider must be overridden in main.dart',
  );
});

final updateSettingsProvider = Provider<UpdateSettingsService>((ref) {
  throw UnimplementedError(
    'updateSettingsProvider must be overridden in main.dart',
  );
});

final packageInfoProvider = Provider<PackageInfo>((ref) {
  throw UnimplementedError(
    'packageInfoProvider must be overridden in main.dart',
  );
});

final githubUpdaterProvider = Provider<GithubUpdater>((ref) {
  final updater = GithubUpdater(
    config: ref.watch(updaterConfigProvider),
    settings: ref.watch(updateSettingsProvider),
    packageInfo: ref.watch(packageInfoProvider),
  );
  ref.onDispose(updater.dispose);
  return updater;
});

final updateControllerProvider =
    ChangeNotifierProvider<UpdateController>((ref) {
  return UpdateController(
    updater: ref.watch(githubUpdaterProvider),
    settings: ref.watch(updateSettingsProvider),
  );
});
