import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../models/pos_cart.dart';
import '../../models/pos_models.dart';
import '../../models/pos_tables.dart';
import '../../providers/pos_providers.dart';
import 'pos_ui.dart';

/// The "current sale" panel for dine-in and take-away POS orders.
///
/// Wide layouts dock this on the right; narrow layouts open it as a bottom
/// sheet from the review bar. Both share one Riverpod sale state.
class PosSalePanel extends ConsumerWidget {
  const PosSalePanel({
    super.key,
    required this.tables,
    required this.summaries,
    required this.customerNameController,
    required this.onCollectUnpaid,
    required this.onSubmit,
    required this.onClear,
  });

  final List<RestaurantTable> tables;
  final Map<String, TableSummary> summaries;
  final TextEditingController customerNameController;
  final ValueChanged<PosSettleTarget> onCollectUnpaid;
  final VoidCallback onSubmit;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sale = ref.watch(posSaleProvider);
    final notifier = ref.read(posSaleProvider.notifier);

    final selectedTable = sale.selectedTableId == null
        ? null
        : tables.where((table) => table.id == sale.selectedTableId).firstOrNull;
    final pendingTarget = selectedTable == null
        ? null
        : buildTableSettleTarget(
            summaries[selectedTable.id] ??
                summarizeTable(selectedTable, const []),
          );

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxHeight < 360;
        return Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                children: [
                  _OrderTypeToggle(
                    value: sale.orderType,
                    onChanged: notifier.setOrderType,
                  ),
                  const SizedBox(height: 12),
                  if (sale.orderType == PosOrderType.dineIn)
                    _DineInControls(
                      tables: tables,
                      summaries: summaries,
                      selectedTable: selectedTable,
                      selectedTableId: sale.selectedTableId,
                      onSelectTable: notifier.selectTable,
                      pax: sale.pax,
                      onPaxChange: notifier.setPax,
                      pendingTarget: pendingTarget,
                      onCollectUnpaid: onCollectUnpaid,
                    )
                  else
                    _TakeAwayNameField(
                      controller: customerNameController,
                      onChanged: notifier.setCustomerName,
                    ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Icon(
                        Icons.shopping_bag_outlined,
                        size: 16,
                        color: AppColors.muted,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Current sale',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Spacer(),
                      if (sale.cart.isNotEmpty)
                        TextButton(
                          onPressed: onClear,
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.muted,
                            visualDensity: VisualDensity.compact,
                          ),
                          child: const Text(
                            'Clear',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  if (sale.cart.isEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      decoration: BoxDecoration(
                        borderRadius: AppRadii.mdRadius,
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text(
                        'Tap dishes to add them.',
                        textAlign: TextAlign.center,
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
                      ),
                    )
                  else
                    for (final line in sale.cart)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: _CartLineTile(
                          line: line,
                          onChangeQuantity: (delta) =>
                              notifier.changeQuantity(line.key, delta),
                          onRemove: () => notifier.removeLine(line.key),
                        ),
                      ),
                  if (compact)
                    _PaymentSection(
                      sale: sale,
                      onPaymentMethodChange: notifier.setPaymentMethod,
                      onSubmit: onSubmit,
                    ),
                ],
              ),
            ),
            if (!compact)
              _PaymentSection(
                sale: sale,
                onPaymentMethodChange: notifier.setPaymentMethod,
                onSubmit: onSubmit,
              ),
          ],
        );
      },
    );
  }
}

class _OrderTypeToggle extends StatelessWidget {
  const _OrderTypeToggle({required this.value, required this.onChanged});

  final PosOrderType value;
  final ValueChanged<PosOrderType> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final type in PosOrderType.values) ...[
          Expanded(
            child: _ToggleButton(
              icon: type == PosOrderType.dineIn
                  ? Icons.restaurant
                  : Icons.shopping_bag_outlined,
              label: type.label,
              active: value == type,
              onTap: () => onChanged(type),
            ),
          ),
          if (type != PosOrderType.values.last) const SizedBox(width: 8),
        ],
      ],
    );
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      child: Material(
        color: active ? AppColors.accent : AppColors.surface2,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.mdRadius,
          side: BorderSide(color: active ? AppColors.accent : AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 16,
                  color: active ? AppColors.onAccent : AppColors.muted,
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: active ? AppColors.onAccent : AppColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DineInControls extends StatelessWidget {
  const _DineInControls({
    required this.tables,
    required this.summaries,
    required this.selectedTable,
    required this.selectedTableId,
    required this.onSelectTable,
    required this.pax,
    required this.onPaxChange,
    required this.pendingTarget,
    required this.onCollectUnpaid,
  });

  final List<RestaurantTable> tables;
  final Map<String, TableSummary> summaries;
  final RestaurantTable? selectedTable;
  final String? selectedTableId;
  final ValueChanged<String?> onSelectTable;
  final int pax;
  final ValueChanged<int> onPaxChange;
  final PosSettleTarget? pendingTarget;
  final ValueChanged<PosSettleTarget> onCollectUnpaid;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const PosLabel('Table'),
            const Spacer(),
            if (selectedTable != null)
              Text(
                [
                  selectedTable!.label,
                  if (selectedTable!.zone != null &&
                      selectedTable!.zone!.isNotEmpty)
                    selectedTable!.zone!,
                ].join(' · '),
                style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.foreground,
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        if (tables.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              borderRadius: AppRadii.mdRadius,
              border: Border.all(color: AppColors.border),
            ),
            child: Text(
              'No active tables yet. Add them under Manage tables.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.muted,
              ),
            ),
          )
        else
          SizedBox(
            height: 156,
            child: GridView.builder(
              itemCount: tables.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                mainAxisExtent: 50,
                crossAxisSpacing: 6,
                mainAxisSpacing: 6,
              ),
              itemBuilder: (context, index) {
                final table = tables[index];
                final occupied = summaries[table.id]?.isOccupied ?? false;
                final selected = selectedTableId == table.id;
                return _TableChip(
                  table: table,
                  occupied: occupied,
                  selected: selected,
                  onTap: () => onSelectTable(table.id),
                );
              },
            ),
          ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.surface2,
            borderRadius: AppRadii.mdRadius,
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              const PosLabel('Pax'),
              const Spacer(),
              IconButton(
                onPressed: pax > minPax ? () => onPaxChange(pax - 1) : null,
                icon: const Icon(Icons.remove, size: 16),
                tooltip: 'Fewer diners',
                visualDensity: VisualDensity.compact,
              ),
              SizedBox(
                width: 28,
                child: Text(
                  '$pax',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              IconButton(
                onPressed: pax < maxPax ? () => onPaxChange(pax + 1) : null,
                icon: const Icon(Icons.add, size: 16),
                tooltip: 'More diners',
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
        ),
        if (pendingTarget != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.warningSoft,
              borderRadius: AppRadii.mdRadius,
              border: Border.all(
                color: AppColors.warning.withValues(alpha: 0.35),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const PosLabel(
                        'Unpaid at this table',
                        color: AppColors.sesame,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${pendingTarget!.context} · '
                        '${formatPrice(pendingTarget!.amountCents)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 11,
                          color: AppColors.sesame,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => onCollectUnpaid(pendingTarget!),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.sesame,
                    side: BorderSide(
                      color: AppColors.warning.withValues(alpha: 0.45),
                    ),
                    visualDensity: VisualDensity.compact,
                    minimumSize: const Size(0, 32),
                  ),
                  child: const Text(
                    'Collect',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _TableChip extends StatelessWidget {
  const _TableChip({
    required this.table,
    required this.occupied,
    required this.selected,
    required this.onTap,
  });

  final RestaurantTable table;
  final bool occupied;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.accentSoft : AppColors.surface2,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.mdRadius,
        side: BorderSide(color: selected ? AppColors.accent : AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(
          children: [
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      table.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: selected
                            ? AppColors.foreground
                            : AppColors.muted,
                      ),
                    ),
                    Text(
                      occupied ? 'Occupied' : '${table.seats} seats',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 9,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (occupied)
              const Positioned(
                top: 4,
                right: 4,
                child: SizedBox(
                  width: 6,
                  height: 6,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.sesame,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TakeAwayNameField extends StatelessWidget {
  const _TakeAwayNameField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const PosLabel('Customer name'),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          onChanged: onChanged,
          maxLength: 120,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            hintText: 'Name for the order',
            counterText: '',
            isDense: true,
            filled: true,
            fillColor: AppColors.surface2,
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: AppRadii.mdRadius,
              borderSide: BorderSide(color: AppColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: AppRadii.mdRadius,
              borderSide: BorderSide(color: AppColors.border),
            ),
          ),
        ),
      ],
    );
  }
}

class _CartLineTile extends StatelessWidget {
  const _CartLineTile({
    required this.line,
    required this.onChangeQuantity,
    required this.onRemove,
  });

  final PosCartLine line;
  final ValueChanged<int> onChangeQuantity;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: const BoxDecoration(
        color: AppColors.surface2,
        borderRadius: AppRadii.smRadius,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.item.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.foreground,
                  ),
                ),
                for (final modifier in line.modifiers)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '+ ${modifier.name}'
                      '${modifier.priceDeltaCents > 0 ? ' (+${formatPrice(modifier.priceDeltaCents)})' : ''}',
                      style: const TextStyle(
                        fontSize: 10,
                        height: 1.3,
                        color: AppColors.sesame,
                      ),
                    ),
                  ),
                if (line.notes.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '“${line.notes}”',
                      style: const TextStyle(
                        fontSize: 10,
                        height: 1.3,
                        fontStyle: FontStyle.italic,
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                const SizedBox(height: 2),
                Text(
                  formatPrice(
                    posLineTotalCents(
                      line.item.priceCents,
                      line.modifiers,
                      line.quantity,
                    ),
                  ),
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11,
                    color: AppColors.muted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _MiniIconButton(
                icon: Icons.remove,
                tooltip: 'Remove one ${line.item.name}',
                onTap: () => onChangeQuantity(-1),
              ),
              SizedBox(
                width: 22,
                child: Text(
                  '${line.quantity}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.foreground,
                  ),
                ),
              ),
              _MiniIconButton(
                icon: Icons.add,
                tooltip: 'Add one ${line.item.name}',
                onTap: () => onChangeQuantity(1),
              ),
              // Keep destructive remove away from "+': a fast double-tap on
              // add must not land on delete.
              const SizedBox(width: 8),
              _MiniIconButton(
                icon: Icons.delete_outline,
                tooltip: 'Remove ${line.item.name}',
                color: AppColors.dangerText,
                onTap: onRemove,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniIconButton extends StatelessWidget {
  const _MiniIconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: Icon(icon, size: 17),
      tooltip: tooltip,
      color: color ?? AppColors.foreground,
      visualDensity: VisualDensity.compact,
      // 40dp is the practical minimum for a counter tablet thumb; the row's
      // quantity stepper is the most-tapped control on the screen.
      constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
      padding: EdgeInsets.zero,
    );
  }
}

class _PaymentSection extends StatelessWidget {
  const _PaymentSection({
    required this.sale,
    required this.onPaymentMethodChange,
    required this.onSubmit,
  });

  final PosSaleState sale;
  final ValueChanged<PosPaymentMethod> onPaymentMethodChange;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: _MethodButton(
                  icon: Icons.payments_outlined,
                  label: PosPaymentMethod.cash.label,
                  active: sale.paymentMethod == PosPaymentMethod.cash,
                  onTap: () => onPaymentMethodChange(PosPaymentMethod.cash),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _MethodButton(
                  icon: Icons.qr_code,
                  label: PosPaymentMethod.qrPay.label,
                  active: sale.paymentMethod == PosPaymentMethod.qrPay,
                  onTap: () => onPaymentMethodChange(PosPaymentMethod.qrPay),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          OutlinedButton.icon(
            onPressed: null,
            icon: const Icon(Icons.credit_card, size: 16),
            label: const Text(
              'Card terminal — coming soon',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
            ),
            style: const ButtonStyle(
              minimumSize: WidgetStatePropertyAll(Size.fromHeight(36)),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                'Total',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.muted,
                ),
              ),
              const Spacer(),
              Text(
                formatPrice(sale.totalCents),
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.foreground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (sale.reviewMessage != null) ...[
            PosWarningBanner(sale.reviewMessage!),
            const SizedBox(height: 8),
          ],
          if (sale.submitError != null) ...[
            PosErrorBanner(sale.submitError!),
            const SizedBox(height: 8),
          ],
          FilledButton(
            onPressed: sale.canSubmit ? onSubmit : null,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              backgroundColor: AppColors.accent,
              foregroundColor: AppColors.onAccent,
              disabledBackgroundColor: AppColors.surface3,
              disabledForegroundColor: AppColors.muted,
            ),
            child: sale.submitting
                ? const PosBusy(size: 18)
                : Text(
                    'Charge ${formatPrice(sale.totalCents)}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _MethodButton extends StatelessWidget {
  const _MethodButton({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      child: Material(
        color: active ? AppColors.accent : AppColors.surface2,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.smRadius,
          side: BorderSide(color: active ? AppColors.accent : AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 9),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 15,
                  color: active ? AppColors.onAccent : AppColors.muted,
                ),
                const SizedBox(width: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: active ? AppColors.onAccent : AppColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
