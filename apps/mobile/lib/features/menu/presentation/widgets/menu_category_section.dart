import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../data/menu_repository.dart';
import 'rich_menu_card.dart';

/// One menu category: heading with item count, then a one- or two-column card
/// grid. The header key is used by the sticky category rail for scrolling.
class MenuCategorySection extends StatelessWidget {
  const MenuCategorySection({
    super.key,
    required this.category,
    required this.headerKey,
    required this.onItemTap,
    required this.cardHeight,
    this.crossAxisCount = 1,
  });

  final CategoryWithMenuItems category;
  final GlobalKey headerKey;
  final ValueChanged<MenuItemWithModifiers> onItemTap;
  final double cardHeight;
  final int crossAxisCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final description = category.category.description;
    final count = category.menuItems.length;

    return Padding(
      padding: const EdgeInsets.only(top: 28, bottom: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            key: headerKey,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        category.category.name,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                          letterSpacing: -0.4,
                        ),
                      ),
                      if (description != null && description.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          description,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 13,
                            height: 1.54,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    '$count ${count == 1 ? 'ITEM' : 'ITEMS'}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.8,
                      color: AppColors.muted,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          LayoutBuilder(
            builder: (context, constraints) {
              if (crossAxisCount > 1) {
                final columns = crossAxisCount;
                final cardWidth =
                    (constraints.maxWidth - 12 * (columns - 1)) / columns;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final item in category.menuItems)
                      SizedBox(
                        width: cardWidth,
                        child: RichMenuCard(
                          item: item,
                          height: cardHeight,
                          onTap: () => onItemTap(item),
                        ),
                      ),
                  ],
                );
              }

              return Column(
                children: [
                  for (
                    var index = 0;
                    index < category.menuItems.length;
                    index++
                  ) ...[
                    if (index > 0) const SizedBox(height: 12),
                    RichMenuCard(
                      item: category.menuItems[index],
                      height: cardHeight,
                      onTap: () => onItemTap(category.menuItems[index]),
                    ),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
