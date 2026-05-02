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
}