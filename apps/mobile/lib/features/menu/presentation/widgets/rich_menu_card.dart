import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../cart/providers/cart_provider.dart';
import '../../../checkout/data/checkout_models.dart' show PromoPreview;
import '../../../../generated/tables/menu_items.dart';
import '../../data/menu_item_visuals.dart';
import '../../data/menu_repository.dart';
import '../../providers/promo_preview_provider.dart';
import 'spice_level_indicator.dart';

const _greyscaleMatrix = <double>[
  0.2126,
  0.7152,
  0.0722,
  0,
  0,
  0.2126,
  0.7152,
  0.0722,
  0,
  0,
  0.2126,
  0.7152,
  0.0722,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
];

/// Horizontal menu card matching the web RichMenuCard: text on the left,
/// image on the right, live in-cart count, promo pricing and unavailable state.
class RichMenuCard extends ConsumerWidget {
  const RichMenuCard({
    super.key,
    required this.item,
    required this.onTap,
    this.height = 120,
  });

  final MenuItemWithModifiers item;
  final VoidCallback onTap;

  /// Minimum card height, matching the web image column's min-height. The
  /// card grows for longer descriptions or larger text scales.
  final double height;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final brand = BrandColors.of(context);
    final menuItem = item.item;
    final unavailable = !menuItem.isAvailable;
    final imageWidth = MediaQuery.sizeOf(context).width >= 600 ? 128.0 : 112.0;

    final promoAsync = ref.watch(promoPreviewProvider(menuItem.id));
    final promo = promoAsync.valueOrNull;
    // Gate on cart-line eligibility so the card never advertises a discount
    // the quick view, CTA, and cart line will not show (order-scoped/fixed
    // promos surface at checkout on the subtotal instead).
    final showDiscount = !unavailable && promo != null && promo.discountsCartItem;

    final quantity = ref.watch(
      cartProvider.select((cart) {
        var total = 0;
        for (final line in cart.items) {
          if (line.menuItemId == menuItem.id) total += line.quantity;
        }
        return total;
      }),
    );

    return Opacity(
      opacity: unavailable ? 0.60 : 1,
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgRadius,
          side: BorderSide(color: brand.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: unavailable ? null : onTap,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: height),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (menuItem.spiceLevel > 0) ...[
                            SpiceLevelIndicator(
                              level: menuItem.spiceLevel,
                              size: 12,
                            ),
                            const SizedBox(height: 4),
                          ],
                          Text(
                            menuItem.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              height: 1.25,
                              letterSpacing: -0.1,
                            ),
                          ),
                          if (menuItem.description != null &&
                              menuItem.description!.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              menuItem.description!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontSize: 13,
                                height: 1.45,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                          if (item.hasModifiers) ...[
                            const SizedBox(height: 4),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.local_fire_department,
                                  size: 13,
                                  color: AppColors.emberText,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  'Customizable',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0,
                                    color: AppColors.emberText,
                                  ),
                                ),
                              ],
                            ),
                          ],
                          const Spacer(),
                          _PriceRow(
                            item: menuItem,
                            promo: promo,
                            showDiscount: showDiscount,
                            unavailable: unavailable,
                          ),
                        ],
                      ),
                    ),
                  ),
                  SizedBox(
                    width: imageWidth,
                    height: height,
                    child: _CardImage(
                      item: menuItem,
                      unavailable: unavailable,
                      quantity: quantity,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.item,
    required this.promo,
    required this.showDiscount,
    required this.unavailable,
  });

  final MenuItemsRow item;
  final PromoPreview? promo;
  final bool showDiscount;
  final bool unavailable;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (showDiscount && promo != null) {
      return Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 6,
        runSpacing: 2,
        children: [
          Text(
            formatPrice(promo!.discountedCents),
            style: theme.textTheme.titleLarge?.copyWith(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
              color: AppColors.emberText,
            ),
          ),
          Text(
            formatPrice(item.priceCents),
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              color: AppColors.muted,
              decoration: TextDecoration.lineThrough,
              decorationColor: AppColors.muted,
            ),
          ),
        ],
      );
    }

    return Text(
      formatPrice(item.priceCents),
      style: theme.textTheme.titleLarge?.copyWith(
        fontSize: 17,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.2,
        color: unavailable ? AppColors.muted : AppColors.emberText,
      ),
    );
  }
}

class _CardImage extends StatelessWidget {
  const _CardImage({
    required this.item,
    required this.unavailable,
    required this.quantity,
  });

  final MenuItemsRow item;
  final bool unavailable;
  final int quantity;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final imageUrl = item.imageUrl;
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;

    Widget image = hasImage
        ? CachedNetworkImage(
            imageUrl: imageUrl,
            fit: BoxFit.cover,
            placeholder: (context, url) =>
                const ColoredBox(color: AppColors.surfaceSunk),
            errorWidget: (context, url, error) => const ColoredBox(
              color: AppColors.surface2,
              child: Center(
                child: Icon(Icons.restaurant, size: 28, color: AppColors.muted),
              ),
            ),
          )
        : const ColoredBox(
            color: AppColors.surface2,
            child: Center(
              child: Text(
                'NO IMAGE',
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: AppColors.muted,
                ),
              ),
            ),
          );

    if (unavailable) {
      image = ColorFiltered(
        colorFilter: const ColorFilter.matrix(_greyscaleMatrix),
        child: image,
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        image,
        if (unavailable) ...[
          const ColoredBox(color: Color(0x80000000)),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.surfaceSunk.withValues(alpha: 0.85),
                borderRadius: AppRadii.pillRadius,
                border: Border.all(color: AppColors.borderStrong),
              ),
              child: Text(
                'UNAVAILABLE',
                style: theme.textTheme.labelSmall?.copyWith(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 2,
                  color: AppColors.foreground,
                ),
              ),
            ),
          ),
        ] else
          Positioned(
            right: 10,
            bottom: 10,
            child: ExcludeSemantics(
              child: Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: quantity > 0 ? AppColors.accent : AppColors.foreground,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.black.withValues(alpha: 0.10),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.35),
                      blurRadius: 12,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: quantity > 0
                    ? Text(
                        '$quantity',
                        style: theme.textTheme.labelMedium?.copyWith(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                          color: AppColors.onAccent,
                        ),
                      )
                    : const Icon(
                        Icons.add,
                        size: 18,
                        color: AppColors.background,
                      ),
              ),
            ),
          ),
      ],
    );
  }
}
