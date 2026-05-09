import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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

// ── Branding providers ────────────────────────────────────────────────

/// Fetches current store branding (logo, hero, store name).
final storeBrandingProvider = FutureProvider<StoreBranding>((ref) async {
  final repo = ref.watch(settingsRepositoryProvider);
  return repo.fetchBranding();
});

/// Controller for branding upload / remove actions.
class BrandingActionNotifier extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> uploadImage(File file, String type) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(settingsRepositoryProvider);
      await repo.uploadImage(file, type);
    });
    ref.invalidate(storeBrandingProvider);
  }

  Future<void> removeImage(String type) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(settingsRepositoryProvider);
      await repo.removeImage(type);
    });
    ref.invalidate(storeBrandingProvider);
  }
}

final brandingActionProvider =
    AsyncNotifierProvider<BrandingActionNotifier, void>(
  BrandingActionNotifier.new,
);

/// Holds the active realtime channel subscription for branding, or null.
final brandingRealtimeSubscriptionProvider =
    StateProvider<RealtimeChannel?>((ref) => null);

/// Whether a branding update was recently received (shows indicator).
final brandingUpdatedProvider = StateProvider<bool>((ref) => false);

/// Watcher provider that subscribes to store_branding realtime changes
/// and invalidates the storeBrandingProvider when changes occur.
/// Uses a 3-second debounce to avoid rapid re-fetches.
final brandingRealtimeWatcherProvider = Provider<void>((ref) {
  final repo = ref.watch(settingsRepositoryProvider);
  RealtimeChannel? channel;
  Timer? debounce;
  Timer? clearIndicator;

  void onBrandingChange() {
    debounce?.cancel();
    debounce = Timer(const Duration(seconds: 3), () {
      ref.invalidate(storeBrandingProvider);
      ref.read(brandingUpdatedProvider.notifier).state = true;
      clearIndicator?.cancel();
      clearIndicator = Timer(const Duration(seconds: 3), () {
        ref.read(brandingUpdatedProvider.notifier).state = false;
      });
    });
  }

  ref.onDispose(() {
    debounce?.cancel();
    clearIndicator?.cancel();
    if (channel != null) {
      channel.unsubscribe();
    }
  });

  channel = repo.subscribeToBrandingChanges(onChange: onBrandingChange);
});