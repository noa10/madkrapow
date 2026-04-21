import 'package:flutter/material.dart';

import '../../data/analytics_models.dart';

class DailyPulseCard extends StatelessWidget {
  final DailyPulse pulse;

  const DailyPulseCard({super.key, required this.pulse});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _StatColumn(
              icon: Icons.receipt_long_outlined,
              label: 'Orders',
              value: '${pulse.orderCount}',
            ),
            _StatColumn(
              icon: Icons.attach_money_outlined,
              label: 'Revenue',
              value: formatCents(pulse.revenueCents),
            ),
            _StatColumn(
              icon: Icons.account_balance_wallet_outlined,
              label: 'Avg Order',
              value: formatCents(pulse.avgOrderCents),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatColumn extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _StatColumn({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
          textAlign: TextAlign.center,
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
