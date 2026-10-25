import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../generated/tables/categories.dart';
import '../../data/menu_repository.dart';

/// Sticky, horizontally scrollable category strip used on the home menu.
class MenuCategoryRail extends StatefulWidget {
  const MenuCategoryRail({
    super.key,
    required this.categories,
    required this.activeId,
    required this.onSelected,
    this.hiddenWhen,
  });

  static const double height = 58;

  final List<CategoryWithMenuItems> categories;
  final String? activeId;
  final ValueChanged<String> onSelected;

  /// Optional notifier used to fade the rail out once the menu content ends.
  final ValueListenable<bool>? hiddenWhen;

  @override
  State<MenuCategoryRail> createState() => _MenuCategoryRailState();
}

class _MenuCategoryRailState extends State<MenuCategoryRail> {
  final ScrollController _scrollController = ScrollController();
  final Map<String, GlobalKey> _chipKeys = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _centerActive());
  }

  @override
  void didUpdateWidget(covariant MenuCategoryRail oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.activeId != widget.activeId) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _centerActive());
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  GlobalKey _chipKey(String id) {
    return _chipKeys.putIfAbsent(id, GlobalKey.new);
  }

  void _centerActive() {
    final activeId = widget.activeId;
    if (!mounted || activeId == null || !_scrollController.hasClients) return;

    final chipContext = _chipKeys[activeId]?.currentContext;
    final railBox = context.findRenderObject() as RenderBox?;
    final chipBox = chipContext?.findRenderObject() as RenderBox?;
    if (railBox == null || chipBox == null) return;

    final chipOffset = chipBox.localToGlobal(Offset.zero, ancestor: railBox).dx;
    final target =
        _scrollController.offset +
        chipOffset -
        (railBox.size.width - chipBox.size.width) / 2;
    final clamped = target.clamp(
      0.0,
      _scrollController.position.maxScrollExtent,
    );
    if ((clamped - _scrollController.offset).abs() < 1) return;

    _scrollController.animateTo(
      clamped,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final brand = BrandColors.of(context);
    final content = Container(
      height: MenuCategoryRail.height,
      decoration: BoxDecoration(
        color: AppColors.background.withValues(alpha: 0.97),
        border: Border(bottom: BorderSide(color: brand.border)),
      ),
      child: SingleChildScrollView(
        controller: _scrollController,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            for (var index = 0; index < widget.categories.length; index++) ...[
              if (index > 0) const SizedBox(width: 8),
              _CategoryChip(
                key: _chipKey(widget.categories[index].category.id),
                category: widget.categories[index].category,
                selected:
                    widget.activeId == widget.categories[index].category.id,
                onTap: () =>
                    widget.onSelected(widget.categories[index].category.id),
              ),
            ],
          ],
        ),
      ),
    );

    final hiddenWhen = widget.hiddenWhen;
    if (hiddenWhen == null) return content;

    return ValueListenableBuilder<bool>(
      valueListenable: hiddenWhen,
      child: content,
      builder: (context, hidden, child) {
        return IgnorePointer(
          ignoring: hidden,
          child: AnimatedOpacity(
            opacity: hidden ? 0 : 1,
            duration: const Duration(milliseconds: 160),
            child: child ?? const SizedBox.shrink(),
          ),
        );
      },
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    super.key,
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final CategoriesRow category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.accent : AppColors.surface2,
        shape: const StadiumBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          customBorder: const StadiumBorder(),
          child: Container(
            constraints: const BoxConstraints(minHeight: 38),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            alignment: Alignment.center,
            child: Text(
              category.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelMedium?.copyWith(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
                color: selected ? AppColors.onAccent : AppColors.muted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Sliver delegate that keeps the category rail pinned below the app bar.
class MenuCategoryRailDelegate extends SliverPersistentHeaderDelegate {
  MenuCategoryRailDelegate({
    required this.categories,
    required this.activeId,
    required this.onSelected,
    this.hiddenWhen,
  });

  final List<CategoryWithMenuItems> categories;
  final String? activeId;
  final ValueChanged<String> onSelected;
  final ValueListenable<bool>? hiddenWhen;

  @override
  double get minExtent => MenuCategoryRail.height;

  @override
  double get maxExtent => MenuCategoryRail.height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return MenuCategoryRail(
      key: const ValueKey('menu-category-rail'),
      categories: categories,
      activeId: activeId,
      onSelected: onSelected,
      hiddenWhen: hiddenWhen,
    );
  }

  @override
  bool shouldRebuild(covariant MenuCategoryRailDelegate oldDelegate) {
    return oldDelegate.activeId != activeId ||
        oldDelegate.categories != categories ||
        oldDelegate.hiddenWhen != hiddenWhen;
  }
}
