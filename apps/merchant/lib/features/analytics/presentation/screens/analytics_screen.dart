import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    // Auto-refresh (30s) — watching this keeps the timer alive.
    ref.watch(analyticsAutoRefreshProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.read(analyticsProvider.notifier).refresh(range: range);
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Row(
                  children: ['7d', '30d', '90d']
                      .map((r) => _RangeChip(
                            label: r,
                            selected: range == r,
                            onTap: () {
                              ref.read(analyticsRangeProvider.notifier).state = r;
                              ref.read(analyticsProvider.notifier).refresh(range: r);
                            },
                          ))
                      .toList(),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: analytics.when(
                  data: (data) {
                    if (data == null) {
                      return const _EmptyAnalyticsView();
                    }
                    return _AnalyticsContent(data: data);
                  },
                  loading: () => const _LoadingAnalyticsView(),
                  error: (error, stack) => _ErrorAnalyticsView(
                    error: error,
                    onRetry: () {
                      ref.read(analyticsProvider.notifier).refresh(range: range);
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RangeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _RangeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8.0),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
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
        DailyPulseCard(pulse: data.pulse, totals: data.totals),
        const SizedBox(height: 16),
        RevenueChart(trends: data.trends),
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
  final Object error;
  final VoidCallback onRetry;

  const _ErrorAnalyticsView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.red),
          const SizedBox(height: 8),
          Text(error.toString()),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _EmptyAnalyticsView extends StatelessWidget {
  const _EmptyAnalyticsView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text('No analytics data available'),
    );
  }
}
