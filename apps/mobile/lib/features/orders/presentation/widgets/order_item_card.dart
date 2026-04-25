import 'package:flutter/material.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../data/order_repository.dart';

/// Displays a single order item with its modifiers/addons, notes, and pricing.
class OrderItemCard extends StatelessWidget {
  const OrderItemCard({super.key, required this.itemWithModifiers});

  final OrderItemWithModifiers itemWithModifiers;

  @override
  Widget build(BuildContext context) {
    final item = itemWithModifiers.item;
    final modifiers = itemWithModifiers.modifiers;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Main item row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Quantity badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '${item.quantity}x',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Item name and unit price
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.menuItemName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      formatPrice(item.menuItemPriceCents),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              // Line total
              Text(
                formatPrice(item.lineTotalCents),
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
            ],
          ),

          // Modifiers / addons
          if (modifiers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: modifiers.map((modifier) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(
                      children: [
                        Icon(
                          Icons.add_circle_outline,
                          size: 12,
                          color: Colors.grey[500],
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            modifier.modifierName,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[700],
                            ),
                          ),
                        ),
                        if (modifier.modifierPriceDeltaCents > 0)
                          Text(
                            '+ ${formatPrice(modifier.modifierPriceDeltaCents)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),

          // Notes
          if (item.notes != null && item.notes!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.notes_outlined,
                    size: 12,
                    color: Colors.grey[500],
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Note: ${item.notes}',
                      style: TextStyle(
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        color: Colors.grey[700],
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
