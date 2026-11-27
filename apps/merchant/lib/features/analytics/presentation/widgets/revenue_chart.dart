import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../data/analytics_models.dart';

class RevenueChart extends StatelessWidget {
  final List<TrendPoint> trends;

  const RevenueChart({super.key, required this.trends});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sorted = [...trends]
      ..sort((a, b) => a.orderDate.compareTo(b.orderDate));
    if (sorted.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Revenue trend'),
              SizedBox(height: 16),
              Text('No revenue data available for this period.'),
            ],
          ),
        ),
      );
    }

    // UTC calendar days keep adjacent dates equally spaced across DST changes.
    DateTime day(String value) {
      final date = DateTime.parse(value);
      return DateTime.utc(date.year, date.month, date.day);
    }

    final first = day(sorted.first.orderDate);
    final spots = <FlSpot>[];
    int? previousDay;
    for (final point in sorted) {
      final offset = day(point.orderDate).difference(first).inDays;
      if (previousDay != null && offset - previousDay > 1) {
        spots.add(FlSpot.nullSpot);
      }
      spots.add(FlSpot(offset.toDouble(), point.revenueCents / 100));
      previousDay = offset;
    }
    final values = sorted.map((point) => point.revenueCents / 100);
    final lowest = values.reduce(math.min);
    final highest = values.reduce(math.max);
    final minY = math.min(0.0, lowest * 1.1);
    final maxY = highest > 0 ? highest * 1.15 : 1.0;
    final span = day(sorted.last.orderDate).difference(first).inDays;
    final axisInterval = math.max(1, (span / 3).ceil()).toDouble();
    final dateFormat = DateFormat('MMM d');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Revenue trend',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Daily revenue · gaps indicate missing data',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              height: 210,
              child: LineChart(
                LineChartData(
                  minX: span == 0 ? -0.5 : 0,
                  maxX: span == 0 ? 0.5 : span.toDouble(),
                  minY: minY,
                  maxY: maxY,
                  gridData: FlGridData(
                    drawVerticalLine: false,
                    getDrawingHorizontalLine: (_) => FlLine(
                      color: theme.colorScheme.outlineVariant.withValues(
                        alpha: .35,
                      ),
                      strokeWidth: 1,
                    ),
                  ),
                  borderData: FlBorderData(show: false),
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
                        reservedSize: 52,
                        getTitlesWidget: (value, meta) => Text(
                          value.abs() >= 1000
                              ? '${(value / 1000).toStringAsFixed(1)}k'
                              : value.toStringAsFixed(
                                  value.abs() < 10 &&
                                          value != value.roundToDouble()
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
                        interval: axisInterval,
                        getTitlesWidget: (value, meta) {
                          if (value < 0 ||
                              value > span ||
                              value != value.roundToDouble()) {
                            return const SizedBox.shrink();
                          }
                          return Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              dateFormat.format(
                                first.add(Duration(days: value.toInt())),
                              ),
                              style: theme.textTheme.labelSmall,
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  lineTouchData: LineTouchData(
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipItems: (touched) => touched.map((item) {
                        final date = first.add(Duration(days: item.x.toInt()));
                        return LineTooltipItem(
                          '${dateFormat.format(date)}\n${formatCents((item.y * 100).round())}',
                          (theme.textTheme.labelMedium ?? const TextStyle()).copyWith(
                            color: theme.colorScheme.onInverseSurface,
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: false,
                      color: theme.colorScheme.primary,
                      barWidth: 2,
                      dotData: FlDotData(
                        show:
                            sorted.length <= 7 || spots.any((s) => s.isNull()),
                      ),
                      belowBarData: BarAreaData(show: false),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Revenue (RM)',
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: Text(
                'View daily values',
                style: theme.textTheme.labelLarge,
              ),
              children: [
                for (final point in sorted)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(dateFormat.format(day(point.orderDate))),
                        ),
                        Text(formatCents(point.revenueCents)),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
