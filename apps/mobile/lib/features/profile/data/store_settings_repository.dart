import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/supabase_provider.dart';

class StoreBranding {
  const StoreBranding({
    this.logoUrl,
    this.heroImageUrl,
    required this.storeName,
  });

  final String? logoUrl;
  final String? heroImageUrl;
  final String storeName;

  factory StoreBranding.fromJson(Map<String, dynamic> json) {
    return StoreBranding(
      logoUrl: json['logo_url'] as String?,
      heroImageUrl: json['hero_image_url'] as String?,
      storeName: json['store_name'] as String? ?? 'Mad Krapow',
    );
  }
}

class StoreSettingsRepository {
  StoreSettingsRepository(this._supabase);

  final SupabaseClient _supabase;

  Future<StoreBranding> fetchBranding() async {
    final res = await _supabase
        .from('store_branding')
        .select('logo_url, hero_image_url, store_name')
        .limit(1)
        .single();
    return StoreBranding.fromJson(res);
  }

  RealtimeChannel subscribeToBrandingChanges({
    required void Function() onChange,
  }) {
    return _supabase
        .channel('store-branding-changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'store_branding',
          callback: (_) => onChange(),
        )
        .subscribe();
  }
}

final storeSettingsRepositoryProvider = Provider<StoreSettingsRepository>((ref) {
  return StoreSettingsRepository(ref.watch(supabaseProvider));
});

final storeBrandingProvider = FutureProvider<StoreBranding>((ref) async {
  final repo = ref.watch(storeSettingsRepositoryProvider);
  return repo.fetchBranding();
});

/// Whether a branding update was recently received (shows indicator).
final brandingUpdatedProvider = StateProvider<bool>((ref) => false);

/// Holds the active realtime channel subscription for branding, or null.
final brandingRealtimeSubscriptionProvider =
    StateProvider<RealtimeChannel?>((ref) => null);

/// Watcher provider that subscribes to store_branding realtime changes
/// and invalidates the storeBrandingProvider when changes occur.
/// Uses a 3-second debounce to avoid rapid re-fetches.
final brandingRealtimeWatcherProvider = Provider<void>((ref) {
  final repo = ref.watch(storeSettingsRepositoryProvider);
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
