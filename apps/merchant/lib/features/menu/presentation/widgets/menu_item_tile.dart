import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/utils/price_formatter.dart';
import '../../../../../generated/database.dart';

class MenuItemTile extends StatelessWidget {
  const MenuItemTile({super.key, required this.item});

  final MenuItemsRow item;

  @override
  Widget build(BuildContext context) {
    final hasImage = item.imageUrl != null && item.imageUrl!.isNotEmpty;

    Widget leadingWidget;
    if (hasImage) {
      leadingWidget = ClipOval(
        child: CachedNetworkImage(
          imageUrl: item.imageUrl!,
          width: 40,
          height: 40,
          fit: BoxFit.cover,
          placeholder: (context, url) => const SizedBox(
            width: 40,
            height: 40,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          errorWidget: (context, url, error) => CircleAvatar(
            backgroundColor: item.isAvailable ? Colors.green : Colors.grey,
            radius: 20,
            child: Icon(
              item.isAvailable ? Icons.restaurant : Icons.block,
              color: Colors.white,
              size: 20,
            ),
          ),
        ),
      );
    } else {
      leadingWidget = CircleAvatar(
        backgroundColor: item.isAvailable ? Colors.green : Colors.grey,
        child: Icon(
          item.isAvailable ? Icons.restaurant : Icons.block,
          color: Colors.white,
          size: 20,
        ),
      );
    }

    if (!item.isAvailable) {
      leadingWidget = Opacity(
        opacity: 0.5,
        child: leadingWidget,
      );
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
        style: const TextStyle(fontWeight: FontWeight.w500),
      ),
      trailing: const Icon(Icons.chevron_right),
    );
  }
}
