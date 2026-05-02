import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/supabase_provider.dart';
import '../data/sales_reports_repository.dart';

/// Provides the SalesReportsRepository instance.
final salesReportsRepositoryProvider = Provider<SalesReportsRepository>((ref) {
  return SalesReportsRepository(ref.read(supabaseProvider));
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

    final (start, end) = _computeDateRange(preset, customStart, customEnd);

    final repo = ref.read(salesReportsRepositoryProvider);
    return repo.fetchReport(start: start, end: end);
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetch());
  }

  (DateTime, DateTime) _computeDateRange(
    DateRangePreset preset,
    DateTime? customStart,
    DateTime? customEnd,
  ) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    switch (preset) {
      case DateRangePreset.today:
        return (today, today.add(const Duration(days: 1)).subtract(const Duration(microseconds: 1)));
      case DateRangePreset.yesterday:
        final yesterday = today.subtract(const Duration(days: 1));
        return (yesterday, yesterday.add(const Duration(days: 1)).subtract(const Duration(microseconds: 1)));
      case DateRangePreset.last7Days:
        return (today.subtract(const Duration(days: 6)), today.add(const Duration(days: 1)).subtract(const Duration(microseconds: 1)));
      case DateRangePreset.last30Days:
        return (today.subtract(const Duration(days: 29)), today.add(const Duration(days: 1)).subtract(const Duration(microseconds: 1)));
      case DateRangePreset.thisWeek:
        final weekday = today.weekday;
        final monday = today.subtract(Duration(days: weekday - 1));
        final sunday = monday.add(const Duration(days: 6));
        return (monday, sunday.add(const Duration(days: 1)).subtract(const Duration(microseconds: 1)));
      case DateRangePreset.thisMonth:
        final firstOfMonth = DateTime(today.year, today.month, 1);
        final lastOfMonth = DateTime(today.year, today.month + 1, 0);
        return (firstOfMonth, lastOfMonth.add(const Duration(days: 1)).subtract(const Duration(microseconds: 1)));
      case DateRangePreset.custom:
        final start = customStart ?? today;
        final end = customEnd ?? today;
        return (start, end.add(const Duration(days: 1)).subtract(const Duration(microseconds: 1)));
    }
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