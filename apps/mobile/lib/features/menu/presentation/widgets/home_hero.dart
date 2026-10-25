import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../profile/data/store_settings_repository.dart';

/// Mobile hero matching the web storefront: image band, location badges,
/// headline, store facts, trust chips, and the two menu CTAs.
class HomeHero extends ConsumerWidget {
  const HomeHero({
    super.key,
    required this.onOrderNow,
    required this.onExploreMenu,
  });

  final VoidCallback onOrderNow;
  final VoidCallback onExploreMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final branding = ref.watch(storeBrandingProvider).valueOrNull;
    final storeName = branding?.storeName ?? 'Mad Krapow';

    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final imageHeight = (maxWidth * 0.44).clamp(168.0, 236.0).toDouble();
        final headlineSize = maxWidth >= 900
            ? 48.0
            : maxWidth >= 600
            ? 38.0
            : 30.0;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: imageHeight,
              child: _HeroImage(
                imageUrl: branding?.heroImageUrl,
                storeName: storeName,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1280),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _LocationChip(maxWidth: maxWidth - 32),
                          const _NoPorkChip(),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Hot, Fiery Phad Kra Phao.',
                        style: theme.textTheme.displayMedium?.copyWith(
                          fontSize: headlineSize,
                          height: 1.05,
                          letterSpacing: -0.9,
                        ),
                      ),
                      const SizedBox(height: 14),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 620),
                        child: Text(
                          'Craving bold Thai flavours? Mad Krapow serves fiery, '
                          'flavourful plates of this iconic dish — wok-fired fresh '
                          'to order and delivered fast from Kampung Subang Baru, '
                          'Shah Alam.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 14,
                            height: 1.7,
                            color: AppColors.muted,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      _MetaRow(maxWidth: maxWidth - 32),
                      const SizedBox(height: 14),
                      const _TrustChips(),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 12,
                        runSpacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          GradientCta(
                            label: 'Order now',
                            onPressed: onOrderNow,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 22,
                              vertical: 15,
                            ),
                          ),
                          OutlinedButton(
                            onPressed: onExploreMenu,
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(0, 48),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 22,
                              ),
                            ),
                            child: const Text('Explore menu'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage({required this.imageUrl, required this.storeName});

  final String? imageUrl;
  final String storeName;

  @override
  Widget build(BuildContext context) {
    final hasRemoteImage = imageUrl != null && imageUrl!.isNotEmpty;
    final fallback = Image.asset(
      'assets/images/hero-wok-kra-pao.jpg',
      fit: BoxFit.cover,
      alignment: const Alignment(0, -0.16),
    );

    final image = hasRemoteImage
        ? CachedNetworkImage(
            imageUrl: imageUrl!,
            fit: BoxFit.cover,
            alignment: const Alignment(0, -0.16),
            placeholder: (context, url) =>
                const ColoredBox(color: AppColors.surface2),
            errorWidget: (context, url, error) => fallback,
          )
        : fallback;

    return Semantics(
      image: true,
      label:
          'Wok-fired Phad Kra Phao at $storeName — Thai holy basil stir-fry '
          "with bird's eye chilli and a crisp-edged fried egg.",
      child: Stack(
        fit: StackFit.expand,
        children: [
          image,
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [
                  AppColors.background,
                  AppColors.background.withValues(alpha: 0.40),
                  AppColors.background.withValues(alpha: 0.05),
                ],
                stops: const [0.01, 0.52, 1],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LocationChip extends StatelessWidget {
  const _LocationChip({required this.maxWidth});

  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.surfaceSunk.withValues(alpha: 0.80),
          borderRadius: AppRadii.pillRadius,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_on, size: 14, color: AppColors.sesame),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                'Since February 2023 · Kampung Subang Baru, Shah Alam',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  fontSize: 11,
                  height: 1.1,
                  letterSpacing: 0,
                  fontWeight: FontWeight.w700,
                  color: AppColors.sesame,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoPorkChip extends StatelessWidget {
  const _NoPorkChip();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.herbSoft,
        borderRadius: AppRadii.pillRadius,
        border: Border.all(color: AppColors.herb.withValues(alpha: 0.30)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.shield_outlined,
            size: 14,
            color: AppColors.herbText,
          ),
          const SizedBox(width: 6),
          Text(
            'No pork, no lard',
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 11,
              height: 1.1,
              letterSpacing: 0,
              fontWeight: FontWeight.w600,
              color: AppColors.herbText,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.maxWidth});

  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final metaStyle = theme.textTheme.bodyMedium?.copyWith(
      fontSize: 13,
      height: 1.4,
      fontWeight: FontWeight.w600,
      color: AppColors.foreground,
    );

    return Wrap(
      spacing: 16,
      runSpacing: 8,
      children: [
        _MetaItem(
          icon: Icons.schedule,
          iconColor: AppColors.emberText,
          maxWidth: maxWidth,
          child: Text(
            'Open daily 11:00–22:00 · Fri & Sat till 23:00',
            style: metaStyle,
          ),
        ),
        _MetaItem(
          icon: Icons.location_on,
          iconColor: AppColors.emberText,
          maxWidth: maxWidth,
          child: Text('Kampung Subang Baru, Shah Alam', style: metaStyle),
        ),
      ],
    );
  }
}

class _MetaItem extends StatelessWidget {
  const _MetaItem({
    required this.icon,
    required this.iconColor,
    required this.maxWidth,
    required this.child,
  });

  final IconData icon;
  final Color iconColor;
  final double maxWidth;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: iconColor),
          const SizedBox(width: 6),
          Flexible(child: child),
        ],
      ),
    );
  }
}

class _TrustChips extends StatelessWidget {
  const _TrustChips();

  static const _chips = [
    (
      label: 'Freshly cooked to order',
      icon: Icons.check_circle_outline,
      color: AppColors.sesame,
    ),
    (
      label: 'Bold Thai street-food flavour',
      icon: Icons.local_fire_department,
      color: AppColors.ember,
    ),
    (
      label: 'Locally sourced ingredients',
      icon: Icons.eco_outlined,
      color: AppColors.herbText,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var index = 0; index < _chips.length; index++) ...[
            if (index > 0) const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: AppRadii.pillRadius,
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _chips[index].icon,
                    size: 16,
                    color: _chips[index].color,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _chips[index].label,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
