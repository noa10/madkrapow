import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/async_value_widget.dart';
import '../../../../generated/tables/modifiers.dart';
import '../../../cart/data/cart_item.dart';
import '../../../cart/providers/cart_provider.dart';
import '../../data/menu_repository.dart';
import '../../providers/promo_preview_provider.dart';

class ItemDetailScreen extends ConsumerStatefulWidget {
  const ItemDetailScreen({
    super.key,
    required this.itemId,
    this.quickView = false,
    this.preview,
  });

  final String itemId;

  /// When true, renders the web-style quick view inside a modal sheet:
  /// banner image, no app bar, and a combined quantity/CTA footer.
  final bool quickView;

  /// Full catalog entry from Home. The quick view renders this immediately
  /// instead of issuing another set of Supabase queries on open.
  final MenuItemWithModifiers? preview;

  @override
  ConsumerState<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends ConsumerState<ItemDetailScreen> {
  int _quantity = 1;
  String _specialInstructions = '';
  final Map<String, List<ModifiersRow>> _selectedModifiers = {};
  final ScrollController _quickViewScrollController = ScrollController();
  final FocusNode _instructionsFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _instructionsFocusNode.addListener(_handleInstructionsFocus);
  }

  @override
  void dispose() {
    _instructionsFocusNode.removeListener(_handleInstructionsFocus);
    _instructionsFocusNode.dispose();
    _quickViewScrollController.dispose();
    super.dispose();
  }

  void _handleInstructionsFocus() {
    if (!_instructionsFocusNode.hasFocus) return;
    _scheduleInstructionsReveal();
  }

  bool _instructionsRevealScheduled = false;

  void _scheduleInstructionsReveal() {
    if (_instructionsRevealScheduled) return;
    _instructionsRevealScheduled = true;
    // The sheet lifts above the keyboard after the view inset settles; retry
    // once the scroll extent reflects the shortened viewport.
    Future<void>.delayed(
      const Duration(milliseconds: 400),
      _scrollInstructionsIntoView,
    );
    Future<void>.delayed(
      const Duration(milliseconds: 900),
      _scrollInstructionsIntoView,
    );
    Future<void>.delayed(const Duration(milliseconds: 1300), () {
      if (!mounted) return;
      _instructionsRevealScheduled = false;
    });
  }

  void _scrollInstructionsIntoView() {
    if (!mounted || !_quickViewScrollController.hasClients) return;
    final position = _quickViewScrollController.position;
    if (position.maxScrollExtent <= 0) return;
    _quickViewScrollController.animateTo(
      position.maxScrollExtent,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
    );
  }

  int get _totalCents {
    final item = _resolvedItem;
    if (item == null) return 0;

    var total = item.item.priceCents;
    for (final group in item.modifierGroups) {
      final selected = _selectedModifiers[group.group.id] ?? [];
      for (final mod in selected) {
        total += mod.priceDeltaCents;
      }
    }
    return total * _quantity;
  }

  /// The quick view uses the Home catalog snapshot; the full-screen route and
  /// direct links still resolve through the detail provider.
  FullMenuItem? get _resolvedItem {
    final preview = widget.quickView ? widget.preview : null;
    if (preview != null) return preview.toQuickViewItem();
    return ref.read(menuItemDetailProvider(widget.itemId)).value;
  }

  bool get _allRequiredGroupsSatisfied {
    final item = _resolvedItem;
    if (item == null) return false;
    return item.modifierGroups.every((group) {
      if (!group.isRequired) return true;
      final selected = _selectedModifiers[group.group.id] ?? [];
      return selected.length >= group.group.minSelections;
    });
  }

  /// Names of required groups that are unsatisfied (for error message).
  List<String> get _unsatisfiedRequiredGroupNames {
    final item = _resolvedItem;
    if (item == null) return [];
    return item.modifierGroups
        .where((group) {
          if (!group.isRequired) return false;
          final selected = _selectedModifiers[group.group.id] ?? [];
          return selected.length < group.group.minSelections;
        })
        .map((group) => group.group.name)
        .toList();
  }

  void _toggleModifier(
    ModifierGroupWithModifiers group,
    ModifiersRow modifier,
  ) {
    setState(() {
      final selected = _selectedModifiers[group.group.id] ?? [];
      final maxSelections = group.group.maxSelections;

      if (selected.any((m) => m.id == modifier.id)) {
        selected.removeWhere((m) => m.id == modifier.id);
      } else {
        if (maxSelections > 0 && selected.length >= maxSelections) {
          // For single-select (max=1), replace. For multi-select, do nothing.
          if (maxSelections == 1) {
            selected.clear();
            selected.add(modifier);
          }
          // If at max > 1, don't add
        } else {
          selected.add(modifier);
        }
      }
      _selectedModifiers[group.group.id] = selected;
    });
  }

  Widget _buildItemPrice(BuildContext context, String itemId, int priceCents) {
    final promoAsync = ref.watch(promoPreviewProvider(itemId));

    return promoAsync.when(
      data: (promo) {
        // Any promo with savings: show discounted price + strikethrough original
        if (promo != null && promo.savingsCents > 0) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                formatPrice(promo.discountedCents),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: AppColors.emberText,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                formatPrice(priceCents),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            ],
          );
        }
        return Text(
          formatPrice(priceCents),
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: AppColors.emberText,
            fontWeight: FontWeight.bold,
          ),
        );
      },
      loading: () => Text(
        formatPrice(priceCents),
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
          color: AppColors.emberText,
          fontWeight: FontWeight.bold,
        ),
      ),
      error: (err, st) => Text(
        formatPrice(priceCents),
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
          color: AppColors.emberText,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  void _addToCart(FullMenuItem item) {
    if (!_allRequiredGroupsSatisfied) return;

    ref
        .read(cartProvider.notifier)
        .addItem(
          CartItem(
            menuItemId: item.item.id,
            name: item.item.name,
            unitPrice: item.item.priceCents,
            quantity: _quantity,
            selectedModifiers: _selectedModifiers.values
                .expand((mods) => mods)
                .map(
                  (m) => SelectedModifier(
                    id: m.id,
                    name: m.name,
                    priceDeltaCents: m.priceDeltaCents,
                  ),
                )
                .toList(),
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
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final preview = widget.quickView ? widget.preview : null;
    final AsyncValue<FullMenuItem?> itemAsync = preview != null
        ? AsyncValue<FullMenuItem?>.data(preview.toQuickViewItem())
        : ref.watch(menuItemDetailProvider(widget.itemId));

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

        final isUnavailable = !item.item.isAvailable;

        return Scaffold(
          appBar: AppBar(),
          bottomNavigationBar: isUnavailable
              ? _UnavailableBottomBar()
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!_allRequiredGroupsSatisfied)
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
                          'Please select required options: ${_unsatisfiedRequiredGroupNames.join(', ')}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(context).colorScheme.error,
                                fontWeight: FontWeight.w600,
                              ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    _BottomBar(
                      totalCents: _totalCents,
                      isEnabled: _allRequiredGroupsSatisfied,
                      onAddToCart: () => _addToCart(item),
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
                                placeholder: (context, url) => const ColoredBox(
                                  color: AppColors.surfaceSunk,
                                ),
                                errorWidget: (context, url, error) =>
                                    const _ImagePlaceholder(),
                              )
                            : const _ImagePlaceholder(),
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
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(
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
                          const _UnavailableNotice(),
                        ],
                        if (item.item.description != null &&
                            item.item.description!.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Text(
                            item.item.description!,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  fontSize: 15,
                                  height: 1.5,
                                  color: AppColors.muted,
                                ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        _buildItemPrice(
                          context,
                          item.item.id,
                          item.item.priceCents,
                        ),
                      ],
                    ),
                  ),
                ),
                // Modifier groups
                ...item.modifierGroups.map(
                  (group) => SliverToBoxAdapter(
                    child: _ModifierGroupSection(
                      group: group,
                      selectedModifiers:
                          _selectedModifiers[group.group.id] ?? [],
                      enabled: !isUnavailable,
                      onToggle: isUnavailable
                          ? (_) {}
                          : (modifier) => _toggleModifier(group, modifier),
                    ),
                  ),
                ),
                // Quantity
                SliverToBoxAdapter(
                  child: _QuantitySelector(
                    quantity: _quantity,
                    enabled: !isUnavailable,
                    onChanged: (q) => setState(() => _quantity = q),
                  ),
                ),
                // Special instructions
                SliverToBoxAdapter(
                  child: _SpecialInstructionsField(
                    value: _specialInstructions,
                    enabled: !isUnavailable,
                    onChanged: (v) => setState(() => _specialInstructions = v),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 180)),
              ],
            ),
          ),
        );
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

        final isUnavailable = !item.item.isAvailable;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: CustomScrollView(
                shrinkWrap: true,
                controller: _quickViewScrollController,
                slivers: [
                  SliverToBoxAdapter(
                    child: AspectRatio(
                      aspectRatio: 3 / 2,
                      child: _QuickViewImage(imageUrl: item.item.imageUrl),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.item.name,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                  height: 1.1,
                                  letterSpacing: -0.5,
                                ),
                          ),
                          if (isUnavailable) ...[
                            const SizedBox(height: 12),
                            const _UnavailableNotice(),
                          ],
                          if (item.item.description != null &&
                              item.item.description!.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Text(
                              item.item.description!,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(
                                    fontSize: 15,
                                    height: 1.5,
                                    color: AppColors.muted,
                                  ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  if (item.modifierGroups.isNotEmpty)
                    const SliverToBoxAdapter(child: _SectionDivider()),
                  ...item.modifierGroups.map(
                    (group) => SliverToBoxAdapter(
                      child: _ModifierGroupSection(
                        group: group,
                        selectedModifiers:
                            _selectedModifiers[group.group.id] ?? [],
                        enabled: !isUnavailable,
                        onToggle: isUnavailable
                            ? (_) {}
                            : (modifier) => _toggleModifier(group, modifier),
                      ),
                    ),
                  ),
                  const SliverToBoxAdapter(child: _SectionDivider()),
                  SliverToBoxAdapter(
                    child: _SpecialInstructionsField(
                      value: _specialInstructions,
                      enabled: !isUnavailable,
                      focusNode: _instructionsFocusNode,
                      onTap: _scheduleInstructionsReveal,
                      onChanged: (v) =>
                          setState(() => _specialInstructions = v),
                    ),
                  ),
                  const SliverToBoxAdapter(child: SizedBox(height: 24)),
                ],
              ),
            ),
            _QuickViewBottomBar(
              quantity: _quantity,
              totalCents: _totalCents,
              isEnabled: _allRequiredGroupsSatisfied,
              isUnavailable: isUnavailable,
              requiredOptionsCount: _unsatisfiedRequiredGroupNames.length,
              onQuantityChanged: (q) => setState(() => _quantity = q),
              onAddToCart: () => _addToCart(item),
            ),
          ],
        );
      },
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.surfaceSunk,
      child: Center(
        child: Icon(Icons.restaurant, size: 48, color: AppColors.muted),
      ),
    );
  }
}

class _ModifierGroupSection extends StatelessWidget {
  const _ModifierGroupSection({
    required this.group,
    required this.selectedModifiers,
    required this.onToggle,
    this.enabled = true,
  });

  final ModifierGroupWithModifiers group;
  final List<ModifiersRow> selectedModifiers;
  final ValueChanged<ModifiersRow> onToggle;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isSingleSelect = group.group.maxSelections <= 1;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                group.group.name,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: enabled
                      ? null
                      : theme.colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
              if (group.isRequired) ...[
                const SizedBox(width: 4),
                Text(
                  '*Required',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: enabled
                        ? theme.colorScheme.error
                        : theme.colorScheme.error.withValues(alpha: 0.4),
                  ),
                ),
              ],
            ],
          ),
          if (group.group.description != null &&
              group.group.description!.isNotEmpty)
            Text(
              group.group.description!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: enabled
                    ? theme.colorScheme.onSurface.withValues(alpha: 0.6)
                    : theme.colorScheme.onSurface.withValues(alpha: 0.3),
              ),
            ),
          const SizedBox(height: 8),
          ...group.modifiers.map((modifier) {
            final isSelected = selectedModifiers.any(
              (m) => m.id == modifier.id,
            );
            return _ModifierTile(
              modifier: modifier,
              isSelected: isSelected,
              isSingleSelect: isSingleSelect,
              enabled: enabled,
              onTap: () => onToggle(modifier),
            );
          }),
        ],
      ),
    );
  }
}

class _ModifierTile extends StatelessWidget {
  const _ModifierTile({
    required this.modifier,
    required this.isSelected,
    required this.isSingleSelect,
    required this.onTap,
    this.enabled = true,
  });

  final ModifiersRow modifier;
  final bool isSelected;
  final bool isSingleSelect;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            if (isSingleSelect)
              RadioGroup<bool>(
                groupValue: isSelected,
                onChanged: enabled ? (_) => onTap() : (_) {},
                child: Radio<bool>(value: true, enabled: enabled),
              )
            else
              IgnorePointer(
                ignoring: !enabled,
                child: Checkbox(
                  value: isSelected,
                  onChanged: enabled ? (_) => onTap() : null,
                ),
              ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                modifier.name,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: enabled
                      ? null
                      : Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
            ),
            if (modifier.priceDeltaCents != 0)
              Text(
                modifier.priceDeltaCents > 0
                    ? '+${formatPrice(modifier.priceDeltaCents)}'
                    : '-${formatPrice(modifier.priceDeltaCents.abs())}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: enabled
                      ? AppColors.emberText
                      : Theme.of(
                          context,
                        ).colorScheme.onSurface.withValues(alpha: 0.3),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _QuantitySelector extends StatelessWidget {
  const _QuantitySelector({
    required this.quantity,
    required this.onChanged,
    this.enabled = true,
  });

  final int quantity;
  final ValueChanged<int> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          Text(
            'Quantity',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: enabled
                  ? null
                  : theme.colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
          const Spacer(),
          IconButton.outlined(
            onPressed: enabled && quantity > 1
                ? () => onChanged(quantity - 1)
                : null,
            icon: const Icon(Icons.remove),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              '$quantity',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: enabled
                    ? null
                    : theme.colorScheme.onSurface.withValues(alpha: 0.4),
              ),
            ),
          ),
          IconButton.outlined(
            onPressed: enabled ? () => onChanged(quantity + 1) : null,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
    );
  }
}

class _SpecialInstructionsField extends StatelessWidget {
  const _SpecialInstructionsField({
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.focusNode,
    this.onTap,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final bool enabled;
  final FocusNode? focusNode;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final remaining = 200 - value.length;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Special Instructions',
            style: theme.textTheme.labelLarge?.copyWith(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: enabled ? AppColors.foreground : AppColors.muted,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            focusNode: focusNode,
            onTap: onTap,
            onChanged: enabled ? onChanged : null,
            enabled: enabled,
            minLines: 3,
            maxLines: 5,
            maxLength: 200,
            textInputAction: TextInputAction.newline,
            decoration: InputDecoration(
              hintText: enabled
                  ? 'E.g., No onions, extra spicy...'
                  : 'Unavailable',
              counterText: '',
              filled: true,
              fillColor: AppColors.surface2,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
              border: const OutlineInputBorder(
                borderRadius: AppRadii.mdRadius,
                borderSide: BorderSide(color: AppColors.border),
              ),
              enabledBorder: const OutlineInputBorder(
                borderRadius: AppRadii.mdRadius,
                borderSide: BorderSide(color: AppColors.border),
              ),
              focusedBorder: const OutlineInputBorder(
                borderRadius: AppRadii.mdRadius,
                borderSide: BorderSide(color: AppColors.accent),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$remaining characters remaining',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 11,
              color: remaining <= 20 ? AppColors.dangerText : AppColors.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.totalCents,
    this.isEnabled = true,
    required this.onAddToCart,
  });

  final int totalCents;
  final bool isEnabled;
  final VoidCallback onAddToCart;

  @override
  Widget build(BuildContext context) {
    final label = isEnabled
        ? 'Add to Cart · ${formatPrice(totalCents)} (Incl. tax)'
        : 'Select required options';

    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: BoxDecoration(
          color: AppColors.surface.withValues(alpha: 0.95),
          border: const Border(top: BorderSide(color: AppColors.border)),
        ),
        child: GradientCta(
          expand: true,
          label: label,
          onPressed: isEnabled ? onAddToCart : null,
        ),
      ),
    );
  }
}

class _UnavailableBottomBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: BoxDecoration(
          color: AppColors.surface.withValues(alpha: 0.95),
          border: const Border(top: BorderSide(color: AppColors.border)),
        ),
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(
            minimumSize: const Size(double.infinity, 52),
            disabledBackgroundColor: Theme.of(
              context,
            ).colorScheme.onSurface.withValues(alpha: 0.1),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.block,
                size: 18,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(width: 8),
              Text(
                'Unavailable',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UnavailableNotice extends StatelessWidget {
  const _UnavailableNotice();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: scheme.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: scheme.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.block, size: 16, color: scheme.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'This item is currently unavailable',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: scheme.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickViewImage extends StatelessWidget {
  const _QuickViewImage({this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    if (url == null || url.isEmpty) {
      return const ColoredBox(
        color: AppColors.surface2,
        child: Center(
          child: Text('No image', style: TextStyle(color: AppColors.muted)),
        ),
      );
    }

    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      placeholder: (context, url) =>
          const ColoredBox(color: AppColors.surface2),
      errorWidget: (context, url, error) => const ColoredBox(
        color: AppColors.surface2,
        child: Center(
          child: Text('No image', style: TextStyle(color: AppColors.muted)),
        ),
      ),
    );
  }
}

class _SectionDivider extends StatelessWidget {
  const _SectionDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Divider(height: 1, color: AppColors.border),
    );
  }
}

class _QuickViewBottomBar extends StatelessWidget {
  const _QuickViewBottomBar({
    required this.quantity,
    required this.totalCents,
    required this.isEnabled,
    required this.isUnavailable,
    required this.requiredOptionsCount,
    required this.onQuantityChanged,
    required this.onAddToCart,
  });

  final int quantity;
  final int totalCents;
  final bool isEnabled;
  final bool isUnavailable;
  final int requiredOptionsCount;
  final ValueChanged<int> onQuantityChanged;
  final VoidCallback onAddToCart;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = isUnavailable
        ? 'Unavailable'
        : isEnabled
        ? 'Add item'
        : requiredOptionsCount > 0
        ? 'Select options ($requiredOptionsCount)'
        : 'Select required options';

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: [
              Opacity(
                opacity: isUnavailable ? 0.5 : 1,
                child: Container(
                  height: 48,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    color: AppColors.surface2,
                    borderRadius: AppRadii.mdRadius,
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _QuickQuantityButton(
                        icon: Icons.remove,
                        onPressed: !isUnavailable && quantity > 1
                            ? () => onQuantityChanged(quantity - 1)
                            : null,
                        semanticLabel: 'Decrease quantity',
                      ),
                      SizedBox(
                        width: 24,
                        child: Text(
                          '$quantity',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: isUnavailable
                                ? AppColors.muted
                                : AppColors.foreground,
                          ),
                        ),
                      ),
                      _QuickQuantityButton(
                        icon: Icons.add,
                        onPressed: isUnavailable
                            ? null
                            : () => onQuantityChanged(quantity + 1),
                        semanticLabel: 'Increase quantity',
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: FilledButton(
                    onPressed: !isUnavailable && isEnabled ? onAddToCart : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: AppColors.onAccent,
                      disabledBackgroundColor: isUnavailable
                          ? AppColors.surface2
                          : AppColors.accent.withValues(alpha: 0.35),
                      disabledForegroundColor: isUnavailable
                          ? AppColors.muted
                          : AppColors.onAccent.withValues(alpha: 0.75),
                      shape: const RoundedRectangleBorder(
                        borderRadius: AppRadii.mdRadius,
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      textStyle: theme.textTheme.labelLarge?.copyWith(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isEnabled && !isUnavailable) ...[
                          const SizedBox(width: 8),
                          Text(
                            formatPrice(totalCents),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                        if (!isUnavailable) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.chevron_right, size: 18),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickQuantityButton extends StatelessWidget {
  const _QuickQuantityButton({
    required this.icon,
    required this.onPressed,
    required this.semanticLabel,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      color: AppColors.foreground,
      disabledColor: AppColors.muted.withValues(alpha: 0.5),
      tooltip: semanticLabel,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints.tightFor(width: 44, height: 48),
    );
  }
}
