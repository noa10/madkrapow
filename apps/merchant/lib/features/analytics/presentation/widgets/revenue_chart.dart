import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../data/analytics_models.dart';

class RevenueChart extends StatefulWidget {
  final List<TrendPoint> trends;
  final AnalyticsTotals? totals;
  final String? fromDate;
  final String? toDate;

  const RevenueChart({
    super.key,
    required this.trends,
    this.totals,
    this.fromDate,
    this.toDate,
  });

  @override
  State<RevenueChart> createState() => _RevenueChartState();
}

class _RevenueChartState extends State<RevenueChart> {
  String? _selectedDate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    DateTime day(String value) {
      final date = DateTime.parse(value);
      return DateTime.utc(date.year, date.month, date.day);
    }

    final existing = [...widget.trends]
      ..sort((a, b) => a.orderDate.compareTo(b.orderDate));
    final from =
        widget.fromDate ?? (existing.isEmpty ? null : existing.first.orderDate);
    final to =
        widget.toDate ?? (existing.isEmpty ? null : existing.last.orderDate);
    final byDate = {for (final point in existing) point.orderDate: point};
    final sorted = <TrendPoint>[
      if (from != null && to != null)
        for (
          var date = day(from);
          !date.isAfter(day(to));
          date = date.add(const Duration(days: 1))
        )
          byDate[date.toIso8601String().substring(0, 10)] ??
              TrendPoint.fromJson({
                'order_date': date.toIso8601String().substring(0, 10),
              }),
    ];
    final selected =
        sorted.where((p) => p.orderDate == _selectedDate).firstOrNull ??
        (sorted.isEmpty ? null : sorted.first);
    final dateFormat = DateFormat('MMM d, yyyy');

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (selected != null || widget.totals != null) ...[
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    selected == null
                        ? 'Selected period total'
                        : 'Selected day · ${dateFormat.format(day(selected.orderDate))}',
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 2,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Sales'),
                            Text(
                              formatCents(
                                selected?.revenueCents ??
                                    widget.totals?.revenueCents ??
                                    0,
                              ),
                              style: theme.textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Orders'),
                            Text(
                              '${selected?.orderCount ?? widget.totals?.orderCount ?? 0} orders',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
          ],
          if (selected == null)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Text('No revenue data available for this period.'),
            )
          else
            Builder(
              builder: (context) {
                final first = day(sorted.first.orderDate);
                final span = day(
                  sorted.last.orderDate,
                ).difference(first).inDays;
                final points = {
                  for (final p in sorted)
                    day(p.orderDate).difference(first).inDays: p,
                };
                final highest = sorted
                    .map((p) => p.revenueCents / 100)
                    .reduce(math.max);
                final lowest = sorted
                    .map((p) => p.revenueCents / 100)
                    .reduce(math.min);
                final maxY = highest > 0 ? highest * 1.15 : 1.0;
                final minY = lowest < 0 ? lowest * 1.15 : 0.0;
                final labelEvery = math.min(3, math.max(1, (span / 4).ceil()));
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Daily revenue (RM) · days without sales show zero',
                        style: theme.textTheme.bodySmall,
                      ),
                      const SizedBox(height: 20),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          return SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: SizedBox(
                              width: math.max(
                                constraints.maxWidth,
                                (span + 1) * 36.0,
                              ),
                              height: 230,
                              child: BarChart(
                                BarChartData(
                                  minY: minY,
                                  maxY: maxY,
                                  alignment: BarChartAlignment.spaceAround,
                                  borderData: FlBorderData(show: false),
                                  gridData: FlGridData(
                                    drawVerticalLine: false,
                                    getDrawingHorizontalLine: (_) => FlLine(
                                      color: theme.colorScheme.outlineVariant
                                          .withValues(alpha: .45),
                                      strokeWidth: 1,
                                      dashArray: [5, 5],
                                    ),
                                  ),
                                  titlesData: FlTitlesData(
                                    topTitles: const AxisTitles(
                                      sideTitles: SideTitles(showTitles: false),
                                    ),
                                    rightTitles: const AxisTitles(
                                      sideTitles: SideTitles(showTitles: false),
                                    ),
                                    leftTitles: AxisTitles(
                                      sideTitles: SideTitles(
                                        showTitles: true,
                                        reservedSize: 45,
                                        getTitlesWidget: (value, meta) => Text(
                                          value.abs() >= 1000
                                              ? '${(value / 1000).toStringAsFixed(1)}k'
                                              : value.toStringAsFixed(
                                                  value.abs() < 10 &&
                                                          value !=
                                                              value
                                                                  .roundToDouble()
                                                      ? 1
                                                      : 0,
                                                ),
                                          style: theme.textTheme.labelSmall,
                                        ),
                                      ),
                                    ),
                                    bottomTitles: AxisTitles(
                                      sideTitles: SideTitles(
                                        showTitles: true,
                                        reservedSize: 28,
                                        getTitlesWidget: (value, meta) {
                                          final index = value.toInt();
                                          if (index % labelEvery != 0) {
                                            return const SizedBox.shrink();
                                          }
                                          return Padding(
                                            padding: const EdgeInsets.only(
                                              top: 8,
                                            ),
                                            child: Text(
                                              DateFormat('MMM d').format(
                                                first.add(
                                                  Duration(days: index),
                                                ),
                                              ),
                                              style: theme.textTheme.labelSmall,
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                  ),
                                  barTouchData: BarTouchData(
                                    touchCallback: (event, response) {
                                      if (!event.isInterestedForInteractions ||
                                          response?.spot == null) {
                                        return;
                                      }
                                      final point =
                                          points[response!
                                              .spot!
                                              .touchedBarGroup
                                              .x];
                                      if (point != null &&
                                          point.orderDate !=
                                              selected.orderDate) {
                                        setState(
                                          () => _selectedDate = point.orderDate,
                                        );
                                      }
                                    },
                                    touchTooltipData: BarTouchTooltipData(
                                      getTooltipItem:
                                          (group, groupIndex, rod, rodIndex) {
                                            final point = points[group.x];
                                            if (point == null) return null;
                                            return BarTooltipItem(
                                              '${dateFormat.format(day(point.orderDate))}\n${formatCents(point.revenueCents)} · ${point.orderCount} orders',
                                              (theme.textTheme.labelMedium ??
                                                      const TextStyle())
                                                  .copyWith(
                                                    color: theme
                                                        .colorScheme
                                                        .onInverseSurface,
                                                  ),
                                            );
                                          },
                                    ),
                                  ),
                                  barGroups: [
                                    for (var i = 0; i <= span; i++)
                                      BarChartGroupData(
                                        x: i,
                                        barRods: [
                                          if (points[i] case final point?)
                                            BarChartRodData(
                                              toY: point.revenueCents / 100,
                                              width: 12,
                                              borderRadius:
                                                  const BorderRadius.vertical(
                                                    top: Radius.circular(4),
                                                  ),
                                              color: point.revenueCents == 0
                                                  ? Colors.transparent
                                                  : point.orderDate ==
                                                        selected.orderDate
                                                  ? theme.colorScheme.primary
                                                  : theme.colorScheme.primary
                                                        .withValues(alpha: .25),
                                            ),
                                        ],
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text(
                          'View daily values',
                          style: theme.textTheme.labelLarge,
                        ),
                        children: [
                          for (final point in sorted)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              selected: point.orderDate == selected.orderDate,
                              title: Text(
                                dateFormat.format(day(point.orderDate)),
                              ),
                              subtitle: Text('${point.orderCount} orders'),
                              trailing: Text(formatCents(point.revenueCents)),
                              onTap: () => setState(
                                () => _selectedDate = point.orderDate,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
