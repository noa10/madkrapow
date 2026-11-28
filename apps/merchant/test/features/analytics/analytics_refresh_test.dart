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

  test('foreground refresh failures still show an error', () async {
    final repository = _Repository();
    final container = ProviderContainer(
      overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    final initial = container.read(analyticsProvider.future);
    repository.requests['7d']!.complete(_data(700));
    await initial;
    final refresh = container.read(analyticsProvider.notifier).refresh();
    repository.requests['7d']!.completeError(StateError('refresh failed'));
    await refresh;
    final state = container.read(analyticsProvider);
    expect(state.hasError, isTrue);
    expect(
      container.read(analyticsProvider.notifier).hasBackgroundError,
      isFalse,
    );
  });

  test('older background failure cannot replace a newer range', () async {
    final repository = _Repository();
    final container = ProviderContainer(
      overrides: [analyticsRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    final initial = container.read(analyticsProvider.future);
    repository.requests['7d']!.complete(_data(700));
    await initial;

    final notifier = container.read(analyticsProvider.notifier);
    final old = notifier.refresh(range: '7d', background: true);
    final newest = notifier.refresh(range: '30d');
    repository.requests['30d']!.complete(_data(3000));
    await newest;
    repository.requests['7d']!.completeError(
      StateError('old background failure'),
    );
    await old;
    final state = container.read(analyticsProvider);
    expect(state.hasError, isFalse);
    expect(state.requireValue!.pulse.revenueCents, 3000);
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

  test('response range is retained for the daily chart', () {
    final data = AnalyticsData.fromJson({
      'range': {'from': '2026-11-01', 'to': '2026-11-07'},
      'pulse': <String, dynamic>{},
      'trends': [],
    });
    expect(data.fromDate, '2026-11-01');
    expect(data.toDate, '2026-11-07');
  });

  testWidgets(
    'failed automatic refresh keeps selected day until retry succeeds',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repository = _Repository();
      AnalyticsData daily(int revenue) => AnalyticsData(
        pulse: DailyPulse.fromJson({}),
        totals: AnalyticsTotals(orderCount: 2, revenueCents: revenue + 1000),
        fromDate: '2026-11-01',
        toDate: '2026-11-02',
        trends: [
          TrendPoint.fromJson({
            'order_date': '2026-11-01',
            'revenue_cents': 1000,
            'order_count': 1,
          }),
          TrendPoint.fromJson({
            'order_date': '2026-11-02',
            'revenue_cents': revenue,
            'order_count': 1,
          }),
        ],
        topItems: const [],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            analyticsRepositoryProvider.overrideWithValue(repository),
          ],
          child: const MaterialApp(home: AnalyticsScreen()),
        ),
      );
      repository.requests['7d']!.complete(daily(2000));
      await tester.pump();
      await tester.pump();
      await tester.ensureVisible(find.text('View daily values'));
      await tester.tap(find.text('View daily values'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Nov 2, 2026'));
      await tester.tap(find.text('Nov 2, 2026'));
      await tester.pumpAndSettle();
      expect(find.text('Selected day · Nov 2, 2026'), findsOneWidget);

      await tester.pump(const Duration(seconds: 30));
      expect(find.text('Selected day · Nov 2, 2026'), findsOneWidget);
      repository.requests['7d']!.completeError(StateError('internal detail'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Selected day · Nov 2, 2026'), findsOneWidget);
      expect(find.text('RM 20.00'), findsWidgets);
      expect(
        find.text('Could not refresh analytics. Showing previous data.'),
        findsOneWidget,
      );
      expect(find.textContaining('internal detail'), findsNothing);
      await tester.tap(find.text('Retry refresh'));
      await tester.pump();
      expect(find.text('Selected day · Nov 2, 2026'), findsOneWidget);
      repository.requests['7d']!.complete(daily(3500));
      await tester.pump();
      await tester.pump();
      expect(find.text('Selected day · Nov 2, 2026'), findsOneWidget);
      expect(find.text('RM 35.00'), findsWidgets);
      expect(
        find.text('Could not refresh analytics. Showing previous data.'),
        findsNothing,
      );
    },
  );

  testWidgets('stale notice stays visible while scrolling and is announced', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final semantics = tester.ensureSemantics();
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
    await tester.pump(const Duration(seconds: 30));
    repository.requests['7d']!.completeError(StateError('failed'));
    await tester.pump();
    await tester.pump();
    const message = 'Could not refresh analytics. Showing previous data.';
    expect(
      tester
          .getSemantics(find.text(message))
          .getSemanticsData()
          .flagsCollection
          .isLiveRegion,
      isTrue,
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -450));
    await tester.pumpAndSettle();
    expect(
      tester
          .state<ScrollableState>(
            find
                .descendant(
                  of: find.byType(CustomScrollView),
                  matching: find.byType(Scrollable),
                )
                .first,
          )
          .position
          .pixels,
      greaterThan(0),
    );
    expect(find.text(message).hitTestable(), findsOneWidget);
    expect(find.text('Retry refresh').hitTestable(), findsOneWidget);
    semantics.dispose();
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

  testWidgets('foreground refresh failure shows the full error view', (
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
    await tester.tap(find.text('30d'));
    await tester.pump();
    repository.requests['30d']!.completeError(StateError('failed'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Could not load analytics'), findsOneWidget);
    expect(find.text('Retry refresh'), findsNothing);
    expect(find.text('RM 7.00'), findsNothing);

    await tester.pump(const Duration(seconds: 30));
    repository.requests['30d']!.completeError(StateError('failed again'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Could not load analytics'), findsOneWidget);
    expect(find.text('Retry refresh'), findsNothing);
    expect(find.text('RM 7.00'), findsNothing);
  });

  testWidgets('selecting a reporting period requests and displays its totals', (
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
    await tester.tap(find.text('30d'));
    await tester.pump();
    expect(find.text('Loading analytics...'), findsOneWidget);
    repository.requests['30d']!.complete(_data(3000));
    await tester.pump();
    await tester.pump();
    expect(find.text('RM 30.00'), findsWidgets);
    final segments = tester.widget<SegmentedButton<String>>(
      find.byType(SegmentedButton<String>),
    );
    expect(segments.selected, {'30d'});
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
