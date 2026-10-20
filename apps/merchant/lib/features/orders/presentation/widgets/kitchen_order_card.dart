import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/utils/order_code.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../core/utils/time_formatter.dart';
import '../../../../generated/tables/orders.dart';
import '../../data/merchant_order_repository.dart';

/// How stale an active ticket is, used to tint the elapsed-time label.
enum TicketAge { fresh, aging, overdue }

/// Minutes on the pass before a ticket is called aging, then overdue.
const agingAfterMinutes = 15;
const overdueAfterMinutes = 25;

/// Buckets [createdAt] by how long it has been on the pass at [now].
TicketAge ticketAge(DateTime createdAt, DateTime now) {
  final minutes = now.difference(createdAt).inMinutes;
  if (minutes >= overdueAfterMinutes) return TicketAge.overdue;
  if (minutes >= agingAfterMinutes) return TicketAge.aging;
  return TicketAge.fresh;
}

/// Colours for the order-note callout. The product is dark-only, so the note
/// uses the shared warning palette rather than a light-mode branch.
typedef _NotePalette = ({Color background, Color border, Color foreground});

const _NotePalette _notePalette = (
  background: AppColors.sesameSoft,
  border: Color(0x66FBBF24),
  foreground: AppColors.sesame,
);

/// A kitchen ticket: what to cook, for whom, and how long it has been waiting.
///
/// Prices are deliberately absent — the kitchen reads quantities, items, addons
/// and notes, not money. The order total is kept only as a sanity check.
class KitchenOrderCard extends StatelessWidget {
  const KitchenOrderCard({
    super.key,
    required this.order,
    required this.items,
    this.onMarkReady,
    this.now,
  });

  final OrdersRow order;
  final List<OrderItemWithModifiers> items;

  /// Renders a "Mark Ready" action when non-null.
  final VoidCallback? onMarkReady;

  /// Clock used for the elapsed-time label and its tint. Defaults to now.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = AppStatusColors.of(order.status).foreground;
    final currentTime = now ?? DateTime.now();
    final note = order.notes?.trim();

    return Card(
      elevation: 0,
      shape: const RoundedRectangleBorder(borderRadius: AppRadii.lgRadius),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          _header(context, statusColor, currentTime),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _customer(context),
                if (order.deliveryType == 'delivery') ...[
                  const SizedBox(height: 12),
                  _address(context),
                ],
                const SizedBox(height: 12),
                Divider(height: 1, color: theme.colorScheme.outlineVariant),
                const SizedBox(height: 12),
                _items(context),
                if (note != null && note.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _orderNote(context, note),
                ],
                if (order.includeCutlery) ...[
                  const SizedBox(height: 12),
                  _cutlery(context),
                ],
                const SizedBox(height: 12),
                _total(context),
              ],
            ),
          ),
          if (onMarkReady != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: onMarkReady,
                  icon: const Icon(Icons.inventory_2_outlined, size: 24),
                  label: const Text(
                    'Mark Ready',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(shape: AppRadii.pillBorder),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _header(
    BuildContext context,
    Color statusColor,
    DateTime currentTime,
  ) {
    final theme = Theme.of(context);

    return Container(
      color: statusColor.withValues(alpha: 0.12),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  getOrderDisplayCode(order),
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              StatusPill(status: order.status),
            ],
          ),
          const SizedBox(height: 6),
          // Wraps rather than overflows: at the narrowest column width, or with
          // a large text scale, the elapsed label drops to its own line instead
          // of being clipped.
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.access_time,
                    size: 16,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    DateFormat('h:mm a').format(order.createdAt),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              Text(
                formatRelativeTimeAt(order.createdAt, currentTime),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: _ageColor(context, order.createdAt, currentTime),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _customer(BuildContext context) {
    final theme = Theme.of(context);
    final phone = order.customerPhone;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.person_outline, size: 18, color: theme.colorScheme.primary),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                order.customerName ?? 'Guest Customer',
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (phone != null && phone.isNotEmpty)
                Text(
                  phone,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _address(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.location_on_outlined,
          size: 18,
          color: theme.colorScheme.primary,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Delivery Address',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                _addressLine(order.deliveryAddressJson),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _items(BuildContext context) {
    final theme = Theme.of(context);

    if (items.isEmpty) {
      return Text(
        'No items recorded',
        style: theme.textTheme.bodyMedium?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
          fontStyle: FontStyle.italic,
        ),
      );
    }

    final dishCount = items.fold<int>(
      0,
      (sum, entry) => sum + entry.item.quantity,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ITEMS ($dishCount)',
          style: theme.textTheme.labelMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _item(context, items[i]),
        ],
      ],
    );
  }

  Widget _item(BuildContext context, OrderItemWithModifiers entry) {
    final theme = Theme.of(context);
    final item = entry.item;
    final note = item.notes?.trim();

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            '${item.quantity}x',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: theme.colorScheme.onPrimaryContainer,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.menuItemName,
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              for (final modifier in entry.modifiers)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.add_circle_outline,
                        size: 14,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          modifier.modifierName,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (note != null && note.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.notes_outlined,
                        size: 14,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Note: $note',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontStyle: FontStyle.italic,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _orderNote(BuildContext context, String note) {
    final theme = Theme.of(context);
    const palette = _notePalette;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.background,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.sticky_note_2_outlined,
            size: 18,
            color: palette.foreground,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ORDER NOTE',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                    color: palette.foreground,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  note,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: palette.foreground,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _cutlery(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.flatware, size: 18, color: theme.colorScheme.primary),
        const SizedBox(width: 6),
        Text(
          'Cutlery requested',
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _total(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        // total_cents already includes delivery_fee_cents — never add it again.
        formatPrice(order.totalCents),
        textAlign: TextAlign.center,
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.bold,
          color: AppColors.emberText,
        ),
      ),
    );
  }
}

Color _ageColor(BuildContext context, DateTime createdAt, DateTime now) {
  final theme = Theme.of(context);

  return switch (ticketAge(createdAt, now)) {
    TicketAge.fresh => theme.colorScheme.onSurfaceVariant,
    TicketAge.aging => AppColors.sesame,
    TicketAge.overdue => AppColors.dangerText,
  };
}

String _addressLine(Map<String, dynamic>? json) {
  if (json == null) return 'No address';

  final parts = [
    json['address_line1'],
    json['address_line2'],
    json['city'],
    json['state'],
  ].where((part) => part != null && part.toString().isNotEmpty).toList();

  return parts.isEmpty ? 'No address' : parts.join(', ');
}
