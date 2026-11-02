import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../data/pos_repository.dart';
import '../../models/pos_models.dart';
import 'pos_menu_card.dart';
import 'pos_ui.dart';

/// The sellable menu: search, category rail and photo cards.
class PosMenuPanel extends StatefulWidget {
  const PosMenuPanel({
    super.key,
    required this.data,
    required this.onSelect,
  });

  final PosMenuData data;
  final ValueChanged<PosMenuItem> onSelect;

  @override
  State<PosMenuPanel> createState() => _PosMenuPanelState();
}

class _PosMenuPanelState extends State<PosMenuPanel> {
  final _queryController = TextEditingController();
  final _sectionKeys = <String, GlobalKey>{};
  String? _activeCategoryId;
  String _query = '';

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  GlobalKey _keyFor(String categoryId) =>
      _sectionKeys.putIfAbsent(categoryId, GlobalKey.new);

  /// Categories that still have an available dish matching the search.
  List<_VisibleCategory> _visibleCategories() {
    final normalized = _query.trim().toLowerCase();
    final byCategory = <String, List<PosMenuItem>>{};
    for (final item in widget.data.menuItems) {
      if (!item.isAvailable) continue;
      if (normalized.isNotEmpty &&
          !'${item.name} ${item.description ?? ''}'
              .toLowerCase()
              .contains(normalized)) {
        continue;
      }
      byCategory.putIfAbsent(item.categoryId, () => []).add(item);
    }

    return [
      for (final category in widget.data.categories)
        if ((byCategory[category.id] ?? const []).isNotEmpty)
          _VisibleCategory(category, byCategory[category.id]!),
    ];
  }

  void _scrollToCategory(String categoryId) {
    setState(() => _activeCategoryId = categoryId);
    final target = _sectionKeys[categoryId]?.currentContext;
    if (target == null) return;
    Scrollable.ensureVisible(
      target,
      alignment: 0,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleCategories();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _queryController,
                onChanged: (value) => setState(() => _query = value),
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Search the menu',
                  prefixIcon: Icon(Icons.search, size: 20),
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.surface2,
                  contentPadding: EdgeInsets.symmetric(vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: AppRadii.mdRadius,
                    borderSide: BorderSide(color: AppColors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: AppRadii.mdRadius,
                    borderSide: BorderSide(color: AppColors.border),
                  ),
                ),
              ),
              if (visible.isNotEmpty) ...[
                const SizedBox(height: 8),
                SizedBox(
                  height: 44,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: visible.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(width: 6),
                    itemBuilder: (context, index) {
                      final category = visible[index].category;
                      final active = _activeCategoryId == category.id;
                      return _CategoryChip(
                        label: category.name,
                        active: active,
                        onTap: () => _scrollToCategory(category.id),
                      );
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: visible.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      _query.trim().isEmpty
                          ? 'No available dishes yet.'
                          : 'No dishes match “${_query.trim()}”.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                )
              // A plain ListView uses a *lazy* sliver list delegate even with
              // `children:`: off-screen sections have no element, so their
              // GlobalKey has no context and the category rail would silently
              // do nothing. Build the sections eagerly in a scroll view so
              // every key exists for `Scrollable.ensureVisible`.
              : SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final section in visible)
                        Padding(
                          key: _keyFor(section.category.id),
                          padding: const EdgeInsets.only(bottom: 18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: PosLabel(section.category.name),
                              ),
                              GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: section.items.length,
                                gridDelegate:
                                    const SliverGridDelegateWithMaxCrossAxisExtent(
                                      maxCrossAxisExtent: 360,
                                      mainAxisExtent: 116,
                                      crossAxisSpacing: 8,
                                      mainAxisSpacing: 8,
                                    ),
                                itemBuilder: (context, itemIndex) {
                                  final item = section.items[itemIndex];
                                  return PosMenuCard(
                                    item: item,
                                    hasModifiers: widget
                                        .data
                                        .modifierGroupsByItem
                                        .containsKey(item.id),
                                    onSelect: () => widget.onSelect(item),
                                  );
                                },
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _VisibleCategory {
  const _VisibleCategory(this.category, this.items);

  final PosCategory category;
  final List<PosMenuItem> items;
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      child: Material(
        color: active ? AppColors.accent : AppColors.surface2,
        shape: StadiumBorder(
          side: BorderSide(
            color: active ? AppColors.accent : AppColors.border,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: active ? AppColors.onAccent : AppColors.muted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
