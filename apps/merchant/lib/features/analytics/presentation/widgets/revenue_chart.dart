import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';

import '../../data/analytics_models.dart';

class RevenueChart extends StatelessWidget {
  final List<TrendPoint> trends;

  const RevenueChart({super.key, required this.trends});

  @override
  Widget build(BuildContext context) {
    if (trends.isEmpty) {
      return const Card(
        child: SizedBox(
          height: 200,
          child: Center(
            child: Text('No revenue data available'),
          ),
        ),
      );
    }

    final theme = Theme.of(context);
    final primaryColor = theme.colorScheme.primary;

    final spots = <FlSpot>[];
    final dateLabels = <String>[];
    for (var i = 0; i < trends.length; i++) {
      spots.add(FlSpot(i.toDouble(), trends[i].revenueCents / 100));
      final date = DateTime.parse(trends[i].orderDate);
      dateLabels.add(DateFormat('MMM d').format(date));
    }

    final maxY = spots.map((e) => e.y).reduce((a, b) => a > b ? a : b);
    final minY = spots.map((e) => e.y).reduce((a, b) => a < b ? a : b);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Revenue Trend',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 200,
              child: LineChart(
                LineChartData(
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: _niceInterval(minY, maxY),
                  ),
                  titlesData: FlTitlesData(
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        interval: _niceInterval(minY, maxY),
                        reservedSize: 50,
                        getTitlesWidget: (value, meta) {
                          return Text(
                            'RM ${value.toInt()}',
                            style: theme.textTheme.bodySmall,
                          );
                        },
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        interval: _bottomInterval(trends.length),
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();
                          if (index < 0 || index >= dateLabels.length) {
                            return const SizedBox.shrink();
                          }
                          return Padding(
                            padding: const EdgeInsets.only(top: 4.0),
                            child: Text(
                              dateLabels[index],
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontSize: 10,
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: true,
                      curveSmoothness: 0.2,
                      color: primaryColor,
                      barWidth: 2.5,
                      dotData: const FlDotData(show: true),
                      belowBarData: BarAreaData(
                        show: true,
                        gradient: LinearGradient(
                          colors: [
                            primaryColor.withValues(alpha: 0.1),
                            primaryColor.withValues(alpha: 0.02),
                          ],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ),
                      ),
                    ),
                  ],
                  minY: minY * 0.9,
                  maxY: maxY * 1.1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _niceInterval(double minY, double maxY) {
    final range = maxY - minY;
    if (range <= 0) return 10;
    final rough = range / 4;
    if (rough < 1) return rough > 0 ? (rough * 10).roundToDouble() / 10 : 1;
    final magnitude = pow10(rough.floor().toString().length - 1);
    final interval = (rough / magnitude).round().toDouble() * magnitude;
    return interval > 0 ? interval : 1;
  }

  double _bottomInterval(int length) {
    if (length <= 7) return 1;
    if (length <= 30) return 5;
    return 10;
  }

  double pow10(int n) {
    if (n <= 0) return 1;
    double result = 1;
    for (var i = 0; i < n; i++) {
      result *= 10;
    }
    return result;
  }
}
