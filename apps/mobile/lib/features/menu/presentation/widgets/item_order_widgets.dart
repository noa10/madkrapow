import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../generated/tables/modifiers.dart';
import '../../../cart/data/cart_limits.dart';
import '../../../checkout/data/checkout_models.dart' show PromoPreview;
import '../../data/menu_repository.dart';

/// Sum of the selected modifier deltas for one item.
int selectedModifierTotalCents(
  FullMenuItem item,
  Map<String, List<ModifiersRow>> selectedModifiers,
) {
  var total = 0;
  for (final group in item.modifierGroups) {
    final selected =
        selectedModifiers[group.group.id] ?? const <ModifiersRow>[];
    for (final modifier in selected) {
      total += modifier.priceDeltaCents;
    }
  }
  return total;
}

/// Unit price after the cart-line promo discount and selected modifier
/// deltas. Only promos the cart honors per line reduce this total, so the
/// CTA can never advertise a price the cart will not show.
int itemUnitTotalCents(
  FullMenuItem item,
  Map<String, List<ModifiersRow>> selectedModifiers, {
  PromoPreview? promo,
}) {
  final discount =
      promo != null && promo.discountsCartItem ? promo.savingsCents : 0;
  final unit =
      item.item.priceCents -
      discount +
      selectedModifierTotalCents(item, selectedModifiers);
  return unit < 0 ? 0 : unit;
}

/// Line total for the current quantity.
int itemOrderTotalCents(
  FullMenuItem item,
  Map<String, List<ModifiersRow>> selectedModifiers,
  int quantity, {
  PromoPreview? promo,
}) {
  return itemUnitTotalCents(item, selectedModifiers, promo: promo) * quantity;
}

/// Formats the item's unit price, with a strikethrough original when a promo
/// applies. Shared by the full-screen detail route and the quick view so the
/// card, sheet, and footer never disagree.
class ItemPriceText extends StatelessWidget {
  const ItemPriceText({
    super.key,
    required this.priceCents,
    this.promo,
    this.size = 22,
  });

  final int priceCents;
  final PromoPreview? promo;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final discounted = promo != null && promo!.discountsCartItem;

    final priceStyle = theme.textTheme.titleLarge?.copyWith(
      fontSize: size,
      color: AppColors.emberText,
      fontWeight: FontWeight.bold,
    );

    if (!discounted) {
      return Text(formatPrice(priceCents), style: priceStyle);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(formatPrice(promo!.discountedCents), style: priceStyle),
        Text(
          formatPrice(priceCents),
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            decoration: TextDecoration.lineThrough,
          ),
        ),
      ],
    );
  }
}

/// One modifier group with its radio/checkbox rows.
class ItemModifierGroupSection extends StatelessWidget {
  const ItemModifierGroupSection({
    super.key,
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
    if (group.modifiers.isEmpty) return const SizedBox.shrink();

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
            return ItemModifierTile(
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

class ItemModifierTile extends StatelessWidget {
  const ItemModifierTile({
    super.key,
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
    final disabledColor = Theme.of(
      context,
    ).colorScheme.onSurface.withValues(alpha: 0.4);

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
                  color: enabled ? null : disabledColor,
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

/// Full-screen quantity row. The quick view uses a compact stepper in its
/// sticky footer instead.
class ItemQuantitySelector extends StatelessWidget {
  const ItemQuantitySelector({
    super.key,
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
    final disabledColor = theme.colorScheme.onSurface.withValues(alpha: 0.4);

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
              color: enabled ? null : disabledColor,
            ),
          ),
          const Spacer(),
          IconButton.outlined(
            onPressed: enabled && quantity > 1
                ? () => onChanged(quantity - 1)
                : null,
            icon: const Icon(Icons.remove),
            tooltip: 'Decrease quantity',
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              '$quantity',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: enabled ? null : disabledColor,
              ),
            ),
          ),
          IconButton.outlined(
            onPressed: enabled && quantity < maxItemQuantity
                ? () => onChanged(quantity + 1)
                : null,
            icon: const Icon(Icons.add),
            tooltip: 'Increase quantity',
          ),
        ],
      ),
    );
  }
}

class ItemSpecialInstructionsField extends StatelessWidget {
  const ItemSpecialInstructionsField({
    super.key,
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

  static const int maxLength = 200;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Count user-perceived characters, not UTF-16 code units.
    final remaining = maxLength - value.characters.length;

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
            maxLength: maxLength,
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

class ItemUnavailableNotice extends StatelessWidget {
  const ItemUnavailableNotice({super.key});

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

class ItemImagePlaceholder extends StatelessWidget {
  const ItemImagePlaceholder({super.key});

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

class ItemSectionDivider extends StatelessWidget {
  const ItemSectionDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Divider(height: 1, color: AppColors.border),
    );
  }
}

/// Sticky footer surface shared by the detail route and quick view.
class ItemFooterSurface extends StatelessWidget {
  const ItemFooterSurface({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
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
          child: child,
        ),
      ),
    );
  }
}

/// Solid accent CTA used for "Add to Cart" in both ordering surfaces.
class ItemPrimaryButton extends StatelessWidget {
  const ItemPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.trailing,
    this.isEnabled = true,
    this.isUnavailable = false,
    this.height = 48,
  });

  final String label;
  final VoidCallback onPressed;
  final String? trailing;
  final bool isEnabled;
  final bool isUnavailable;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      height: height,
      child: FilledButton(
        onPressed: isUnavailable || !isEnabled ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.onAccent,
          disabledBackgroundColor: isUnavailable
              ? AppColors.surface2
              : AppColors.accent.withValues(alpha: 0.35),
          disabledForegroundColor: isUnavailable
              ? AppColors.muted
              : AppColors.onAccent.withValues(alpha: 0.75),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdRadius),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          textStyle: theme.textTheme.labelLarge?.copyWith(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            if (trailing != null && !isUnavailable) ...[
              const SizedBox(width: 8),
              Text(
                trailing!,
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
    );
  }
}

class ItemUnavailableBottomBar extends StatelessWidget {
  const ItemUnavailableBottomBar({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ItemFooterSurface(
      child: SizedBox(
        height: 48,
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(
            minimumSize: const Size(double.infinity, 48),
            disabledBackgroundColor: scheme.onSurface.withValues(alpha: 0.1),
            shape: const RoundedRectangleBorder(
              borderRadius: AppRadii.mdRadius,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.block, size: 18, color: scheme.error),
              const SizedBox(width: 8),
              Text(
                'Unavailable',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: scheme.error,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
