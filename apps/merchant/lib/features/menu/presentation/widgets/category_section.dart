import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../../../generated/database.dart';
import '../../providers/menu_providers.dart';
import 'menu_item_tile.dart';

class CategorySection extends ConsumerStatefulWidget {
  const CategorySection({
    super.key,
    required this.category,
    required this.items,
    this.canMoveUp = false,
    this.canMoveDown = false,
    this.onMoveUp,
    this.onMoveDown,
  });

  final CategoriesRow category;
  final List<MenuItemsRow> items;
  final bool canMoveUp;
  final bool canMoveDown;
  final VoidCallback? onMoveUp;
  final VoidCallback? onMoveDown;

  @override
  ConsumerState<CategorySection> createState() => _CategorySectionState();
}

class _CategorySectionState extends ConsumerState<CategorySection> {
  bool _expanded = true;
  late List<MenuItemsRow> _items;
  int _dataVersion = 0;

  @override
  void initState() {
    super.initState();
    _items = List.of(widget.items);
  }

  @override
  void didUpdateWidget(CategorySection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.items != oldWidget.items) {
      _items = List.of(widget.items);
      _dataVersion++;
    }
  }

  void _editCategory() {
    context.push('/menu/categories/${widget.category.id}');
  }

  void _newItem() {
    context.push('${AppRoutes.menuItemNew}?categoryId=${widget.category.id}');
  }

  void _onReorder(int oldIndex, int newIndex) {
    if (newIndex > oldIndex) newIndex--;
    setState(() {
      final item = _items.removeAt(oldIndex);
      _items.insert(newIndex, item);
    });

    final repo = ref.read(menuRepositoryProvider);
    repo.reorderItems(_items.map((e) => e.id).toList());
  }

  Widget _proxyDecorator(Widget child, int index, Animation<double> animation) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, child) {
        final animValue = Curves.easeInOut.transform(animation.value);
        return Material(
          elevation: 4 + 2 * animValue,
          shadowColor: Colors.black.withValues(alpha: 0.3),
          child: child,
        );
      },
      child: child,
    );
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
                      if (widget.onMoveUp != null)
                        IconButton(
                          icon: const Icon(Icons.arrow_upward, size: 20),
                          onPressed: widget.canMoveUp ? widget.onMoveUp : null,
                          tooltip: 'Move up',
                        ),
                      if (widget.onMoveDown != null)
                        IconButton(
                          icon: const Icon(Icons.arrow_downward, size: 20),
                          onPressed: widget.canMoveDown ? widget.onMoveDown : null,
                          tooltip: 'Move down',
                        ),
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
            _items.isEmpty
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
                : ReorderableListView.builder(
                    key: ValueKey('reorder_${widget.category.id}_$_dataVersion'),
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _items.length,
                    onReorder: _onReorder,
                    proxyDecorator: _proxyDecorator,
                    itemBuilder: (context, index) {
                      final item = _items[index];
                      return Row(
                        key: ValueKey(item.id),
                        children: [
                          ReorderableDragStartListener(
                            index: index,
                            child: const Padding(
                              padding: EdgeInsets.symmetric(
                                vertical: 12,
                                horizontal: 4,
                              ),
                              child: Icon(Icons.drag_handle, color: Colors.grey),
                            ),
                          ),
                          Expanded(child: MenuItemTile(item: item)),
                        ],
                      );
                    },
                  ),
        ],
      ),
    );
  }
}
