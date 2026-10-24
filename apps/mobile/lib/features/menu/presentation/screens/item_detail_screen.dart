import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/widgets/async_value_widget.dart';
import '../../../../generated/tables/modifiers.dart';
import '../../../cart/data/cart_item.dart';
import '../../../cart/providers/cart_provider.dart';
import '../../data/menu_repository.dart';
import '../../providers/promo_preview_provider.dart';
import '../widgets/item_order_widgets.dart';
import '../widgets/item_quick_view.dart';

class ItemDetailScreen extends ConsumerStatefulWidget {
  const ItemDetailScreen({
    super.key,
    required this.itemId,
    this.quickView = false,
    this.preview,
    this.onRequestClose,
  });

  final String itemId;

  /// When true, renders the web-style quick view inside a modal sheet:
  /// banner image, no app bar, and a combined quantity/CTA footer.
  final bool quickView;

  /// Full catalog entry from Home. The quick view renders this immediately
  /// while the detail provider re-resolves the item in the background.
  final MenuItemWithModifiers? preview;

  /// Closes the modal sheet. Supplied by [showItemQuickView] because the sheet
  /// lives on the root navigator rather than go_router's route stack.
  final VoidCallback? onRequestClose;

  @override
  ConsumerState<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends ConsumerState<ItemDetailScreen>
    with WidgetsBindingObserver {
  int _quantity = 1;
  String _specialInstructions = '';
  final Map<String, List<ModifiersRow>> _selectedModifiers = {};
  final Map<String, GlobalKey> _groupKeys = {};
  final ScrollController _quickViewScrollController = ScrollController();
  final FocusNode _instructionsFocusNode = FocusNode();
  final GlobalKey _instructionsFieldKey = GlobalKey();

  FullMenuItem? _previewItem;

  @override
  void initState() {
    super.initState();
    _previewItem = widget.preview?.toQuickViewItem();
    WidgetsBinding.instance.addObserver(this);
    _instructionsFocusNode.addListener(_handleInstructionsFocus);
  }

  @override
  void didUpdateWidget(covariant ItemDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.itemId != widget.itemId) {
      _quantity = 1;
      _specialInstructions = '';
      _selectedModifiers.clear();
    }
    if (!identical(oldWidget.preview, widget.preview)) {
      _previewItem = widget.preview?.toQuickViewItem();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _instructionsFocusNode.removeListener(_handleInstructionsFocus);
    _instructionsFocusNode.dispose();
    _quickViewScrollController.dispose();
    super.dispose();
  }

  @override
  void didChangeMetrics() {
    if (!_instructionsFocusNode.hasFocus) return;
    _revealInstructionsField();
  }

  void _handleInstructionsFocus() {
    if (!_instructionsFocusNode.hasFocus) return;
    _revealInstructionsField();
  }

  /// Scrolls the focused instructions field above the keyboard once the new
  /// viewport has been laid out. Reacting to the inset change avoids the
  /// fixed-delay guesses the previous implementation used.
  void _revealInstructionsField() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final fieldContext = _instructionsFieldKey.currentContext;
      if (fieldContext == null) return;
      Scrollable.ensureVisible(
        fieldContext,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        alignmentPolicy: ScrollPositionAlignmentPolicy.keepVisibleAtEnd,
      );
    });
  }

  GlobalKey _groupKeyFor(String groupId) {
    return _groupKeys.putIfAbsent(groupId, GlobalKey.new);
  }

  bool _isRequiredGroup(ModifierGroupWithModifiers group) {
    return group.isRequired || group.group.minSelections > 0;
  }

  int _requiredSelectionsFor(ModifierGroupWithModifiers group) {
    return math.max(1, group.group.minSelections);
  }

  /// Required groups that still need picks. Groups with no available options
  /// are ignored: they can never be satisfied and would deadlock the CTA.
  List<ModifierGroupWithModifiers> _unsatisfiedRequiredGroups(
    FullMenuItem item,
  ) {
    return item.modifierGroups.where((group) {
      if (group.modifiers.isEmpty || !_isRequiredGroup(group)) return false;
      final selected = _selectedModifiers[group.group.id] ?? const [];
      return selected.length < _requiredSelectionsFor(group);
    }).toList();
  }

  bool _allRequiredGroupsSatisfied(FullMenuItem item) {
    return _unsatisfiedRequiredGroups(item).isEmpty;
  }

  void _toggleModifier(
    ModifierGroupWithModifiers group,
    ModifiersRow modifier,
  ) {
    final selected = _selectedModifiers[group.group.id] ?? const [];
    final maxSelections = group.group.maxSelections;
    final isSelected = selected.any((m) => m.id == modifier.id);

    if (isSelected) {
      setState(() {
        _selectedModifiers[group.group.id] = selected
            .where((m) => m.id != modifier.id)
            .toList();
      });
      return;
    }

    if (maxSelections > 0 && selected.length >= maxSelections) {
      // Single-select behaves like a radio group: the new pick replaces the
      // old one. Multi-select groups surface why the tap did nothing.
      if (maxSelections == 1) {
        setState(() => _selectedModifiers[group.group.id] = [modifier]);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'You can choose up to $maxSelections options from '
              '${group.group.name}',
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
      return;
    }

    setState(() {
      _selectedModifiers[group.group.id] = [...selected, modifier];
    });
  }

  void _handleAddPressed(FullMenuItem item) {
    if (!_allRequiredGroupsSatisfied(item)) {
      _revealFirstUnsatisfiedGroup(item);
      return;
    }
    _addToCart(item);
  }

  void _revealFirstUnsatisfiedGroup(FullMenuItem item) {
    final groups = _unsatisfiedRequiredGroups(item);
    if (groups.isEmpty) return;

    final group = groups.first;
    final selectedCount =
        (_selectedModifiers[group.group.id] ?? const []).length;
    final remaining = _requiredSelectionsFor(group) - selectedCount;
    final groupContext = _groupKeys[group.group.id]?.currentContext;

    FocusScope.of(context).unfocus();
    if (groupContext != null) {
      Scrollable.ensureVisible(
        groupContext,
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic,
        alignment: 0.15,
      );
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Select $remaining more from ${group.group.name}'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _addToCart(FullMenuItem item) {
    // Only send modifiers that still belong to the item's current groups.
    final selectedModifiers = item.modifierGroups
        .expand((group) => _selectedModifiers[group.group.id] ?? const [])
        .map(
          (m) => SelectedModifier(
            id: m.id,
            name: m.name,
            priceDeltaCents: m.priceDeltaCents,
          ),
        )
        .toList();

    ref
        .read(cartProvider.notifier)
        .addItem(
          CartItem(
            menuItemId: item.item.id,
            name: item.item.name,
            unitPrice: item.item.priceCents,
            quantity: _quantity,
            selectedModifiers: selectedModifiers,
            specialInstructions: _specialInstructions,
            imageUrl: item.item.imageUrl,
          ),
        );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${_quantity}x ${item.item.name} added to cart'),
        behavior: SnackBarBehavior.floating,
      ),
    );

    if (widget.quickView) {
      // The sheet is pushed with showModalBottomSheet on the root navigator,
      // so go_router's context.pop() is the wrong stack to unwind.
      final close = widget.onRequestClose;
      if (close != null) {
        close();
      } else {
        Navigator.of(context).maybePop();
      }
    } else {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(menuItemDetailProvider(widget.itemId));
    final AsyncValue<FullMenuItem?> itemAsync =
        widget.quickView && _previewItem != null
        ? AsyncValue<FullMenuItem?>.data(
            detailAsync.valueOrNull ?? _previewItem,
          )
        : detailAsync;

    if (widget.quickView) {
      return _buildQuickView(itemAsync);
    }

    return AsyncValueWidget(
      value: itemAsync,
      data: (item) {
        if (item == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Item not found')),
          );
        }

        return _buildFullScreen(context, item);
      },
    );
  }

  Widget _buildQuickView(AsyncValue<FullMenuItem?> itemAsync) {
    return AsyncValueWidget(
      value: itemAsync,
      data: (item) {
        if (item == null) {
          return const Center(child: Text('Item not found'));
        }

        return ItemQuickViewContent(
          item: item,
          isUnavailable: !item.item.isAvailable,
          quantity: _quantity,
          requiredOptionsCount: _unsatisfiedRequiredGroups(item).length,
          specialInstructions: _specialInstructions,
          selectedModifiers: _selectedModifiers,
          groupKeys: _groupKeys,
          scrollController: _quickViewScrollController,
          instructionsFocusNode: _instructionsFocusNode,
          instructionsFieldKey: _instructionsFieldKey,
          onToggleModifier: _toggleModifier,
          onInstructionsChanged: (value) =>
              setState(() => _specialInstructions = value),
          onInstructionsTap: _revealInstructionsField,
          onQuantityChanged: (value) => setState(() => _quantity = value),
          onAddPressed: () => _handleAddPressed(item),
        );
      },
    );
  }

  Widget _buildFullScreen(BuildContext context, FullMenuItem item) {
    final promo = ref.watch(promoPreviewProvider(item.item.id)).valueOrNull;
    final totalCents = itemOrderTotalCents(
      item,
      _selectedModifiers,
      _quantity,
      promo: promo,
    );
    final isUnavailable = !item.item.isAvailable;
    final requiredGroups = _unsatisfiedRequiredGroups(item);
    final visibleGroups = item.modifierGroups
        .where((group) => group.modifiers.isNotEmpty)
        .toList();

    return Scaffold(
      appBar: AppBar(),
      bottomNavigationBar: isUnavailable
          ? const ItemUnavailableBottomBar()
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (requiredGroups.isNotEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    color: Theme.of(
                      context,
                    ).colorScheme.error.withValues(alpha: 0.1),
                    child: Text(
                      'Please select required options: '
                      '${requiredGroups.map((g) => g.group.name).join(', ')}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.error,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ItemFooterSurface(
                  child: ItemPrimaryButton(
                    label: requiredGroups.isEmpty
                        ? 'Add to Cart'
                        : 'Select required options (${requiredGroups.length})',
                    trailing: formatPrice(totalCents),
                    onPressed: () => _handleAddPressed(item),
                  ),
                ),
              ],
            ),
      body: Opacity(
        opacity: isUnavailable ? 0.75 : 1.0,
        child: CustomScrollView(
          slivers: [
            // Framed image preview matching the web item detail.
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.surfaceSunk,
                    borderRadius: AppRadii.xlRadius,
                    border: Border.all(color: AppColors.border),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: AspectRatio(
                    aspectRatio: 4 / 3,
                    child:
                        item.item.imageUrl != null &&
                            item.item.imageUrl!.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: item.item.imageUrl!,
                            fit: BoxFit.contain,
                            alignment: Alignment.center,
                            placeholder: (context, url) =>
                                const ColoredBox(color: AppColors.surfaceSunk),
                            errorWidget: (context, url, error) =>
                                const ItemImagePlaceholder(),
                          )
                        : const ItemImagePlaceholder(),
                  ),
                ),
              ),
            ),
            // Item info
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.category.name.toUpperCase(),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.2,
                        color: AppColors.emberText,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item.item.name,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            height: 1.1,
                          ),
                    ),
                    if (isUnavailable) ...[
                      const SizedBox(height: 12),
                      const ItemUnavailableNotice(),
                    ],
                    if (item.item.description != null &&
                        item.item.description!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        item.item.description!,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontSize: 15,
                          height: 1.5,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    ItemPriceText(
                      priceCents: item.item.priceCents,
                      promo: promo,
                    ),
                  ],
                ),
              ),
            ),
            // Modifier groups
            ...visibleGroups.map(
              (group) => SliverToBoxAdapter(
                child: KeyedSubtree(
                  key: _groupKeyFor(group.group.id),
                  child: ItemModifierGroupSection(
                    group: group,
                    selectedModifiers:
                        _selectedModifiers[group.group.id] ?? const [],
                    enabled: !isUnavailable,
                    onToggle: isUnavailable
                        ? (_) {}
                        : (modifier) => _toggleModifier(group, modifier),
                  ),
                ),
              ),
            ),
            // Quantity
            SliverToBoxAdapter(
              child: ItemQuantitySelector(
                quantity: _quantity,
                enabled: !isUnavailable,
                onChanged: (q) => setState(() => _quantity = q),
              ),
            ),
            // Special instructions
            SliverToBoxAdapter(
              child: ItemSpecialInstructionsField(
                value: _specialInstructions,
                enabled: !isUnavailable,
                onChanged: (v) => setState(() => _specialInstructions = v),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }
}
