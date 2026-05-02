import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../providers/admin_order_providers.dart';
import '../widgets/daily_date_picker.dart';
import '../widgets/flat_order_list.dart';
import '../widgets/order_stats_card.dart';
import '../widgets/total_sales_card.dart';

class AdminOrdersScreen extends ConsumerStatefulWidget {
  const AdminOrdersScreen({super.key});

  @override
  ConsumerState<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends ConsumerState<AdminOrdersScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  RealtimeChannel? _realtimeChannel;

  static const _tabs = [
    (label: 'Preparing', tab: OrderTab.preparing),
    (label: 'Ready', tab: OrderTab.ready),
    (label: 'Upcoming', tab: OrderTab.upcoming),
    (label: 'History', tab: OrderTab.history),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _tabs.length, vsync: this);
    _tabController.addListener(_onTabChanged);

    // Subscribe to realtime new-order notifications
    final repo = ref.read(merchantOrderRepositoryProvider);
    _realtimeChannel = repo.subscribeToNewOrders(
      onNewOrder: () {
        if (!mounted) return;
        _invalidateCurrentTab();
      },
    );
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    if (_realtimeChannel != null) {
      _realtimeChannel!.unsubscribe();
      _realtimeChannel = null;
    }
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) {
      _invalidateCurrentTab();
    }
  }

  void _invalidateCurrentTab() {
    final tab = _tabs[_tabController.index].tab;
    ref.invalidate(adminOrdersProvider(tab));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Orders'),
        actions: [
          IconButton(
            icon: const Icon(Icons.kitchen),
            tooltip: 'Kitchen Display',
            onPressed: () => context.push(AppRoutes.kitchen),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: _tabs.map((t) => Tab(text: t.label)).toList(),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: _tabs.map((t) => _OrdersTabView(tab: t.tab)).toList(),
      ),
    );
  }
}

class _OrdersTabView extends ConsumerWidget {
  const _OrdersTabView({required this.tab});

  final OrderTab tab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(adminOrdersProvider(tab));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(adminOrdersProvider(tab));
      },
      child: CustomScrollView(
        slivers: [
          if (tab == OrderTab.history) ...[
            const SliverToBoxAdapter(child: DailyDatePicker()),
            const SliverToBoxAdapter(child: TotalSalesCard()),
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.only(top: 8, bottom: 4),
                child: OrderStatsCard(),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 8)),
          ],
          ordersAsync.when(
            data: (orders) => FlatOrderList(orders: orders),
            loading: () => const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (err, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(err.toString()),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () =>
                          ref.invalidate(adminOrdersProvider(tab)),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
