import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/utils/price_formatter.dart';
import '../../../checkout/data/checkout_models.dart' show PromoPreview;
import '../widgets/store_closed_banner.dart';
import '../../providers/menu_providers.dart';
import '../../providers/promo_preview_provider.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Activate realtime watcher and periodic refresh
    ref.watch(menuRealtimeWatcherProvider);
    ref.watch(menuPeriodicRefreshProvider);
    // Activate promo realtime watcher for instant cross-platform promo sync
    ref.watch(promoRealtimeWatcherProvider);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Refetch menu data when the app returns to foreground
      ref.invalidate(categoriesWithItemsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const _HomeScreenContent();
  }
}

class _HomeScreenContent extends ConsumerWidget {
  const _HomeScreenContent();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoriesAsync = ref.watch(categoriesWithItemsProvider);
    final storeOpen = ref.watch(storeOpenProvider);
    final menuUpdated = ref.watch(menuUpdatedProvider);
    final promoUpdated = ref.watch(promoUpdatedProvider);

    return Scaffold(
      appBar: AppBar(),
      body: CustomScrollView(
        slivers: [
          // Hero banner
          SliverToBoxAdapter(child: _HeroBanner(isStoreOpen: storeOpen)),
          // Store closed banner
          if (storeOpen == false)
            const SliverToBoxAdapter(child: StoreClosedBanner()),
          // Menu updated indicator
          if (menuUpdated)
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.update, size: 16, color: Colors.green),
                    SizedBox(width: 8),
                    Text(
                      'Menu updated',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.green,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          // Promos updated indicator
          if (promoUpdated)
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.local_offer, size: 16, color: Colors.orange),
                    SizedBox(width: 8),
                    Text(
                      'Promos updated',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.orange,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          // Menu content
          categoriesAsync.when(
            data: (categories) => _MenuContent(categories: categories),
            loading: () => const SliverFillRemaining(
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (err, _) => SliverFillRemaining(
              child: Center(child: Text('Failed to load menu: $err')),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner({required this.isStoreOpen});

  final bool? isStoreOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 60, 24, 32),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.3),
            theme.colorScheme.surface,
          ],
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.local_fire_department,
            size: 56,
            color: theme.colorScheme.primary,
          ),
          const SizedBox(height: 12),
          Text(
            'Mad Krapow',
            style: theme.textTheme.headlineLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Hot, fiery Phad Kra Phao\ndelivered to your door.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
            ),
          ),
          if (isStoreOpen != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: (isStoreOpen! ? Colors.green : Colors.red).withValues(
                  alpha: 0.2,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isStoreOpen! ? Icons.circle : Icons.cancel_outlined,
                    size: 12,
                    color: isStoreOpen! ? Colors.green : Colors.red,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isStoreOpen! ? 'Open Now' : 'Currently Closed',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: isStoreOpen! ? Colors.green : Colors.red,
                      fontWeight: FontWeight.w600,
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

class _MenuContent extends StatelessWidget {
  const _MenuContent({required this.categories});

  final List<CategoryWithMenuItems> categories;

  @override
  Widget build(BuildContext context) {
    return SliverList(
      delegate: SliverChildBuilderDelegate((context, index) {
        final category = categories[index];
        return _CategorySection(category: category);
      }, childCount: categories.length),
    );
  }
}

class _CategorySection extends StatelessWidget {
  const _CategorySection({required this.category});

  final CategoryWithMenuItems category;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
          child: Text(
            category.category.name,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        if (category.category.description != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              category.category.description!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ),
        const SizedBox(height: 8),
        ...category.menuItems.map(
          (item) => _MenuItemTile(itemWithModifiers: item),
        ),
      ],
    );
  }
}

class _MenuItemTile extends ConsumerWidget {
  const _MenuItemTile({required this.itemWithModifiers});

  final MenuItemWithModifiers itemWithModifiers;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = itemWithModifiers.item;
    final theme = Theme.of(context);
    final promoAsync = ref.watch(promoPreviewProvider(item.id));
    final isUnavailable = !item.isAvailable;

    Widget imageWidget;
    if (item.imageUrl != null && item.imageUrl!.isNotEmpty) {
      imageWidget = ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: item.imageUrl!,
          width: 64,
          height: 64,
          fit: BoxFit.cover,
          placeholder: (context, url) => Container(
            width: 64,
            height: 64,
            color: theme.colorScheme.surfaceContainerHighest,
          ),
          errorWidget: (context, url, error) => Container(
            width: 64,
            height: 64,
            color: theme.colorScheme.surfaceContainerHighest,
            child: const Icon(Icons.restaurant, size: 28),
          ),
        ),
      );
    } else {
      imageWidget = Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Icon(Icons.restaurant, size: 28),
      );
    }

    if (isUnavailable) {
      imageWidget = ColorFiltered(
        colorFilter: const ColorFilter.matrix([
          0.2126, 0.7152, 0.0722, 0, 0,
          0.2126, 0.7152, 0.0722, 0, 0,
          0.2126, 0.7152, 0.0722, 0, 0,
          0,      0,      0,      1, 0,
        ]),
        child: Opacity(
          opacity: 0.5,
          child: imageWidget,
        ),
      );
    }

    return InkWell(
      onTap: isUnavailable ? null : () => context.push('/item/${item.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          children: [
            // Item image
            imageWidget,
            const SizedBox(width: 12),
            // Item info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: isUnavailable
                          ? theme.colorScheme.onSurface.withValues(alpha: 0.4)
                          : null,
                    ),
                  ),
                  if (item.description != null && item.description!.isNotEmpty)
                    Text(
                      item.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: isUnavailable
                            ? theme.colorScheme.onSurface.withValues(alpha: 0.3)
                            : theme.colorScheme.onSurface.withValues(
                                alpha: 0.6,
                              ),
                      ),
                    ),
                  const SizedBox(height: 4),
                  _buildPrice(
                    context,
                    theme,
                    item.priceCents,
                    promoAsync,
                    isUnavailable,
                  ),
                ],
              ),
            ),
            if (isUnavailable)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.error.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: theme.colorScheme.error.withValues(alpha: 0.3),
                  ),
                ),
                child: Text(
                  'Unavailable',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              )
            else
              Icon(
                Icons.chevron_right,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.3),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPrice(
    BuildContext context,
    ThemeData theme,
    int originalPriceCents,
    AsyncValue<PromoPreview?> promoAsync,
    bool isUnavailable,
  ) {
    final promo = promoAsync.valueOrNull;
    final showDiscount = !isUnavailable && promo != null && promo.savingsCents > 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (showDiscount) ...[
              Text(
                formatPrice(promo.discountedCents),
                style: theme.textTheme.titleSmall?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                formatPrice(originalPriceCents),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            ] else ...[
              Text(
                formatPrice(originalPriceCents),
                style: theme.textTheme.titleSmall?.copyWith(
                  color: isUnavailable
                      ? theme.colorScheme.onSurface.withValues(alpha: 0.3)
                      : theme.colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (!isUnavailable && itemWithModifiers.hasModifiers) ...[
                const SizedBox(width: 8),
                Text(
                  'Customizable',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(
                      alpha: 0.5,
                    ),
                  ),
                ),
              ],
            ],
          ],
        ),
      ],
    );
  }
}