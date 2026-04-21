import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/utils/price_formatter.dart';
import '../../../../../generated/database.dart';

class MenuItemTile extends StatelessWidget {
  const MenuItemTile({super.key, required this.item});

  final MenuItemsRow item;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () => context.push('/menu/items/${item.id}'),
      leading: CircleAvatar(
        backgroundColor: item.isAvailable ? Colors.green : Colors.grey,
        child: Icon(
          item.isAvailable ? Icons.restaurant : Icons.block,
          color: Colors.white,
          size: 20,
        ),
      ),
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
