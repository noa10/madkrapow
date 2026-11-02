import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../models/pos_models.dart';

/// A POS dish card in the storefront's visual language: text left, photo right,
/// a floating add affordance. Tapping opens the options dialog for customizable
/// dishes and adds straight to the sale otherwise.
class PosMenuCard extends StatelessWidget {
  const PosMenuCard({
    super.key,
    required this.item,
    required this.hasModifiers,
    required this.onSelect,
  });

  final PosMenuItem item;
  final bool hasModifiers;
  final VoidCallback onSelect;

  static const _height = 116.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasImage = item.imageUrl != null && item.imageUrl!.isNotEmpty;

    return SizedBox(
      height: _height,
      child: Material(
        color: AppColors.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: AppRadii.mdRadius,
          side: BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onSelect,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          height: 1.2,
                          color: AppColors.foreground,
                        ),
                      ),
                      if (hasModifiers) ...[
                        const SizedBox(height: 2),
                        const Row(
                          children: [
                            Icon(
                              Icons.local_fire_department,
                              size: 13,
                              color: AppColors.ember,
                            ),
                            SizedBox(width: 3),
                            Text(
                              'Customizable',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: AppColors.emberText,
                              ),
                            ),
                          ],
                        ),
                      ],
                      if (item.description != null &&
                          item.description!.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Expanded(
                          child: Text(
                            item.description!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontSize: 11,
                              height: 1.3,
                              color: AppColors.muted,
                            ),
                          ),
                        ),
                      ] else
                        const Spacer(),
                      Text(
                        formatPrice(item.priceCents),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.emberText,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SizedBox(
                width: 104,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (hasImage)
                      CachedNetworkImage(
                        imageUrl: item.imageUrl!,
                        fit: BoxFit.cover,
                        placeholder: (context, url) =>
                            const ColoredBox(color: AppColors.surfaceSunk),
                        errorWidget: (context, url, error) =>
                            const _NoImage(),
                      )
                    else
                      const _NoImage(),
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Container(
                        width: 30,
                        height: 30,
                        decoration: const BoxDecoration(
                          color: AppColors.foreground,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Color(0x66000000),
                              blurRadius: 12,
                              offset: Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.add,
                          size: 18,
                          color: AppColors.background,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoImage extends StatelessWidget {
  const _NoImage();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.surface2,
      child: Center(
        child: Text(
          'NO IMAGE',
          style: TextStyle(
            fontSize: 9,
            letterSpacing: 1.4,
            color: AppColors.muted,
          ),
        ),
      ),
    );
  }
}
