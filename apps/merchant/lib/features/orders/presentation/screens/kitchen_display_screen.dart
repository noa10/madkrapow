import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../printing/providers/printer_providers.dart';
import '../../providers/admin_order_providers.dart';
import '../../providers/kitchen_providers.dart';
import '../../../../generated/tables/orders.dart';
import '../../../../core/utils/order_fields.dart';
import '../widgets/kitchen_order_card.dart';

/// The statuses the kitchen itself drives: start cooking a paid ticket, then
/// mark it ready to leave the pass. Matches the web kitchen's two actions.
const _kitchenTransitions = {'paid': 'preparing', 'preparing': 'ready'};
const _kitchenActionLabels = {
  'paid': 'Start Preparing',
  'preparing': 'Mark Ready',
};

class KitchenDisplayScreen extends ConsumerStatefulWidget {
  const KitchenDisplayScreen({super.key});

  @override
  ConsumerState<KitchenDisplayScreen> createState() =>
      _KitchenDisplayScreenState();
}

class _KitchenDisplayScreenState extends ConsumerState<KitchenDisplayScreen> {
  RealtimeChannel? _realtimeChannel;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _subscribeToNewOrders();
    // Kitchen RLS hides completed rows, so their update events may be missed.
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      ref.invalidate(kitchenOrderCardsProvider);
    });

    // Anything that arrived while the app was closed or asleep never fired an
    // event, so claim once the first frame is up. The server only hands out
    // jobs from the last half hour, and only once across devices.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      unawaited(ref.read(autoPrintServiceProvider).printPendingJobs());
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    if (_realtimeChannel != null) {
      _realtimeChannel!.unsubscribe();
      _realtimeChannel = null;
    }
    super.dispose();
  }

  void _subscribeToNewOrders() {
    final repo = ref.read(merchantOrderRepositoryProvider);
    _realtimeChannel = repo.subscribeToNewOrders(
      onNewOrder: () {
        if (!mounted) return;
        ref.invalidate(kitchenOrderCardsProvider);
        unawaited(ref.read(autoPrintServiceProvider).printPendingJobs());
      },
    );
  }

  /// A ready counter take-away has no provider to close it, so the pass
  /// completes it; every other ticket follows the two kitchen steps.
  String? _nextStatusFor(OrdersRow order) {
    final mapped = _kitchenTransitions[order.status];
    if (mapped != null) return mapped;
    if (order.status == 'ready' && order.isCounterPickup) return 'delivered';
    return null;
  }

  String _actionLabelFor(OrdersRow order) {
    if (order.status == 'ready' && order.isCounterPickup) {
      return 'Complete Order';
    }
    return _kitchenActionLabels[order.status] ?? 'Mark Ready';
  }

  Future<void> _advanceStatus(OrdersRow order) async {
    final nextStatus = _nextStatusFor(order);
    if (nextStatus == null) return;

    try {
      final repo = ref.read(merchantOrderRepositoryProvider);
      final container = ProviderScope.containerOf(context, listen: false);
      await repo.updateOrderStatus(order.id, nextStatus);
      container.invalidate(kitchenOrderCardsProvider);
      container.invalidate(adminOrdersProvider);
      container.invalidate(adminOrderDetailProvider(order.id));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(kitchenOrderCardsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Kitchen Display')),
      body: ordersAsync.when(
        data: (orders) {
          if (orders.isEmpty) {
            return _EmptyState();
          }

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(kitchenOrderCardsProvider);
            },
            child: LayoutBuilder(
              builder: (context, constraints) =>
                  _ticketBoard(context, orders, constraints.maxWidth),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => _ErrorState(
          message: err.toString(),
          onRetry: () => ref.invalidate(kitchenOrderCardsProvider),
        ),
      ),
    );
  }

  /// Lays tickets out in 1/2/3 columns, each card at its natural height so no
  /// item or addon is ever hidden behind an inner scroll.
  Widget _ticketBoard(
    BuildContext context,
    List<KitchenOrderCardData> orders,
    double maxWidth,
  ) {
    const horizontalPadding = 16.0;
    const spacing = 16.0;

    final crossAxisCount = maxWidth < 600
        ? 1
        : maxWidth < 900
        ? 2
        : 3;

    final cardWidth =
        (maxWidth -
            (horizontalPadding * 2) -
            (spacing * (crossAxisCount - 1))) /
        crossAxisCount;

    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.only(top: 8),
          sliver: SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: horizontalPadding,
                vertical: 8,
              ),
              child: Text(
                '${orders.length} active order${orders.length != 1 ? 's' : ''}',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            horizontalPadding,
            0,
            horizontalPadding,
            16,
          ),
          sliver: SliverToBoxAdapter(
            child: Wrap(
              spacing: spacing,
              runSpacing: spacing,
              children: [
                for (final ticket in orders)
                  SizedBox(
                    width: cardWidth,
                    child: KitchenOrderCard(
                      order: ticket.order,
                      items: ticket.items,
                      actionLabel: _actionLabelFor(ticket.order),
                      onMarkReady: _nextStatusFor(ticket.order) == null
                          ? null
                          : () => _advanceStatus(ticket.order),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Card(
        margin: const EdgeInsets.all(32),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 64, horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.access_time,
                  size: 40,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'No Active Orders',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'New orders will appear here automatically',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Card(
        margin: const EdgeInsets.all(32),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 48,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      ),
    );
  }
}
