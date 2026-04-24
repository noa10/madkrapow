import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../../../core/widgets/async_value_widget.dart';
import '../../providers/menu_providers.dart';
import '../widgets/category_section.dart';

class MenuManagementScreen extends ConsumerStatefulWidget {
  const MenuManagementScreen({super.key});

  @override
  ConsumerState<MenuManagementScreen> createState() =>
      _MenuManagementScreenState();
}

class _MenuManagementScreenState extends ConsumerState<MenuManagementScreen> {
  RealtimeChannel? _realtimeChannel;

  @override
  void initState() {
    super.initState();
    // Subscribe to realtime menu change notifications
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final repo = ref.read(menuRepositoryProvider);
      _realtimeChannel = repo.subscribeToMenuChanges(
        onChange: () {
          if (!mounted) return;
          ref.invalidate(categoriesWithItemsProvider);
        },
      );
    });
  }

  @override
  void dispose() {
    if (_realtimeChannel != null) {
      final repo = ref.read(menuRepositoryProvider);
      repo.unsubscribeFromChannel(_realtimeChannel!);
      _realtimeChannel = null;
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final categoriesAsync = ref.watch(categoriesWithItemsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Menu Management'),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Manage Modifiers',
            onPressed: () => context.push(AppRoutes.modifiers),
          ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add Category',
            onPressed: () => context.push(AppRoutes.categoryNew),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(categoriesWithItemsProvider);
        },
        child: AsyncValueWidget(
          value: categoriesAsync,
          data: (categories) {
            if (categories.isEmpty) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.restaurant_menu, size: 64, color: Colors.grey),
                    const SizedBox(height: 16),
                    const Text('No menu categories yet'),
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      onPressed: () => context.push(AppRoutes.categoryNew),
                      icon: const Icon(Icons.add),
                      label: const Text('Add Category'),
                    ),
                  ],
                ),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: categories.length,
              itemBuilder: (context, index) {
                final categoryWithItems = categories[index];
                return CategorySection(
                  category: categoryWithItems.category,
                  items: categoryWithItems.items,
                );
              },
            );
          },
        ),
      ),
    );
  }
}
