import 'package:flutter/material.dart';

import '../../data/analytics_models.dart';

class DailyPulseCard extends StatelessWidget {
  final DailyPulse pulse;
  final AnalyticsTotals totals;

  const DailyPulseCard({super.key, required this.pulse, required this.totals});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'SELECTED PERIOD',
              style: theme.textTheme.labelSmall?.copyWith(
                color: muted,
                letterSpacing: 1.1,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Total revenue',
              style: theme.textTheme.bodyMedium?.copyWith(color: muted),
            ),
            const SizedBox(height: 4),
            Text(
              formatCents(totals.revenueCents),
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 18),
            LayoutBuilder(
              builder: (context, constraints) => Wrap(
                spacing: 16,
                runSpacing: 12,
                children: [
                  SizedBox(
                    width: (constraints.maxWidth - 16) / 2,
                    child: _Stat(
                      label: 'Total orders',
                      value: '${totals.orderCount}',
                    ),
                  ),
                  SizedBox(
                    width: (constraints.maxWidth - 16) / 2,
                    child: _Stat(
                      label: 'Avg order',
                      value: formatCents(
                        totals.orderCount > 0
                            ? (totals.revenueCents / totals.orderCount).round()
                            : 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 32),
            Row(
              children: [
                Icon(
                  Icons.today_outlined,
                  size: 18,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  'Today',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.maxWidth < 300 ? 2 : 3;
                final width =
                    (constraints.maxWidth - (columns - 1) * 12) / columns;
                return Wrap(
                  spacing: 12,
                  runSpacing: 16,
                  children: [
                    SizedBox(
                      width: width,
                      child: _Stat(
                        label: 'Orders',
                        value: '${pulse.orderCount}',
                      ),
                    ),
                    SizedBox(
                      width: width,
                      child: _Stat(
                        label: 'Revenue',
                        value: formatCents(pulse.revenueCents),
                      ),
                    ),
                    SizedBox(
                      width: width,
                      child: _Stat(
                        label: 'Avg order',
                        value: formatCents(pulse.avgOrderCents),
                      ),
                    ),
                    SizedBox(
                      width: width,
                      child: _Stat(
                        label: 'Delivery',
                        value: '${pulse.deliveryCount}',
                      ),
                    ),
                    SizedBox(
                      width: width,
                      child: _Stat(
                        label: 'Pickup',
                        value: '${pulse.pickupCount}',
                      ),
                    ),
                    SizedBox(
                      width: width,
                      child: _Stat(
                        label: 'Dine-in',
                        value: '${pulse.dineInCount}',
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
