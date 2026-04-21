import 'package:flutter/material.dart';

import '../../data/analytics_models.dart';

class TopItemsList extends StatelessWidget {
  final List<TopItem> items;

  const TopItemsList({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    final top10 = items.take(10).toList();
    if (top10.isEmpty) {
      return const Card(
        child: SizedBox(
          height: 200,
          child: Center(
            child: Text('No item data available'),
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Top Selling Items',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 12),
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: top10.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final item = top10[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6.0),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 32,
                        child: Text(
                          '${index + 1}',
                          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: index < 3
                                    ? Theme.of(context).colorScheme.primary
                                    : null,
                              ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          item.menuItemName,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                      Text(
                        '${item.totalQuantity}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(width: 16),
                      Text(
                        formatCents(item.totalRevenueCents),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
