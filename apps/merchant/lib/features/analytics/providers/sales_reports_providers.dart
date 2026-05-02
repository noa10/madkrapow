import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../orders/providers/admin_order_providers.dart';
import '../data/sales_reports_repository.dart';

/// Provides the SalesReportsRepository instance.
final salesReportsRepositoryProvider = Provider<SalesReportsRepository>((ref) {
  final apiClient = ref.watch(merchantApiClientProvider);
  developer.log('[SalesReportsProvider] Creating repository with apiClient: $apiClient',
      name: 'salesReportsRepositoryProvider');
  return SalesReportsRepository(apiClient);
});

/// Date range preset values.
enum DateRangePreset {
  today,
  yesterday,
  last7Days,
  last30Days,
  thisWeek,
  thisMonth,
  custom,
}

/// Returns a display label for each preset.
String dateRangePresetLabel(DateRangePreset preset) {
  switch (preset) {
    case DateRangePreset.today:
      return 'Today';
    case DateRangePreset.yesterday:
      return 'Yesterday';
    case DateRangePreset.last7Days:
      return 'Last 7 Days';
    case DateRangePreset.last30Days:
      return 'Last 30 Days';
    case DateRangePreset.thisWeek:
      return 'This Week';
    case DateRangePreset.thisMonth:
      return 'This Month';
    case DateRangePreset.custom:
      return 'Custom Range';
  }
}

/// Selected date range preset.
final salesDatePresetProvider =
    StateProvider<DateRangePreset>((ref) => DateRangePreset.last7Days);

/// Custom start date (used when preset is custom).
final salesCustomStartProvider = StateProvider<DateTime?>((ref) => null);

/// Custom end date (used when preset is custom).
final salesCustomEndProvider = StateProvider<DateTime?>((ref) => null);

/// Selected category filter (null = all).
final salesCategoryFilterProvider = StateProvider<String?>((ref) => null);

/// Selected payment method filter: null=all, 'card', 'cash'.
final salesPaymentFilterProvider = StateProvider<String?>((ref) => null);

/// Sales report data provider (AsyncNotifier pattern).
final salesReportProvider =
    AsyncNotifierProvider<SalesReportNotifier, SalesReportData>(
  SalesReportNotifier.new,
);

class SalesReportNotifier extends AsyncNotifier<SalesReportData> {
  @override
  Future<SalesReportData> build() async {
    return _fetch();
  }

  Future<SalesReportData> _fetch() async {
    final preset = ref.read(salesDatePresetProvider);
    final customStart = ref.read(salesCustomStartProvider);
    final customEnd = ref.read(salesCustomEndProvider);

    developer.log('[SalesReportNotifier] _fetch() starting: preset=$preset',
        name: 'SalesReportNotifier');

    final repo = ref.read(salesReportsRepositoryProvider);
    try {
      final result = await repo.fetchReport(
        preset: _presetToParam(preset),
        customStart: customStart,
        customEnd: customEnd,
      );
      developer.log(
          '[SalesReportNotifier] _fetch() success: ${result.orders.length} orders',
          name: 'SalesReportNotifier');
      return result;
    } catch (e, st) {
      developer.log('[SalesReportNotifier] _fetch() error: $e',
          name: 'SalesReportNotifier', error: e, stackTrace: st);
      rethrow;
    }
  }

  String _presetToParam(DateRangePreset preset) {
    switch (preset) {
      case DateRangePreset.today:
        return 'today';
      case DateRangePreset.yesterday:
        return 'yesterday';
      case DateRangePreset.last7Days:
        return 'last7days';
      case DateRangePreset.last30Days:
        return 'last30days';
      case DateRangePreset.thisWeek:
        return 'thisWeek';
      case DateRangePreset.thisMonth:
        return 'thisMonth';
      case DateRangePreset.custom:
        return 'custom';
    }
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetch());
  }
}

/// Auto-refresh timer (60 seconds).
final salesReportAutoRefreshProvider = Provider<Timer?>((ref) {
  final timer = Timer.periodic(const Duration(seconds: 60), (_) {
    ref.read(salesReportProvider.notifier).refresh();
  });
  ref.onDispose(() => timer.cancel());
  return timer;
});