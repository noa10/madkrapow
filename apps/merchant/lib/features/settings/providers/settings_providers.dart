import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../orders/providers/admin_order_providers.dart';
import '../data/settings_repository.dart';

/// Provides the SettingsRepository instance.
final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  final apiClient = ref.watch(merchantApiClientProvider);
  return SettingsRepository(supabase, apiClient);
});

/// Fetches the aggregated HubboPOS status from store_settings,
/// hubbopos_sync_queue, and hubbopos_sync_runs.
final hubboPosStatusProvider =
    FutureProvider<HubboPosStatus>((ref) async {
  final repo = ref.watch(settingsRepositoryProvider);
  return repo.fetchHubboPosStatus();
});

/// Controller for HubboPOS actions (test connection, full sync).
class HubboPosActionNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> testConnection() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(settingsRepositoryProvider);
      await repo.testConnection();
    });
    // Refresh status after action
    ref.invalidate(hubboPosStatusProvider);
  }

  Future<void> syncNow() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(settingsRepositoryProvider);
      await repo.syncNow();
    });
    // Refresh status after action
    ref.invalidate(hubboPosStatusProvider);
  }
}

final hubboPosActionProvider =
    AsyncNotifierProvider<HubboPosActionNotifier, void>(
  HubboPosActionNotifier.new,
);