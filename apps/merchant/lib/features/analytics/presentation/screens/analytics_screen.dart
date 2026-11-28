import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../data/analytics_models.dart';
import '../../providers/analytics_providers.dart';
import '../widgets/daily_pulse_card.dart';
import '../widgets/revenue_chart.dart';
import '../widgets/top_items_list.dart';
import '../widgets/promo_performance_card.dart';

class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analytics = ref.watch(analyticsProvider);
    final range = ref.watch(analyticsRangeProvider);
    final hasBackgroundError = ref
        .read(analyticsProvider.notifier)
        .hasBackgroundError;
    // Auto-refresh (30s) — watching this keeps the timer alive.
    ref.watch(analyticsAutoRefreshProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Analytics')),
      body: Column(
        children: [
          if (hasBackgroundError)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      'Could not refresh analytics. Showing previous data.',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => ref
                        .read(analyticsProvider.notifier)
                        .refresh(range: range, background: true),
                    child: const Text('Retry refresh'),
                  ),
                ],
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () =>
                  ref.read(analyticsProvider.notifier).refresh(range: range),
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 720),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Reporting period',
                                style: Theme.of(context).textTheme.labelLarge,
                              ),
                              const SizedBox(height: 8),
                              SizedBox(
                                width: double.infinity,
                                child: SegmentedButton<String>(
                                  segments: const [
                                    ButtonSegment(
                                      value: '7d',
                                      label: Text('7d'),
                                    ),
                                    ButtonSegment(
                                      value: '30d',
                                      label: Text('30d'),
                                    ),
                                    ButtonSegment(
                                      value: '90d',
                                      label: Text('90d'),
                                    ),
                                  ],
                                  selected: {range},
                                  showSelectedIcon: false,
                                  onSelectionChanged: (selection) {
                                    final r = selection.single;
                                    ref
                                            .read(
                                              analyticsRangeProvider.notifier,
                                            )
                                            .state =
                                        r;
                                    ref
                                        .read(analyticsProvider.notifier)
                                        .refresh(range: r);
                                  },
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 720),
                          child: analytics.when(
                            skipError: hasBackgroundError,
                            data: (data) {
                              if (data == null) {
                                return const _EmptyAnalyticsView();
                              }
                              return _AnalyticsContent(data: data);
                            },
                            loading: () => const _LoadingAnalyticsView(),
                            error: (error, stack) => _ErrorAnalyticsView(
                              onRetry: () {
                                ref
                                    .read(analyticsProvider.notifier)
                                    .refresh(range: range);
                              },
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AnalyticsContent extends StatelessWidget {
  final AnalyticsData data;

  const _AnalyticsContent({required this.data});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        RevenueChart(
          trends: data.trends,
          totals: data.totals,
          fromDate: data.fromDate,
          toDate: data.toDate,
        ),
        const SizedBox(height: 16),
        DailyPulseCard(pulse: data.pulse, totals: data.totals),
        const SizedBox(height: 16),
        TopItemsList(items: data.topItems),
        const SizedBox(height: 16),
        const PromoPerformanceCard(),
      ],
    );
  }
}

class _LoadingAnalyticsView extends StatelessWidget {
  const _LoadingAnalyticsView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Loading analytics...'),
        ],
      ),
    );
  }
}

class _ErrorAnalyticsView extends StatelessWidget {
  final VoidCallback onRetry;

  const _ErrorAnalyticsView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return AppEmptyState(
      icon: Icons.error_outline,
      title: 'Could not load analytics',
      message: 'Check your connection and try again.',
      action: OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
    );
  }
}

class _EmptyAnalyticsView extends StatelessWidget {
  const _EmptyAnalyticsView();

  @override
  Widget build(BuildContext context) {
    return const AppEmptyState(
      icon: Icons.bar_chart,
      title: 'No analytics data available',
      message: 'Try widening the date range.',
    );
  }
}
