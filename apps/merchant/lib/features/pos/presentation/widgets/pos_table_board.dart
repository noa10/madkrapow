import 'dart:async';

import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../models/pos_models.dart';
import '../../models/pos_tables.dart';
import 'pos_table_card.dart';
import 'pos_ui.dart';

/// Live floor plan: occupancy, open orders, unpaid balances and actions.
class PosTableBoard extends StatefulWidget {
  const PosTableBoard({
    super.key,
    required this.summaries,
    required this.unpaidTakeaway,
    required this.busyId,
    required this.refreshing,
    required this.onNewOrder,
    required this.onSettle,
    required this.onVoid,
    required this.onCloseTable,
    required this.onRefresh,
  });

  final List<TableSummary> summaries;
  final List<PosOpenOrder> unpaidTakeaway;
  final String? busyId;
  final bool refreshing;
  final ValueChanged<TableSummary> onNewOrder;
  final ValueChanged<PosSettleTarget> onSettle;
  final ValueChanged<PosOpenOrder> onVoid;
  final ValueChanged<TableSummary> onCloseTable;
  final Future<void> Function() onRefresh;

  @override
  State<PosTableBoard> createState() => _PosTableBoardState();
}

class _PosTableBoardState extends State<PosTableBoard> {
  Timer? _ticker;
  DateTime _now = DateTime.now();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Branches of the tab shell stay mounted while hidden; TickerMode lets the
    // minute tick stop instead of rebuilding an invisible board all shift.
    final visible = TickerMode.valuesOf(context).enabled;
    if (visible && _ticker == null) {
      _now = DateTime.now();
      _ticker = Timer.periodic(const Duration(minutes: 1), (_) {
        if (mounted) setState(() => _now = DateTime.now());
      });
    } else if (!visible && _ticker != null) {
      _ticker!.cancel();
      _ticker = null;
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final occupied = widget.summaries
        .where((summary) => summary.isOccupied)
        .length;
    // Count bills, not tickets: two rounds at one table are one collect.
    final unpaidTableCount = widget.summaries
        .where((summary) => summary.hasUnpaid)
        .length;
    final toCollect = unpaidTableCount + widget.unpaidTakeaway.length;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.chair_outlined,
                size: 16,
                color: AppColors.muted,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Wrap(
                  spacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      '$occupied occupied',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppColors.foreground,
                      ),
                    ),
                    Text(
                      '· ${widget.summaries.length} active '
                      'table${widget.summaries.length == 1 ? '' : 's'}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.muted,
                      ),
                    ),
                    if (toCollect > 0)
                      PosStatePill(
                        label: '$toCollect to collect',
                        background: AppColors.warning,
                        foreground: AppColors.background,
                      ),
                  ],
                ),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: widget.refreshing
                    ? null
                    : () => widget.onRefresh(),
                icon: widget.refreshing
                    ? const PosBusy(size: 14)
                    : const Icon(Icons.refresh, size: 15),
                label: const Text('Refresh'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.muted,
                  textStyle: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (widget.unpaidTakeaway.isNotEmpty) ...[
            _UnpaidTakeawayStrip(
              orders: widget.unpaidTakeaway,
              now: _now,
              busyId: widget.busyId,
              onSettle: widget.onSettle,
              onVoid: widget.onVoid,
            ),
            const SizedBox(height: 10),
          ],
          if (widget.summaries.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
              decoration: BoxDecoration(
                borderRadius: AppRadii.lgRadius,
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.chair_outlined,
                    size: 34,
                    color: AppColors.muted,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'No active tables',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Add tables under Manage tables to start taking dine-in '
                    'orders.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ),
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                final width = constraints.maxWidth;
                final columns = width >= 1100
                    ? 4
                    : width >= 780
                    ? 3
                    : width >= 520
                    ? 2
                    : 1;
                const spacing = 10.0;
                final cardWidth =
                    (width - spacing * (columns - 1)) / columns;
                return Wrap(
                  spacing: spacing,
                  runSpacing: spacing,
                  children: [
                    for (final summary in widget.summaries)
                      SizedBox(
                        width: cardWidth,
                        child: PosTableCard(
                          summary: summary,
                          now: _now,
                          busy: widget.busyId == summary.table.id,
                          onNewOrder: () => widget.onNewOrder(summary),
                          onSettle: widget.onSettle,
                          onVoid: widget.onVoid,
                          onCloseTable: () => widget.onCloseTable(summary),
                        ),
                      ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}

class _UnpaidTakeawayStrip extends StatelessWidget {
  const _UnpaidTakeawayStrip({
    required this.orders,
    required this.now,
    required this.busyId,
    required this.onSettle,
    required this.onVoid,
  });

  final List<PosOpenOrder> orders;
  final DateTime now;
  final String? busyId;
  final ValueChanged<PosSettleTarget> onSettle;
  final ValueChanged<PosOpenOrder> onVoid;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF1F1A10),
        borderRadius: AppRadii.lgRadius,
        border: Border.all(
          color: AppColors.warning.withValues(alpha: 0.5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.shopping_bag_outlined,
                size: 16,
                color: AppColors.sesame,
              ),
              const SizedBox(width: 6),
              Text(
                'Unpaid take-away',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.foreground,
                ),
              ),
              const SizedBox(width: 6),
              PosStatePill(
                label: '${orders.length}',
                background: AppColors.warning,
                foreground: AppColors.background,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Collect before hand-off — the kitchen is already preparing '
                  'these.',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 10,
                    color: AppColors.muted,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth;
              final columns = width >= 900
                  ? 3
                  : width >= 560
                  ? 2
                  : 1;
              const spacing = 6.0;
              final rowWidth = (width - spacing * (columns - 1)) / columns;
              return Wrap(
                spacing: spacing,
                runSpacing: spacing,
                children: [
                  for (final order in orders)
                    SizedBox(
                      width: rowWidth,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 6,
                        ),
                        decoration: const BoxDecoration(
                          color: AppColors.surface2,
                          borderRadius: AppRadii.smRadius,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          order.code,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.foreground,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Flexible(
                                        child: Text(
                                          order.customerName ?? 'Walk-in',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: AppColors.muted,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  Text(
                                    '${formatPrice(order.totalCents)} · '
                                    '${posAgeMinutes(order.createdAt, now)} min',
                                    style: const TextStyle(
                                      fontSize: 10,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            FilledButton(
                              onPressed: busyId == order.id
                                  ? null
                                  : () => onSettle(
                                      buildOrderSettleTarget(order),
                                    ),
                              style: FilledButton.styleFrom(
                                minimumSize: const Size(0, 28),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                ),
                                backgroundColor: AppColors.accent,
                                foregroundColor: AppColors.onAccent,
                                textStyle: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              child: const Text('Collect'),
                            ),
                            IconButton(
                              onPressed: busyId == order.id
                                  ? null
                                  : () => onVoid(order),
                              icon: const Icon(Icons.block, size: 15),
                              tooltip: 'Void this unpaid order',
                              color: AppColors.muted,
                              visualDensity: VisualDensity.compact,
                              constraints: const BoxConstraints(
                                minWidth: 30,
                                minHeight: 30,
                              ),
                              padding: EdgeInsets.zero,
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
