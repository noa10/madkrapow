import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../data/merchant_order_repository.dart';

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
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
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
                  color: AppColors.emberText,
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
                        const Icon(
                          Icons.add_circle_outline,
                          size: 12,
                          color: AppColors.muted,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            modifier.modifierName,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.muted,
                            ),
                          ),
                        ),
                        if (modifier.modifierPriceDeltaCents > 0)
                          Text(
                            '+ ${formatPrice(modifier.modifierPriceDeltaCents)}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.emberText,
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
                  const Icon(
                    Icons.notes_outlined,
                    size: 12,
                    color: AppColors.muted,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Note: ${item.notes}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        color: AppColors.muted,
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
