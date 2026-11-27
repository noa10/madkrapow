import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/analytics/data/analytics_models.dart';
import 'package:madkrapow_merchant/features/analytics/data/analytics_repository.dart';
import 'package:madkrapow_merchant/features/analytics/presentation/screens/analytics_screen.dart';
import 'package:madkrapow_merchant/features/analytics/providers/analytics_providers.dart';

class _Repository implements AnalyticsRepository {
  final requests = <String, Completer<AnalyticsData>>{};

  @override
  Future<AnalyticsData> fetchAnalytics({
    String range = '7d',
    String? from,
    String? to,
  }) {
    final request = Completer<AnalyticsData>();
    requests[range] = request;
    return request.future;
  }
}

AnalyticsData _data(int revenue) => AnalyticsData(
  pulse: DailyPulse.fromJson({'revenue_cents': revenue}),
  totals: AnalyticsTotals(orderCount: 1, revenueCents: revenue),
  trends: const [],
  topItems: const [],
);

void main() {
  test('fractional average is rounded to the nearest cent', () {
    expect(
      DailyPulse.fromJson({'avg_order_cents': 1234.6}).avgOrderCents,
      1235,
    );
    expect(DailyPulse.fromJson({'avg_order_cents': 1234}).avgOrderCents, 1234);
    expect(DailyPulse.fromJson({}).avgOrderCents, 0);
  });

  test('older refresh completion cannot replace a newer range', () async {
    final repository = _Repository();
    final container = ProviderContainer(
      overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    final initial = container.read(analyticsProvider.future);
    repository.requests['7d']!.complete(_data(700));
    await initial;

    final notifier = container.read(analyticsProvider.notifier);
    final old = notifier.refresh(range: '30d');
    final newest = notifier.refresh(range: '90d');
    repository.requests['90d']!.complete(_data(900));
    await newest;
    repository.requests['30d']!.complete(_data(300));
    await old;
    expect(
      container.read(analyticsProvider).requireValue!.pulse.revenueCents,
      900,
    );
  });

  test('older failure cannot replace a newer successful refresh', () async {
    final repository = _Repository();
    final container = ProviderContainer(
      overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    final initial = container.read(analyticsProvider.future);
    repository.requests['7d']!.complete(_data(700));
    await initial;

    final notifier = container.read(analyticsProvider.notifier);
    final old = notifier.refresh(range: '30d');
    final newest = notifier.refresh(range: '90d');
    repository.requests['90d']!.complete(_data(900));
    await newest;
    repository.requests['30d']!.completeError(StateError('old request failed'));
    await old;
    expect(
      container.read(analyticsProvider).requireValue!.pulse.revenueCents,
      900,
    );
  });

  test('older completion keeps the newer request loading', () async {
    final repository = _Repository();
    final container = ProviderContainer(
      overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    final initial = container.read(analyticsProvider.future);
    repository.requests['7d']!.complete(_data(700));
    await initial;

    final notifier = container.read(analyticsProvider.notifier);
    final old = notifier.refresh(range: '30d');
    final newest = notifier.refresh(range: '90d');
    repository.requests['30d']!.complete(_data(300));
    await old;
    expect(container.read(analyticsProvider).isLoading, isTrue);
    repository.requests['90d']!.complete(_data(900));
    await newest;
    expect(
      container.read(analyticsProvider).requireValue!.pulse.revenueCents,
      900,
    );
  });

  test('initial request cannot replace a newer refresh', () async {
    final repository = _Repository();
    final container = ProviderContainer(
      overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    final initial = container.read(analyticsProvider.future);
    final refresh = container
        .read(analyticsProvider.notifier)
        .refresh(range: '90d');
    repository.requests['90d']!.complete(_data(900));
    await refresh;
    repository.requests['7d']!.complete(_data(700));
    await initial;
    expect(
      container.read(analyticsProvider).requireValue!.pulse.revenueCents,
      900,
    );
  });

  test('auto refresh timer is released once nothing watches it', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final subscription = container.listen(
      analyticsAutoRefreshProvider,
      (_, _) {},
    );
    expect(container.exists(analyticsAutoRefreshProvider), isTrue);

    subscription.close();
    await Future<void>.delayed(Duration.zero);

    expect(container.exists(analyticsAutoRefreshProvider), isFalse);
  });

  testWidgets('failed loads show a useful retry without exposing raw errors', (
    tester,
  ) async {
    final repository = _Repository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
        child: const MaterialApp(home: AnalyticsScreen()),
      ),
    );
    expect(find.text('Loading analytics...'), findsOneWidget);
    repository.requests['7d']!.completeError(StateError('internal detail'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Could not load analytics'), findsOneWidget);
    expect(find.textContaining('internal detail'), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pump();
    repository.requests['7d']!.complete(_data(700));
    await tester.pump();
    await tester.pump();
    expect(find.text('RM 7.00'), findsWidgets);
  });

  testWidgets('pull to refresh remains pending until the request completes', (
    tester,
  ) async {
    final repository = _Repository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
        child: const MaterialApp(home: AnalyticsScreen()),
      ),
    );
    repository.requests['7d']!.complete(_data(700));
    await tester.pump();
    await tester.pump();

    var finished = false;
    final pending = tester
        .widget<RefreshIndicator>(find.byType(RefreshIndicator))
        .onRefresh()
        .then((_) => finished = true);
    await tester.pump();
    expect(finished, isFalse);
    repository.requests['7d']!.complete(_data(800));
    await pending;
    await tester.pump();
    expect(finished, isTrue);
  });
}
