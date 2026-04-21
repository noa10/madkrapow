import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../generated/database.dart';
import '../../providers/menu_providers.dart';

class AvailabilityToggle extends ConsumerWidget {
  const AvailabilityToggle({super.key, required this.item});

  final MenuItemsRow item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Switch(
      value: item.isAvailable,
      onChanged: (value) async {
        try {
          final repo = ref.read(menuRepositoryProvider);
          await repo.toggleItemAvailability(item.id, value);
          if (context.mounted) {
            ref.invalidate(categoriesWithItemsProvider);
          }
        } catch (e) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Failed to update availability: $e'),
                backgroundColor: Colors.red,
              ),
            );
          }
        }
      },
    );
  }
}
