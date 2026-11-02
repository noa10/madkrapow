import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../models/pos_cart.dart';
import '../../models/pos_models.dart';
import 'pos_ui.dart';

/// What the cashier chose for one customizable dish.
class PosItemOptionsResult {
  const PosItemOptionsResult({
    required this.quantity,
    required this.modifiers,
    required this.notes,
  });

  final int quantity;
  final List<PosCartModifier> modifiers;
  final String notes;
}

/// Open the add-on sheet for a POS dish. Returns null when dismissed.
Future<PosItemOptionsResult?> showPosItemOptionsSheet(
  BuildContext context, {
  required PosMenuItem item,
  required List<PosModifierGroup> groups,
}) {
  return showModalBottomSheet<PosItemOptionsResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    builder: (context) => PosItemOptionsSheet(item: item, groups: groups),
  );
}

class PosItemOptionsSheet extends StatefulWidget {
  const PosItemOptionsSheet({
    super.key,
    required this.item,
    required this.groups,
  });

  final PosMenuItem item;
  final List<PosModifierGroup> groups;

  @override
  State<PosItemOptionsSheet> createState() => _PosItemOptionsSheetState();
}

class _PosItemOptionsSheetState extends State<PosItemOptionsSheet> {
  final _notesController = TextEditingController();
  final _selected = <String, Set<String>>{};
  int _quantity = 1;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  List<PosModifierGroup> get _unsatisfied => [
    for (final group in widget.groups)
      if (group.required &&
          (_selected[group.id]?.length ?? 0) < group.requiredCount)
        group,
  ];

  List<PosCartModifier> get _selectedModifiers {
    final modifiers = <PosCartModifier>[];
    for (final group in widget.groups) {
      final ids = _selected[group.id] ?? const <String>{};
      for (final modifier in group.modifiers) {
        if (!ids.contains(modifier.id)) continue;
        modifiers.add(
          PosCartModifier(
            id: modifier.id,
            name: modifier.name,
            priceDeltaCents: modifier.priceDeltaCents,
          ),
        );
      }
    }
    return modifiers;
  }

  int get _totalCents {
    final unit = _selectedModifiers.fold<int>(
      widget.item.priceCents,
      (sum, modifier) => sum + modifier.priceDeltaCents,
    );
    // Same floor as the cart and the server: a discount larger than the dish
    // price must not advertise a negative line.
    return (unit < 0 ? 0 : unit) * _quantity;
  }

  void _toggle(PosModifierGroup group, PosModifier modifier) {
    final current = _selected.putIfAbsent(group.id, () => <String>{});
    setState(() {
      if (group.isSingleChoice) {
        if (current.contains(modifier.id)) {
          current.clear();
        } else {
          current
            ..clear()
            ..add(modifier.id);
        }
        return;
      }
      if (current.contains(modifier.id)) {
        current.remove(modifier.id);
        return;
      }
      if (group.maxSelections > 0 && current.length >= group.maxSelections) {
        return;
      }
      // The API rejects a line with more than 20 add-ons; per-group maxima can
      // add up past that. Stop here rather than failing the whole submit.
      final selectedTotal = _selected.values.fold<int>(
        0,
        (sum, ids) => sum + ids.length,
      );
      if (selectedTotal >= maxPosLineModifiers) return;
      current.add(modifier.id);
    });
  }

  void _submit() {
    if (_unsatisfied.isNotEmpty) return;
    Navigator.of(context).pop(
      PosItemOptionsResult(
        quantity: _quantity,
        modifiers: _selectedModifiers,
        notes: _notesController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasImage =
        widget.item.imageUrl != null && widget.item.imageUrl!.isNotEmpty;
    final unsatisfied = _unsatisfied;

    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.92,
      ),
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 10),
              child: Row(
                children: [
                  if (hasImage) ...[
                    ClipRRect(
                      borderRadius: AppRadii.smRadius,
                      child: Image.network(
                        widget.item.imageUrl!,
                        width: 52,
                        height: 52,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stack) =>
                            const SizedBox.shrink(),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.item.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          formatPrice(widget.item.priceCents),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.emberText,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                    tooltip: 'Close options',
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.border),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (widget.item.description != null &&
                        widget.item.description!.isNotEmpty) ...[
                      Text(
                        widget.item.description!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.muted,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 18),
                    ],
                    for (final group in widget.groups) ...[
                      _ModifierGroupBlock(
                        group: group,
                        selected: _selected[group.id] ?? const <String>{},
                        onToggle: (modifier) => _toggle(group, modifier),
                      ),
                      const SizedBox(height: 18),
                    ],
                    const PosLabel('Special instructions'),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _notesController,
                      maxLength: 200,
                      maxLines: 3,
                      minLines: 2,
                      decoration: const InputDecoration(
                        hintText: 'E.g., No onions, extra spicy...',
                        filled: true,
                        fillColor: AppColors.surface2,
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
                ),
              ),
            ),
            const Divider(height: 1, color: AppColors.border),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              child: Row(
                children: [
                  _QuantityStepper(
                    quantity: _quantity,
                    onChanged: (value) => setState(() => _quantity = value),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: unsatisfied.isEmpty ? _submit : null,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                        backgroundColor: AppColors.accent,
                        foregroundColor: AppColors.onAccent,
                        disabledBackgroundColor: AppColors.surface3,
                        disabledForegroundColor: AppColors.muted,
                      ),
                      child: Text(
                        unsatisfied.isEmpty
                            ? 'Add $_quantity · ${formatPrice(_totalCents)}'
                            : 'Choose required options',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModifierGroupBlock extends StatelessWidget {
  const _ModifierGroupBlock({
    required this.group,
    required this.selected,
    required this.onToggle,
  });

  final PosModifierGroup group;
  final Set<String> selected;
  final ValueChanged<PosModifier> onToggle;

  static IconData _iconFor(String name) {
    final normalized = name.toLowerCase();
    if (normalized.contains('pedas') || normalized.contains('spice')) {
      return Icons.local_fire_department;
    }
    if (normalized.contains('minuman') || normalized.contains('drink')) {
      return Icons.local_drink_outlined;
    }
    if (normalized.contains('basil') || normalized.contains('daun')) {
      return Icons.eco_outlined;
    }
    if (normalized.contains('berat') || normalized.contains('portion')) {
      return Icons.scale_outlined;
    }
    if (normalized.contains('bekas') || normalized.contains('container')) {
      return Icons.takeout_dining_outlined;
    }
    return Icons.tune;
  }

  String get _tag {
    final scope = group.isSingleChoice
        ? '1 choice'
        : group.maxSelections > 1
        ? 'Up to ${group.maxSelections} choices'
        : null;
    return [
      group.required ? 'Required' : 'Optional',
      scope,
    ].where((part) => part != null && part.isNotEmpty).join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(_iconFor(group.name), size: 16, color: AppColors.ember),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                group.name,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Text(
              _tag,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.muted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        for (final modifier in group.modifiers)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _ModifierRow(
              modifier: modifier,
              selected: selected.contains(modifier.id),
              singleChoice: group.isSingleChoice,
              onTap: () => onToggle(modifier),
            ),
          ),
      ],
    );
  }
}

class _ModifierRow extends StatelessWidget {
  const _ModifierRow({
    required this.modifier,
    required this.selected,
    required this.singleChoice,
    required this.onTap,
  });

  final PosModifier modifier;
  final bool selected;
  final bool singleChoice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      checked: selected,
      inMutuallyExclusiveGroup: singleChoice,
      child: Material(
        color: selected ? AppColors.accentSoft : AppColors.surface2,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.mdRadius,
          side: BorderSide(
            color: selected ? AppColors.accent : AppColors.border,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(
                  singleChoice
                      ? (selected
                            ? Icons.radio_button_checked
                            : Icons.radio_button_off)
                      : (selected
                            ? Icons.check_box
                            : Icons.check_box_outline_blank),
                  size: 19,
                  color: selected ? AppColors.accent : AppColors.muted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    modifier.name,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.foreground,
                    ),
                  ),
                ),
                if (modifier.priceDeltaCents > 0)
                  Text(
                    '+${formatPrice(modifier.priceDeltaCents)}',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.sesame,
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

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({required this.quantity, required this.onChanged});

  final int quantity;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 46,
      decoration: BoxDecoration(
        borderRadius: AppRadii.mdRadius,
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            onPressed: quantity > 1 ? () => onChanged(quantity - 1) : null,
            icon: const Icon(Icons.remove, size: 18),
            tooltip: 'Decrease quantity',
            visualDensity: VisualDensity.compact,
          ),
          SizedBox(
            width: 26,
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: AppColors.foreground,
              ),
            ),
          ),
          IconButton(
            onPressed: quantity < maxPosAddQuantity
                ? () => onChanged(quantity + 1)
                : null,
            icon: const Icon(Icons.add, size: 18),
            tooltip: 'Increase quantity',
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}
