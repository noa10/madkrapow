import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../../../core/widgets/async_value_widget.dart';
import '../../../../generated/tables/modifiers.dart';
import '../../../cart/data/cart_item.dart';
import '../../../cart/providers/cart_provider.dart';
import '../../data/menu_repository.dart';
import '../../providers/promo_preview_provider.dart';

class ItemDetailScreen extends ConsumerStatefulWidget {
  const ItemDetailScreen({super.key, required this.itemId});

  final String itemId;

  @override
  ConsumerState<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends ConsumerState<ItemDetailScreen> {
  int _quantity = 1;
  String _specialInstructions = '';
  final Map<String, List<ModifiersRow>> _selectedModifiers = {};

  int get _totalCents {
    final item = ref.read(menuItemDetailProvider(widget.itemId)).value;
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
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                formatPrice(priceCents),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurface.withValues(
                    alpha: 0.5,
                  ),
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            ],
          );
        }
        return Text(
          formatPrice(priceCents),
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: Theme.of(context).colorScheme.primary,
            fontWeight: FontWeight.bold,
          ),
        );
      },
      loading: () => Text(
        formatPrice(priceCents),
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.bold,
        ),
      ),
      error: (err, st) => Text(
        formatPrice(priceCents),
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
          color: Theme.of(context).colorScheme.primary,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final itemAsync = ref.watch(menuItemDetailProvider(widget.itemId));

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
              : _BottomBar(
                  totalCents: _totalCents,
                  onAddToCart: () {
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
                        content: Text(
                          '${_quantity}x ${item.item.name} added to cart',
                        ),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                    context.pop();
                  },
                ),
          body: Opacity(
            opacity: isUnavailable ? 0.75 : 1.0,
            child: CustomScrollView(
              slivers: [
                // Image
                SliverToBoxAdapter(
                  child:
                      item.item.imageUrl != null && item.item.imageUrl!.isNotEmpty
                      ? CachedNetworkImage(
                          imageUrl: item.item.imageUrl!,
                          height: 260,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorWidget: (context, url, error) =>
                              _ImagePlaceholder(),
                        )
                      : const _ImagePlaceholder(),
                ),
                // Item info
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.item.name,
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.category.name,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(
                              context,
                            ).colorScheme.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                        if (isUnavailable) ...[
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.error.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: Theme.of(context).colorScheme.error.withValues(alpha: 0.3),
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.block,
                                  size: 16,
                                  color: Theme.of(context).colorScheme.error,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'This item is currently unavailable',
                                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    color: Theme.of(context).colorScheme.error,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        if (item.item.description != null &&
                            item.item.description!.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Text(
                            item.item.description!,
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                        const SizedBox(height: 16),
                        _buildItemPrice(context, item.item.id, item.item.priceCents),
                      ],
                    ),
                  ),
                ),
                // Modifier groups
                ...item.modifierGroups.map(
                  (group) => SliverToBoxAdapter(
                    child: _ModifierGroupSection(
                      group: group,
                      selectedModifiers: _selectedModifiers[group.group.id] ?? [],
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
                    onChanged: (v) => _specialInstructions = v,
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
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 200,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: const Icon(Icons.restaurant, size: 48),
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
                  color: enabled ? null : theme.colorScheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
              if (group.isRequired) ...[
                const SizedBox(width: 4),
                Text(
                  '*Required',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: enabled ? theme.colorScheme.error : theme.colorScheme.error.withValues(alpha: 0.4),
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
                child: Radio<bool>(
                  value: true,
                  enabled: enabled,
                ),
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
                  color: enabled ? null : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
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
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3),
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
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          Text(
            'Quantity',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: enabled ? null : theme.colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
          const Spacer(),
          IconButton.outlined(
            onPressed: enabled && quantity > 1 ? () => onChanged(quantity - 1) : null,
            icon: const Icon(Icons.remove),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              '$quantity',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: enabled ? null : theme.colorScheme.onSurface.withValues(alpha: 0.4),
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
  });

  final String value;
  final ValueChanged<String> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: TextField(
        onChanged: enabled ? onChanged : null,
        maxLines: 3,
        enabled: enabled,
        textInputAction: TextInputAction.done,
        decoration: InputDecoration(
          labelText: 'Special Instructions',
          hintText: enabled ? 'E.g. Extra spicy, no onions...' : 'Unavailable',
          alignLabelWithHint: true,
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.totalCents, required this.onAddToCart});

  final int totalCents;
  final VoidCallback onAddToCart;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FilledButton(
          onPressed: onAddToCart,
          style: FilledButton.styleFrom(
            minimumSize: const Size(double.infinity, 52),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Add to Cart'),
              const SizedBox(width: 8),
              Text(
                formatPrice(totalCents),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UnavailableBottomBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(
            minimumSize: const Size(double.infinity, 52),
            disabledBackgroundColor: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
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
