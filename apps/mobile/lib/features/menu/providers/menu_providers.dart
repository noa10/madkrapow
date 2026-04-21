import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/utils/operating_hours.dart';
import '../data/menu_repository.dart';

// ── Re-export models from data layer ──────────────────────────────
export '../data/menu_repository.dart';

/// Whether the store is currently open.
/// Returns null while loading.
final storeOpenProvider = Provider<bool?>((ref) {
  final settingsAsync = ref.watch(storeSettingsProvider);
  return settingsAsync.when(
    data: (settings) {
      try {
        final hours = parseOperatingHours(
          Map<String, dynamic>.from(settings.operatingHours),
        );
        return isStoreOpen(hours);
      } catch (_) {
        return true;
      }
    },
    loading: () => null,
    error: (error, stack) => null,
  );
});

// ── Realtime subscription providers ────────────────────────────────

/// Holds the active realtime channel subscription, or null.
final menuRealtimeSubscriptionProvider =
    StateProvider<RealtimeChannel?>((ref) => null);

/// Whether a menu update was recently received (shows "Menu updated" indicator).
final menuUpdatedProvider = StateProvider<bool>((ref) => false);

/// Watcher provider that subscribes to menu realtime changes and
/// invalidates the categoriesWithItemsProvider when changes occur.
/// Uses a 5-second debounce to avoid rapid re-fetches.
final menuRealtimeWatcherProvider = Provider<void>((ref) {
  final repo = ref.watch(menuRepositoryProvider);
  RealtimeChannel? channel;
  Timer? debounce;

  void onMenuChange() {
    debounce?.cancel();
    debounce = Timer(const Duration(seconds: 5), () {
      ref.invalidate(categoriesWithItemsProvider);
      ref.read(menuUpdatedProvider.notifier).state = true;
      // Reset indicator after 3 seconds
      Timer(const Duration(seconds: 3), () {
        ref.read(menuUpdatedProvider.notifier).state = false;
      });
    });
  }

  ref.onDispose(() {
    debounce?.cancel();
    if (channel != null) {
      repo.unsubscribeFromMenuChanges(channel);
    }
  });

  channel = repo.subscribeToMenuChanges(onChange: onMenuChange);
  ref.read(menuRealtimeSubscriptionProvider.notifier).state = channel;
});

/// 60-second periodic fallback provider.
/// Refreshes menu data even if realtime subscription drops.
final menuPeriodicRefreshProvider = Provider<Timer?>((ref) {
  final timer = Timer.periodic(
    const Duration(seconds: 60),
    (_) {
      ref.invalidate(categoriesWithItemsProvider);
    },
  );

  ref.onDispose(() => timer.cancel());
  return timer;
});
