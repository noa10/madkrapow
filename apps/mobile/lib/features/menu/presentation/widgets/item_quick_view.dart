import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../generated/tables/modifiers.dart';
import '../../../cart/data/cart_limits.dart';
import '../../data/menu_repository.dart';
import '../../providers/promo_preview_provider.dart';
import '../screens/item_detail_screen.dart';
import 'item_order_widgets.dart';

/// Opens the web-style menu quick view in a modal bottom sheet.
///
/// The item route still exists for deep links; selecting an item from the
/// storefront now opens this sheet instead of navigating away from the menu.
Future<void> showItemQuickView(
  BuildContext context,
  String itemId, {
  MenuItemWithModifiers? preview,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    useRootNavigator: true,
    enableDrag: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.5),
    constraints: const BoxConstraints(maxWidth: 640),
    builder: (sheetContext) {
      return _QuickViewSheet(
        itemId: itemId,
        preview: preview,
        onClose: () => Navigator.of(sheetContext).maybePop(),
      );
    },
  );
}

class _QuickViewSheet extends StatelessWidget {
  const _QuickViewSheet({
    required this.itemId,
    required this.onClose,
    this.preview,
  });

  final String itemId;
  final MenuItemWithModifiers? preview;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final keyboardInset = media.viewInsets.bottom;
    // The web quick view grows with its content and only caps at 92dvh.
    // Constrain the sheet instead of forcing it to full height so short
    // items get a compact panel while long modifier lists still scroll.
    // Keep the whole panel above the keyboard; the transparent padding
    // occupies the keyboard area so the sticky footer stays reachable.
    final maxHeight = (media.size.height - keyboardInset) * 0.92;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboardInset),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadii.xl),
            ),
            border: Border.all(color: AppColors.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              ItemDetailScreen(
                itemId: itemId,
                quickView: true,
                preview: preview,
                onRequestClose: onClose,
              ),
              // Give the top edge a dedicated drag surface. The scroll view
              // would otherwise win the gesture and only scroll the content.
              // Nothing interactive may sit under this 56px strip.
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: 56,
                child: _QuickViewDragSurface(onDismiss: onClose),
              ),
              Positioned(
                top: 12,
                right: 16,
                child: _QuickViewCloseButton(onPressed: onClose),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickViewCloseButton extends StatelessWidget {
  const _QuickViewCloseButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 2,
      shadowColor: AppColors.surfaceSunk,
      shape: const CircleBorder(
        side: BorderSide(color: AppColors.borderStrong),
      ),
      clipBehavior: Clip.antiAlias,
      child: IconButton(
        onPressed: onPressed,
        icon: const Icon(Icons.close, size: 20),
        color: AppColors.foreground,
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints.tightFor(width: 40, height: 40),
        tooltip: 'Close item view',
      ),
    );
  }
}

class _QuickViewDragSurface extends StatelessWidget {
  const _QuickViewDragSurface({required this.onDismiss});

  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Drag down to close',
      onDismiss: onDismiss,
      child: Listener(
        behavior: HitTestBehavior.opaque,
        child: Align(
          alignment: Alignment.topCenter,
          child: Container(
            margin: const EdgeInsets.only(top: 10),
            width: 38,
            height: 4,
            decoration: BoxDecoration(
              // The grabber sits on top of the banner, so it needs a light
              // fill with a dark hairline to stay visible on any photo.
              color: AppColors.foreground.withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: AppColors.surfaceSunk.withValues(alpha: 0.25),
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.surfaceSunk.withValues(alpha: 0.35),
                  blurRadius: 6,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The scrollable body + sticky footer rendered inside the modal sheet.
///
/// The detail screen owns ordering state and passes it down, so the full-screen
/// route and the quick view share one implementation of pricing and validation.
class ItemQuickViewContent extends ConsumerWidget {
  const ItemQuickViewContent({
    super.key,
    required this.item,
    required this.isUnavailable,
    required this.quantity,
    required this.requiredOptionsCount,
    required this.specialInstructions,
    required this.selectedModifiers,
    required this.groupKeys,
    required this.scrollController,
    required this.instructionsFocusNode,
    required this.instructionsFieldKey,
    required this.onToggleModifier,
    required this.onInstructionsChanged,
    required this.onInstructionsTap,
    required this.onQuantityChanged,
    required this.onAddPressed,
  });

  final FullMenuItem item;
  final bool isUnavailable;
  final int quantity;
  final int requiredOptionsCount;
  final String specialInstructions;
  final Map<String, List<ModifiersRow>> selectedModifiers;
  final Map<String, GlobalKey> groupKeys;
  final ScrollController scrollController;
  final FocusNode instructionsFocusNode;
  final GlobalKey instructionsFieldKey;
  final void Function(ModifierGroupWithModifiers group, ModifiersRow modifier)
  onToggleModifier;
  final ValueChanged<String> onInstructionsChanged;
  final VoidCallback onInstructionsTap;
  final ValueChanged<int> onQuantityChanged;
  final VoidCallback onAddPressed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final promo = ref.watch(promoPreviewProvider(item.item.id)).valueOrNull;
    final totalCents = itemOrderTotalCents(
      item,
      selectedModifiers,
      quantity,
      promo: promo,
    );
    final visibleGroups = item.modifierGroups
        .where((group) => group.modifiers.isNotEmpty)
        .toList();

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: CustomScrollView(
            shrinkWrap: true,
            controller: scrollController,
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
                        const ItemUnavailableNotice(),
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
                      const SizedBox(height: 12),
                      ItemPriceText(
                        priceCents: item.item.priceCents,
                        promo: promo,
                        size: 22,
                      ),
                    ],
                  ),
                ),
              ),
              if (visibleGroups.isNotEmpty)
                const SliverToBoxAdapter(child: ItemSectionDivider()),
              ...visibleGroups.map(
                (group) => SliverToBoxAdapter(
                  child: KeyedSubtree(
                    key: groupKeys[group.group.id],
                    child: ItemModifierGroupSection(
                      group: group,
                      selectedModifiers:
                          selectedModifiers[group.group.id] ?? const [],
                      enabled: !isUnavailable,
                      onToggle: isUnavailable
                          ? (_) {}
                          : (modifier) => onToggleModifier(group, modifier),
                    ),
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: ItemSectionDivider()),
              SliverToBoxAdapter(
                child: KeyedSubtree(
                  key: instructionsFieldKey,
                  child: ItemSpecialInstructionsField(
                    value: specialInstructions,
                    enabled: !isUnavailable,
                    focusNode: instructionsFocusNode,
                    onTap: onInstructionsTap,
                    onChanged: onInstructionsChanged,
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        ),
        _QuickViewBottomBar(
          quantity: quantity,
          totalCents: totalCents,
          isUnavailable: isUnavailable,
          requiredOptionsCount: requiredOptionsCount,
          onQuantityChanged: onQuantityChanged,
          onAddPressed: onAddPressed,
        ),
      ],
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

class _QuickViewBottomBar extends StatelessWidget {
  const _QuickViewBottomBar({
    required this.quantity,
    required this.totalCents,
    required this.isUnavailable,
    required this.requiredOptionsCount,
    required this.onQuantityChanged,
    required this.onAddPressed,
  });

  final int quantity;
  final int totalCents;
  final bool isUnavailable;
  final int requiredOptionsCount;
  final ValueChanged<int> onQuantityChanged;
  final VoidCallback onAddPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = isUnavailable
        ? 'Unavailable'
        : requiredOptionsCount > 0
        ? 'Select options ($requiredOptionsCount)'
        : 'Add item';

    return ItemFooterSurface(
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
                    onPressed: !isUnavailable && quantity < maxItemQuantity
                        ? () => onQuantityChanged(quantity + 1)
                        : null,
                    semanticLabel: 'Increase quantity',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: ItemPrimaryButton(
              label: label,
              // Match the web sheet: the running total only appears once the
              // required picks are done, so the label keeps its full width.
              trailing: isUnavailable || requiredOptionsCount > 0
                  ? null
                  : formatPrice(totalCents),
              onPressed: onAddPressed,
              isUnavailable: isUnavailable,
            ),
          ),
        ],
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
