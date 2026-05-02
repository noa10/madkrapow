import 'package:flutter/material.dart';

import '../../data/analytics_models.dart';

class DailyPulseCard extends StatelessWidget {
  final DailyPulse pulse;
  final AnalyticsTotals totals;

  const DailyPulseCard({super.key, required this.pulse, required this.totals});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            // Range totals header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _RangeStat(
                  icon: Icons.receipt_long_outlined,
                  label: 'Total Orders',
                  value: '${totals.orderCount}',
                  color: Colors.blue,
                ),
                _RangeStat(
                  icon: Icons.attach_money_outlined,
                  label: 'Total Revenue',
                  value: formatCents(totals.revenueCents),
                  color: Colors.green,
                ),
                _RangeStat(
                  icon: Icons.account_balance_wallet_outlined,
                  label: 'Avg Order',
                  value: totals.orderCount > 0
                      ? formatCents(totals.revenueCents ~/ totals.orderCount)
                      : formatCents(0),
                  color: Colors.orange,
                ),
              ],
            ),
            const Divider(height: 24),
            // Today's pulse detail
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Today',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _TodayStat(label: 'Orders', value: '${pulse.orderCount}'),
                _TodayStat(label: 'Revenue', value: formatCents(pulse.revenueCents)),
                _TodayStat(label: 'Avg', value: formatCents(pulse.avgOrderCents)),
                _TodayStat(label: 'Delivery', value: '${pulse.deliveryCount}'),
                _TodayStat(label: 'Pickup', value: '${pulse.pickupCount}'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RangeStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _RangeStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _TodayStat extends StatelessWidget {
  final String label;
  final String value;

  const _TodayStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.outline,
                fontSize: 10,
              ),
        ),
      ],
    );
  }
}
