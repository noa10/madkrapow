import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../../../generated/database.dart';
import 'menu_item_tile.dart';

class CategorySection extends StatefulWidget {
  const CategorySection({
    super.key,
    required this.category,
    required this.items,
  });

  final CategoriesRow category;
  final List<MenuItemsRow> items;

  @override
  State<CategorySection> createState() => _CategorySectionState();
}

class _CategorySectionState extends State<CategorySection> {
  bool _expanded = true;

  void _editCategory() {
    context.push('/menu/categories/${widget.category.id}');
  }

  void _newItem() {
    context.push('${AppRoutes.menuItemNew}?categoryId=${widget.category.id}');
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Category header
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.category.name,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!widget.category.isActive)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.red.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text(
                            'Inactive',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.red,
                            ),
                          ),
                        ),
                      if (!widget.category.isActive) const SizedBox(width: 6),
                      IconButton(
                        icon: const Icon(Icons.edit, size: 20),
                        onPressed: _editCategory,
                      ),
                      IconButton(
                        icon: const Icon(Icons.add, size: 20),
                        onPressed: _newItem,
                        tooltip: 'Add Item',
                      ),
                      Icon(
                        _expanded ? Icons.expand_more : Icons.chevron_right,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // Items list
          if (_expanded)
            widget.items.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(16),
                    child: Center(
                      child: Column(
                        children: [
                          const Text('No items in this category'),
                          const SizedBox(height: 8),
                          TextButton.icon(
                            onPressed: _newItem,
                            icon: const Icon(Icons.add),
                            label: const Text('Add Item'),
                          ),
                        ],
                      ),
                    ),
                  )
                : Column(
                    children: widget.items.map((item) {
                      return MenuItemTile(item: item);
                    }).toList(),
                  ),
        ],
      ),
    );
  }
}
