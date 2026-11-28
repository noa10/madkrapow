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
final analyticsProvider =
    AsyncNotifierProvider<AnalyticsNotifier, AnalyticsData?>(
      AnalyticsNotifier.new,
    );

class AnalyticsNotifier extends AsyncNotifier<AnalyticsData?> {
  int _refreshVersion = 0;
  bool _hasBackgroundError = false;

  bool get hasBackgroundError => _hasBackgroundError;

  @override
  Future<AnalyticsData?> build() async {
    return _fetch();
  }

  Future<AnalyticsData?> _fetch({String range = '7d'}) async {
    final repo = ref.read(analyticsRepositoryProvider);
    return repo.fetchAnalytics(range: range);
  }

  Future<void> refresh({String range = '7d', bool background = false}) async {
    final version = ++_refreshVersion;
    final keepPrevious =
        background &&
        state.hasValue &&
        !state.isLoading &&
        (!state.hasError || _hasBackgroundError);
    if (!keepPrevious) {
      _hasBackgroundError = false;
      state = const AsyncLoading();
    }
    final result = await AsyncValue.guard(() => _fetch(range: range));
    if (version == _refreshVersion) {
      _hasBackgroundError = keepPrevious && result.hasError;
      state = _hasBackgroundError ? result.copyWithPrevious(state) : result;
    }
  }
}

/// Selected date range for analytics (7d, 30d, 90d).
final analyticsRangeProvider = StateProvider<String>((ref) => '7d');

/// Auto-refresh timer (30 seconds).
///
/// Auto-disposed so it stops when nothing watches it any more: a plain
/// `Provider` lives as long as the container, which would keep polling the
/// analytics API every 30 seconds after the screen is popped.
final analyticsAutoRefreshProvider = Provider.autoDispose<Timer?>((ref) {
  final timer = Timer.periodic(const Duration(seconds: 30), (_) {
    final range = ref.read(analyticsRangeProvider);
    ref
        .read(analyticsProvider.notifier)
        .refresh(range: range, background: true);
  });
  ref.onDispose(timer.cancel);
  return timer;
});
