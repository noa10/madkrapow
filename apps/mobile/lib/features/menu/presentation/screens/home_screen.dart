import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../profile/data/store_settings_repository.dart';
import '../../providers/menu_providers.dart';
import '../../providers/promo_preview_provider.dart';
import '../menu_catalog_filter.dart';
import '../widgets/brand_logo.dart';
import '../widgets/home_hero.dart';
import '../widgets/home_menu_states.dart';
import '../widgets/how_it_works_section.dart';
import '../widgets/how_to_order_section.dart';
import '../widgets/item_quick_view.dart';
import '../widgets/menu_category_rail.dart';
import '../widgets/menu_category_section.dart';
import '../widgets/menu_search_field.dart';
import '../widgets/signature_menu_card.dart';
import '../widgets/store_closed_banner.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with WidgetsBindingObserver {
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
    // Activate branding realtime watcher for instant cross-platform branding sync
    ref.watch(brandingRealtimeWatcherProvider);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Refetch menu and branding data when the app returns to foreground
      ref.invalidate(categoriesWithItemsProvider);
      ref.invalidate(storeBrandingProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const _HomeScreenContent();
  }
}

class _HomeScreenContent extends ConsumerStatefulWidget {
  const _HomeScreenContent();

  @override
  ConsumerState<_HomeScreenContent> createState() => _HomeScreenContentState();
}

class _HomeScreenContentState extends ConsumerState<_HomeScreenContent> {
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _searchController = TextEditingController();
  final GlobalKey _scrollViewKey = GlobalKey();
  final GlobalKey _menuAnchorKey = GlobalKey();
  final GlobalKey _menuEndKey = GlobalKey();
  final Map<String, GlobalKey> _sectionKeys = {};
  final ValueNotifier<bool> _menuEnded = ValueNotifier<bool>(false);

  String _query = '';
  String? _activeCategoryId;
  String? _catalogSignature;
  MenuCatalogViewData? _viewData;
  bool _syncScheduled = false;
  bool _programmaticScroll = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_handleScroll)
      ..dispose();
    _searchController.dispose();
    _menuEnded.dispose();
    super.dispose();
  }

  GlobalKey _headerKey(String categoryId) {
    return _sectionKeys.putIfAbsent(categoryId, GlobalKey.new);
  }

  void _handleScroll() {
    if (!mounted) return;
    _updateMenuEnded();
    if (_programmaticScroll) return;
    _syncActiveCategory();
  }

  void _scheduleSync() {
    if (_syncScheduled) return;
    _syncScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncScheduled = false;
      if (!mounted) return;
      _handleScroll();
    });
  }

  void _updateMenuEnded() {
    final scrollBox =
        _scrollViewKey.currentContext?.findRenderObject() as RenderBox?;
    final menuEndBox =
        _menuEndKey.currentContext?.findRenderObject() as RenderBox?;
    if (scrollBox == null || menuEndBox == null) {
      if (_menuEnded.value) _menuEnded.value = false;
      return;
    }

    final viewportTop = scrollBox.localToGlobal(Offset.zero).dy;
    final menuEndTop = menuEndBox.localToGlobal(Offset.zero).dy;
    final ended = menuEndTop <= viewportTop + 8;
    if (_menuEnded.value != ended) _menuEnded.value = ended;
  }

  void _syncActiveCategory() {
    final viewData = _viewData;
    if (viewData == null || viewData.categories.isEmpty) {
      if (_activeCategoryId != null) {
        setState(() => _activeCategoryId = null);
      }
      return;
    }

    final scrollBox =
        _scrollViewKey.currentContext?.findRenderObject() as RenderBox?;
    if (scrollBox == null) return;

    final threshold =
        scrollBox.localToGlobal(Offset.zero).dy + MenuCategoryRail.height + 8;
    String? next;
    for (final category in viewData.categories) {
      final sectionBox =
          _sectionKeys[category.category.id]?.currentContext?.findRenderObject()
              as RenderBox?;
      if (sectionBox == null) continue;
      if (sectionBox.localToGlobal(Offset.zero).dy <= threshold) {
        next = category.category.id;
      }
    }
    next ??= viewData.categories.first.category.id;

    if (next != _activeCategoryId) {
      setState(() => _activeCategoryId = next);
    }
  }

  void _handleQueryChanged(String value) {
    if (value == _query) return;
    setState(() {
      _query = value;
      _activeCategoryId = null;
    });
    _scheduleSync();
  }

  void _clearSearch() {
    _searchController.clear();
    _handleQueryChanged('');
    FocusScope.of(context).unfocus();
  }

  void _openItem(MenuItemWithModifiers item) {
    showItemQuickView(context, item.item.id, preview: item);
  }

  Future<void> _scrollToMenu() async {
    FocusScope.of(context).unfocus();
    final anchorContext = _menuAnchorKey.currentContext;
    if (anchorContext == null) return;
    await Scrollable.ensureVisible(
      anchorContext,
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      alignment: 0.0,
    );
  }

  Future<void> _scrollToCategory(String categoryId) async {
    FocusScope.of(context).unfocus();
    final headerContext = _sectionKeys[categoryId]?.currentContext;
    final scrollBox =
        _scrollViewKey.currentContext?.findRenderObject() as RenderBox?;
    if (headerContext == null ||
        scrollBox == null ||
        !_scrollController.hasClients) {
      return;
    }

    final headerBox = headerContext.findRenderObject() as RenderBox?;
    if (headerBox == null) return;

    final currentOffset = _scrollController.offset;
    final viewportTop = scrollBox.localToGlobal(Offset.zero).dy;
    final headerTop = headerBox.localToGlobal(Offset.zero).dy;
    final target =
        (currentOffset + headerTop - viewportTop - MenuCategoryRail.height + 2)
            .clamp(0.0, _scrollController.position.maxScrollExtent)
            .toDouble();

    if (_activeCategoryId != categoryId) {
      setState(() => _activeCategoryId = categoryId);
    }

    _programmaticScroll = true;
    await _scrollController.animateTo(
      target,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
    );
    _programmaticScroll = false;
    if (mounted) _updateMenuEnded();
  }

  String _signatureFor(MenuCatalogViewData viewData) {
    final categoryIds = viewData.categories
        .map((category) => category.category.id)
        .join(',');
    final itemIds = viewData.categories
        .expand((category) => category.menuItems)
        .map((item) => item.item.id)
        .join(',');
    return '$_query|${viewData.isSearching}|$categoryIds|$itemIds';
  }

  List<Widget> _buildMenuSlivers(
    BuildContext context,
    MenuCatalogViewData viewData,
  ) {
    final width = MediaQuery.sizeOf(context).width;
    final crossAxisCount = width >= 600 ? 2 : 1;
    final cardHeight = width >= 600 ? 136.0 : 120.0;

    final slivers = <Widget>[
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
          child: MenuSearchField(
            key: _menuAnchorKey,
            controller: _searchController,
            onChanged: _handleQueryChanged,
            onClear: () => FocusScope.of(context).unfocus(),
          ),
        ),
      ),
    ];

    if (!viewData.isSearching && viewData.signatureItems.isNotEmpty) {
      slivers.add(
        SliverToBoxAdapter(
          child: SignatureMenuSection(
            items: viewData.signatureItems,
            onItemTap: _openItem,
          ),
        ),
      );
    }

    if (viewData.categories.isNotEmpty) {
      slivers
        ..add(
          SliverPersistentHeader(
            pinned: true,
            delegate: MenuCategoryRailDelegate(
              categories: viewData.categories,
              activeId: _activeCategoryId,
              onSelected: (categoryId) {
                _scrollToCategory(categoryId);
              },
              hiddenWhen: _menuEnded,
            ),
          ),
        )
        ..add(
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final category in viewData.categories)
                    MenuCategorySection(
                      key: ValueKey('menu-category-${category.category.id}'),
                      category: category,
                      headerKey: _headerKey(category.category.id),
                      cardHeight: cardHeight,
                      crossAxisCount: crossAxisCount,
                      onItemTap: _openItem,
                    ),
                  SizedBox(key: _menuEndKey, height: 0),
                ],
              ),
            ),
          ),
        );
    }

    if (viewData.isSearching && viewData.categories.isEmpty) {
      slivers.add(
        SliverToBoxAdapter(
          child: MenuNoResultsState(query: _query, onClear: _clearSearch),
        ),
      );
    } else if (!viewData.isSearching &&
        viewData.categories.isEmpty &&
        viewData.signatureItems.isEmpty) {
      slivers.add(const SliverToBoxAdapter(child: MenuUnavailableState()));
    }

    return slivers;
  }

  @override
  Widget build(BuildContext context) {
    final categoriesAsync = ref.watch(categoriesWithItemsProvider);
    final storeOpen = ref.watch(storeOpenProvider);
    final menuUpdated = ref.watch(menuUpdatedProvider);
    final promoUpdated = ref.watch(promoUpdatedProvider);
    final categories = categoriesAsync.valueOrNull;
    final viewData = categories == null
        ? null
        : buildMenuCatalogViewData(categories, _query);
    _viewData = viewData;

    if (viewData != null) {
      final signature = _signatureFor(viewData);
      if (signature != _catalogSignature) {
        _catalogSignature = signature;
        _scheduleSync();
      }
    }

    return Scaffold(
      appBar: AppBar(title: const BrandLogo(height: 34)),
      body: CustomScrollView(
        key: _scrollViewKey,
        controller: _scrollController,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          SliverToBoxAdapter(
            child: HomeHero(
              onOrderNow: () {
                _scrollToMenu();
              },
              onExploreMenu: () {
                _scrollToMenu();
              },
            ),
          ),
          if (storeOpen == false)
            const SliverToBoxAdapter(child: StoreClosedBanner()),
          if (menuUpdated)
            const SliverToBoxAdapter(
              child: _UpdateIndicator(
                icon: Icons.update,
                label: 'Menu updated',
                foreground: AppColors.herbText,
                background: AppColors.herbSoft,
              ),
            ),
          if (promoUpdated)
            const SliverToBoxAdapter(
              child: _UpdateIndicator(
                icon: Icons.local_offer,
                label: 'Promos updated',
                foreground: AppColors.emberText,
                background: AppColors.emberSoft,
              ),
            ),
          if (viewData != null)
            ..._buildMenuSlivers(context, viewData)
          else if (categoriesAsync.hasError)
            SliverToBoxAdapter(
              child: MenuErrorState(
                onRetry: () => ref.invalidate(categoriesWithItemsProvider),
              ),
            )
          else
            const SliverToBoxAdapter(child: MenuLoadingState()),
          SliverToBoxAdapter(
            child: HowToOrderSection(
              onBrowseMenu: () {
                _scrollToMenu();
              },
            ),
          ),
          const SliverToBoxAdapter(child: HowItWorksSection()),
          const SliverToBoxAdapter(child: SizedBox(height: 16)),
        ],
      ),
    );
  }
}

class _UpdateIndicator extends StatelessWidget {
  const _UpdateIndicator({
    required this.icon,
    required this.label,
    required this.foreground,
    required this.background,
  });

  final IconData icon;
  final String label;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: foreground.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: foreground),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: foreground,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
