import 'package:flutter/material.dart';

class PromoPerformanceCard extends StatelessWidget {
  const PromoPerformanceCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32.0, horizontal: 16.0),
        child: Column(
          children: [
            Icon(
              Icons.local_offer_outlined,
              size: 48,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 12),
            Text(
              'Promo analytics available after promo system launch',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
