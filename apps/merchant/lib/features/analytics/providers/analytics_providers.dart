import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../orders/providers/admin_order_providers.dart';
import '../data/analytics_models.dart';
import '../data/analytics_repository.dart';

/// Provides the AnalyticsRepository instance.
final analyticsRepositoryProvider = Provider<AnalyticsRepository>((ref) {
  return AnalyticsRepository(ref.read(merchantApiClientProvider));
});

/// Analytics data provider (AsyncNotifier pattern).
final analyticsProvider = AsyncNotifierProvider<AnalyticsNotifier, AnalyticsData?>(
  AnalyticsNotifier.new,
);

class AnalyticsNotifier extends AsyncNotifier<AnalyticsData?> {
  @override
  Future<AnalyticsData?> build() async {
    return _fetch();
  }

  Future<AnalyticsData?> _fetch({String range = '7d'}) async {
    final repo = ref.read(analyticsRepositoryProvider);
    return repo.fetchAnalytics(range: range);
  }

  Future<void> refresh({String range = '7d'}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetch(range: range));
  }
}

/// Selected date range for analytics (7d, 30d, 90d).
final analyticsRangeProvider = StateProvider<String>((ref) => '7d');

/// Auto-refresh timer (30 seconds).
final analyticsAutoRefreshProvider = Provider<Timer?>((ref) {
  final timer = Timer.periodic(const Duration(seconds: 30), (_) {
    final range = ref.read(analyticsRangeProvider);
    ref.read(analyticsProvider.notifier).refresh(range: range);
  });
  ref.onDispose(() => timer.cancel());
  return timer;
});
