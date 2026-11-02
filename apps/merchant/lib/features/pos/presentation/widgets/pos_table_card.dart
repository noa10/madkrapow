import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../models/pos_models.dart';
import '../../models/pos_tables.dart';
import 'pos_ui.dart';

/// One table on the live floor board: occupancy, open tickets, unpaid balance
/// and the actions a cashier can take without leaving the board.
class PosTableCard extends StatefulWidget {
  const PosTableCard({
    super.key,
    required this.summary,
    required this.now,
    required this.busy,
    required this.onNewOrder,
    required this.onSettle,
    required this.onVoid,
    required this.onCloseTable,
  });

  final TableSummary summary;
  final DateTime now;
  final bool busy;
  final VoidCallback onNewOrder;
  final ValueChanged<PosSettleTarget> onSettle;
  final ValueChanged<PosOpenOrder> onVoid;
  final VoidCallback onCloseTable;

  @override
  State<PosTableCard> createState() => _PosTableCardState();
}

class _PosTableCardState extends State<PosTableCard> {
  final _expandedOrderIds = <String>{};

  void _toggleOrder(String orderId) {
    setState(() {
      if (!_expandedOrderIds.add(orderId)) {
        _expandedOrderIds.remove(orderId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final summary = widget.summary;
    final table = summary.table;
    final collectTarget = buildTableSettleTarget(summary);
    final closeReason = closeBlockedMessage(summary.closeBlockReason);

    final borderColor = summary.hasUnpaid
        ? AppColors.warning.withValues(alpha: 0.5)
        : summary.isOccupied
        ? AppColors.accent.withValues(alpha: 0.4)
        : AppColors.border;
    final cardColor = summary.hasUnpaid
        ? Color.alphaBlend(
            AppColors.warning.withValues(alpha: 0.06),
            AppColors.surface,
          )
        : summary.isOccupied
        ? Color.alphaBlend(
            AppColors.accent.withValues(alpha: 0.05),
            AppColors.surface,
          )
        : AppColors.surface;

    return AppCard(
      padding: const EdgeInsets.all(12),
      color: cardColor,
      borderColor: borderColor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      table.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      table.detail,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              PosStatePill(
                label: summary.hasUnpaid
                    ? 'Unpaid'
                    : summary.isOccupied
                    ? 'Occupied'
                    : 'Free',
                background: summary.hasUnpaid
                    ? AppColors.warning
                    : summary.isOccupied
                    ? AppColors.accent
                    : AppColors.surface3,
                foreground: summary.hasUnpaid
                    ? AppColors.background
                    : summary.isOccupied
                    ? AppColors.onAccent
                    : AppColors.muted,
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (summary.isOccupied) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${summary.openOrderCount} order'
                    '${summary.openOrderCount == 1 ? '' : 's'}'
                    '${summary.pax != null ? ' · ${summary.pax} pax' : ''}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11,
                      color: AppColors.muted,
                    ),
                  ),
                ),
                Text(
                  formatPrice(summary.totalCents),
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AppColors.foreground,
                  ),
                ),
              ],
            ),
            if (summary.hasUnverifiedDinerPayment) ...[
              const SizedBox(height: 8),
              PosWarningBanner(
                summary.dinerClaimedOrderCount == 1
                    ? 'Diner claimed payment — verify the bank transfer '
                          'before closing.'
                    : '${summary.dinerClaimedOrderCount} diner-claimed '
                          'payments — verify the bank transfers before closing.',
              ),
            ],
            if (collectTarget != null) ...[
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: widget.busy
                    ? null
                    : () => widget.onSettle(collectTarget),
                icon: widget.busy
                    ? const PosBusy(size: 14)
                    : const Icon(Icons.payments_outlined, size: 15),
                label: Text(
                  'Collect ${formatPrice(collectTarget.amountCents)}'
                  '${collectTarget.orderCount > 1 ? ' · ${collectTarget.orderCount} orders' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(36),
                  backgroundColor: AppColors.accent,
                  foregroundColor: AppColors.onAccent,
                ),
              ),
            ],
            const SizedBox(height: 8),
            for (final order in summary.orders)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: _OrderRow(
                  order: order,
                  now: widget.now,
                  expanded: _expandedOrderIds.contains(order.id),
                  busy: widget.busy,
                  onToggle: () => _toggleOrder(order.id),
                  onVoid: () => widget.onVoid(order),
                ),
              ),
          ] else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(
                'Table is free.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.muted,
                ),
              ),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: widget.busy ? null : widget.onNewOrder,
                  icon: const Icon(Icons.add, size: 15),
                  label: const Text('New order'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(36),
                    textStyle: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Tooltip(
                  message: closeReason ?? 'Close the table',
                  child: FilledButton.icon(
                    onPressed: widget.busy || !summary.canClose
                        ? null
                        : widget.onCloseTable,
                    icon: widget.busy
                        ? const PosBusy(size: 14)
                        : const Icon(Icons.restaurant, size: 15),
                    label: const Text('Close table'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(36),
                      backgroundColor: summary.canClose
                          ? AppColors.accent
                          : AppColors.surface3,
                      foregroundColor: summary.canClose
                          ? AppColors.onAccent
                          : AppColors.muted,
                      disabledBackgroundColor: AppColors.surface3,
                      disabledForegroundColor: AppColors.muted,
                      textStyle: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({
    required this.order,
    required this.now,
    required this.expanded,
    required this.busy,
    required this.onToggle,
    required this.onVoid,
  });

  final PosOpenOrder order;
  final DateTime now;
  final bool expanded;
  final bool busy;
  final VoidCallback onToggle;
  final VoidCallback onVoid;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: const BoxDecoration(
        color: AppColors.surface2,
        borderRadius: AppRadii.smRadius,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
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
                        const SizedBox(width: 6),
                        if (order.isPending)
                          const PosStatePill(
                            label: 'Unpaid',
                            background: AppColors.sesameSoft,
                            foreground: AppColors.sesame,
                          )
                        else
                          StatusPill(status: order.status, dense: true),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${formatPrice(order.totalCents)} · '
                      '${posAgeMinutes(order.createdAt, now)} min',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 10,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: onToggle,
                icon: Icon(
                  expanded ? Icons.expand_less : Icons.expand_more,
                  size: 18,
                ),
                tooltip: expanded ? 'Hide items' : 'View items',
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                padding: EdgeInsets.zero,
              ),
              if (order.isPending)
                IconButton(
                  onPressed: busy ? null : onVoid,
                  icon: const Icon(Icons.block, size: 16),
                  color: AppColors.muted,
                  tooltip: 'Void this unpaid order',
                  visualDensity: VisualDensity.compact,
                  constraints: const BoxConstraints(
                    minWidth: 32,
                    minHeight: 32,
                  ),
                  padding: EdgeInsets.zero,
                ),
            ],
          ),
          if (expanded) _OrderItems(items: order.items),
        ],
      ),
    );
  }
}

class _OrderItems extends StatelessWidget {
  const _OrderItems({required this.items});

  final List<PosOrderItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(
          'No item detail recorded.',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(fontSize: 10, color: AppColors.muted),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.only(top: 6),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          '${item.quantity}× ${item.name}',
                          style: const TextStyle(
                            fontSize: 11,
                            height: 1.35,
                            color: AppColors.foreground,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        formatPrice(item.lineTotalCents),
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ),
                  for (final modifier in item.modifiers)
                    Padding(
                      padding: const EdgeInsets.only(left: 14),
                      child: Text(
                        '+ ${modifier.name}'
                        '${modifier.priceDeltaCents > 0 ? ' (+${formatPrice(modifier.priceDeltaCents)})' : ''}',
                        style: const TextStyle(
                          fontSize: 10,
                          height: 1.35,
                          color: AppColors.sesame,
                        ),
                      ),
                    ),
                  if (item.notes != null && item.notes!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 14),
                      child: Text(
                        '“${item.notes}”',
                        style: const TextStyle(
                          fontSize: 10,
                          height: 1.35,
                          fontStyle: FontStyle.italic,
                          color: AppColors.muted,
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
