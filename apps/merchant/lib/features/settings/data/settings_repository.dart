import 'dart:io';
import 'dart:math';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../generated/tables/store_settings.dart';
import '../../../generated/tables/hubbopos_sync_runs.dart';
import '../../orders/data/merchant_api_client.dart';

/// Aggregated HubboPOS status from multiple tables.
class HubboPosStatus {
  final StoreSettingsRow settings;
  final int queuePending;
  final HubboposSyncRunsRow? recentSync;

  HubboPosStatus({
    required this.settings,
    required this.queuePending,
    this.recentSync,
  });
}

/// Branding data from store_branding.
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

/// Hybrid settings repository:
/// - Reads: Supabase client directly (RLS-enforced)
/// - Actions: Via MerchantApiClient -> webapp API routes
class SettingsRepository {
  SettingsRepository(this._supabase, this._apiClient);

  final SupabaseClient _supabase;
  final MerchantApiClient _apiClient;

  /// Fetch store settings from the store_settings table.
  Future<StoreSettingsRow> fetchSettings() async {
    final response = await _supabase
        .from('store_settings')
        .select()
        .limit(1)
        .single();
    return StoreSettingsRow.fromJson(response);
  }

  /// Fetch pending queue count from hubbopos_sync_queue.
  Future<int> fetchQueuePending() async {
    final response = await _supabase
        .from('hubbopos_sync_queue')
        .select('status')
        .eq('status', 'pending');
    return response.length;
  }

  /// Fetch the most recent sync run from hubbopos_sync_runs.
  Future<HubboposSyncRunsRow?> fetchRecentSync() async {
    final response = await _supabase
        .from('hubbopos_sync_runs')
        .select()
        .order('started_at', ascending: false)
        .limit(1);

    if (response.isEmpty) return null;
    return HubboposSyncRunsRow.fromJson(response.first);
  }

  /// Fetch all HubboPOS status data in parallel.
  Future<HubboPosStatus> fetchHubboPosStatus() async {
    final results = await Future.wait([
      fetchSettings(),
      fetchQueuePending(),
      fetchRecentSync(),
    ]);

    return HubboPosStatus(
      settings: results[0] as StoreSettingsRow,
      queuePending: results[1] as int,
      recentSync: results[2] as HubboposSyncRunsRow?,
    );
  }

  /// Test HubboPOS connection via the web API.
  Future<void> testConnection() async {
    await _apiClient.testHubboPosConnection();
  }

  /// Trigger a full HubboPOS sync via the web API.
  Future<void> syncNow() async {
    await _apiClient.syncHubboPos();
  }

  // ── Branding ───────────────────────────────────────────────────────

  static const _maxFileSize = 5 * 1024 * 1024;
  static const _allowedTypes = {
    'image/jpeg',
    'image/png',
    'image/webp',
  };

  /// Fetch branding fields from store_branding.
  Future<StoreBranding> fetchBranding() async {
    final response = await _supabase
        .from('store_branding')
        .select('logo_url, hero_image_url, store_name')
        .limit(1)
        .single();
    return StoreBranding.fromJson(response);
  }

  /// Validate and upload an image to Supabase Storage, then update
  /// the corresponding column in store_branding.
  /// [type] is 'logo' or 'hero'.
  Future<String> uploadImage(File file, String type) async {
    final mime = _lookupMime(file.path);
    if (!_allowedTypes.contains(mime)) {
      throw ArgumentError('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }
    final length = await file.length();
    if (length > _maxFileSize) {
      throw ArgumentError('File too large. Maximum size is 5MB.');
    }

    final ext = file.path.split('.').lastOrNull ?? 'jpg';
    final fileName = '${DateTime.now().millisecondsSinceEpoch}-${_randomString(6)}.$ext';
    final storagePath = 'store/$type-$fileName';

    await _supabase.storage
        .from('store-images')
        .upload(storagePath, file, fileOptions: FileOptions(contentType: mime));

    final publicUrl = _supabase.storage
        .from('store-images')
        .getPublicUrl(storagePath);

    final column = type == 'logo' ? 'logo_url' : 'hero_image_url';
    final row = await _supabase.from('store_branding').select('id').single();
    final id = row['id'] as String;
    await _supabase
        .from('store_branding')
        .update({column: publicUrl})
        .eq('id', id);

    return publicUrl;
  }

  /// Remove a branding image by setting its column to null.
  Future<void> removeImage(String type) async {
    final column = type == 'logo' ? 'logo_url' : 'hero_image_url';
    final row = await _supabase.from('store_branding').select('id').single();
    final id = row['id'] as String;
    await _supabase
        .from('store_branding')
        .update({column: null})
        .eq('id', id);
  }

  /// Subscribe to realtime changes on store_branding.
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

  String _lookupMime(String path) {
    final ext = path.split('.').lastOrNull?.toLowerCase() ?? '';
    return switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => 'application/octet-stream',
    };
  }

  String _randomString(int length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final rand = Random.secure();
    final sb = StringBuffer();
    for (var i = 0; i < length; i++) {
      sb.write(chars[rand.nextInt(chars.length)]);
    }
    return sb.toString();
  }
}