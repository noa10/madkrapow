import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../data/menu_item_visuals.dart';
import '../../data/menu_repository.dart';
import 'spice_level_indicator.dart';

/// Chef's Picks spotlight, mirroring the web SignatureHero.
class SignatureMenuSection extends StatelessWidget {
  const SignatureMenuSection({
    super.key,
    required this.items,
    required this.onItemTap,
  });

  final List<MenuItemWithModifiers> items;
  final ValueChanged<MenuItemWithModifiers> onItemTap;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    return LayoutBuilder(
      builder: (context, constraints) {
        final useTwoColumns = constraints.maxWidth >= 700 && items.length > 1;

        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1280),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _ChefPicksBadge(),
                  const SizedBox(height: 12),
                  if (useTwoColumns)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var index = 0; index < items.length; index++) ...[
                          if (index > 0) const SizedBox(width: 14),
                          Expanded(
                            child: SignatureMenuCard(
                              item: items[index],
                              onTap: () => onItemTap(items[index]),
                            ),
                          ),
                        ],
                      ],
                    )
                  else
                    Column(
                      children: [
                        for (var index = 0; index < items.length; index++) ...[
                          if (index > 0) const SizedBox(height: 14),
                          SignatureMenuCard(
                            item: items[index],
                            onTap: () => onItemTap(items[index]),
                          ),
                        ],
                      ],
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ChefPicksBadge extends StatelessWidget {
  const _ChefPicksBadge();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: AppRadii.pillRadius,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.ember,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            "CHEF'S PICKS",
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 11,
              letterSpacing: 1.2,
              color: AppColors.foreground,
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-bleed image card with the item name, spice meter, price, and CTA.
class SignatureMenuCard extends StatelessWidget {
  const SignatureMenuCard({super.key, required this.item, required this.onTap});

  final MenuItemWithModifiers item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWide = MediaQuery.sizeOf(context).width >= 700;
    final minHeight = isWide ? 360.0 : 320.0;
    final imageUrl = item.item.imageUrl;
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;
    final hasDescription =
        item.item.description != null && item.item.description!.isNotEmpty;

    return Semantics(
      button: true,
      label: '${item.item.name}, ${formatPrice(item.item.priceCents)}',
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Stack(
            children: [
              Positioned.fill(
                child: hasImage
                    ? Opacity(
                        opacity: 0.60,
                        child: CachedNetworkImage(
                          imageUrl: imageUrl,
                          fit: BoxFit.cover,
                          placeholder: (context, url) =>
                              const ColoredBox(color: AppColors.surface2),
                          errorWidget: (context, url, error) =>
                              const ColoredBox(color: AppColors.surface2),
                        ),
                      )
                    : const ColoredBox(color: AppColors.surface2),
              ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        AppColors.background,
                        AppColors.background.withValues(alpha: 0.75),
                        AppColors.background.withValues(alpha: 0.10),
                      ],
                      stops: const [0, 0.45, 1],
                    ),
                  ),
                ),
              ),
              ConstrainedBox(
                constraints: BoxConstraints(minHeight: minHeight),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.end,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (item.item.spiceLevel > 0) ...[
                        Align(
                          alignment: Alignment.centerLeft,
                          child: SpiceLevelIndicator(
                            level: item.item.spiceLevel,
                            size: 14,
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      Text(
                        item.item.name,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontSize: isWide ? 28 : 24,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                          letterSpacing: -0.6,
                        ),
                      ),
                      if (hasDescription) ...[
                        const SizedBox(height: 10),
                        Text(
                          item.item.description!,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 13,
                            height: 1.54,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),
                      Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 16,
                        runSpacing: 12,
                        children: [
                          Text(
                            formatPrice(item.item.priceCents),
                            style: theme.textTheme.headlineMedium?.copyWith(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                              color: AppColors.emberText,
                            ),
                          ),
                          _SignatureCta(
                            label: item.hasModifiers
                                ? 'Customize'
                                : 'Order now',
                          ),
                        ],
                      ),
                    ],
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

class _SignatureCta extends StatelessWidget {
  const _SignatureCta({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
      decoration: BoxDecoration(
        color: AppColors.accent,
        borderRadius: AppRadii.pillRadius,
        boxShadow: [
          BoxShadow(
            color: AppColors.accent.withValues(alpha: 0.28),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.add, size: 16, color: AppColors.onAccent),
          const SizedBox(width: 6),
          Text(
            label,
            style: theme.textTheme.labelLarge?.copyWith(
              fontSize: 13,
              color: AppColors.onAccent,
            ),
          ),
        ],
      ),
    );
  }
}
