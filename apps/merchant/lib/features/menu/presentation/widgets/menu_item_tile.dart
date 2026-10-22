import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../../core/utils/price_formatter.dart';
import '../../../../../generated/database.dart';

class MenuItemTile extends StatelessWidget {
  const MenuItemTile({super.key, required this.item});

  final MenuItemsRow item;

  static const _imageRadius = BorderRadius.all(Radius.circular(8));
  static const _imageSize = 40.0;

  @override
  Widget build(BuildContext context) {
    final hasImage = item.imageUrl != null && item.imageUrl!.isNotEmpty;

    Widget leadingWidget;
    if (hasImage) {
      leadingWidget = ClipRRect(
        borderRadius: _imageRadius,
        child: CachedNetworkImage(
          imageUrl: item.imageUrl!,
          width: _imageSize,
          height: _imageSize,
          fit: BoxFit.cover,
          placeholder: (context, url) => const SizedBox(
            width: _imageSize,
            height: _imageSize,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          errorWidget: (context, url, error) => _fallbackTile(),
        ),
      );
    } else {
      leadingWidget = _fallbackTile();
    }

    if (!item.isAvailable) {
      leadingWidget = Opacity(opacity: 0.5, child: leadingWidget);
    }

    return ListTile(
      onTap: () => context.push('/menu/items/${item.id}'),
      leading: leadingWidget,
      title: Text(
        item.name,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          decoration: item.isAvailable ? null : TextDecoration.lineThrough,
        ),
      ),
      subtitle: Text(
        formatPrice(item.priceCents),
        style: const TextStyle(
          fontWeight: FontWeight.w500,
          color: AppColors.emberText,
        ),
      ),
      trailing: const Icon(Icons.chevron_right),
    );
  }

  Widget _fallbackTile() {
    return Container(
      width: _imageSize,
      height: _imageSize,
      decoration: BoxDecoration(
        color: item.isAvailable ? AppColors.herb : AppColors.surface3,
        borderRadius: _imageRadius,
      ),
      child: Icon(
        item.isAvailable ? Icons.restaurant : Icons.block,
        color: item.isAvailable ? AppColors.onAccent : AppColors.muted,
        size: 20,
      ),
    );
  }
}
