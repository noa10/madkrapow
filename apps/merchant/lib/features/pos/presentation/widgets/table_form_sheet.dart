import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/utils/auth_exceptions.dart';
import '../../data/pos_api_client.dart';
import '../../models/pos_models.dart';
import '../../providers/pos_providers.dart';
import 'pos_ui.dart';

/// Create or edit a floor table. Returns true when the table was saved.
Future<bool> showTableFormSheet(
  BuildContext context, {
  TableWithToken? table,
}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    builder: (context) => _TableFormSheet(table: table),
  );
  return saved ?? false;
}

class _TableFormSheet extends ConsumerStatefulWidget {
  const _TableFormSheet({this.table});

  final TableWithToken? table;

  @override
  ConsumerState<_TableFormSheet> createState() => _TableFormSheetState();
}

class _TableFormSheetState extends ConsumerState<_TableFormSheet> {
  late final TextEditingController _labelController;
  late final TextEditingController _zoneController;
  late final TextEditingController _seatsController;
  late final TextEditingController _sortController;
  late bool _isActive;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final table = widget.table;
    _labelController = TextEditingController(text: table?.label ?? '');
    _zoneController = TextEditingController(text: table?.zone ?? '');
    _seatsController = TextEditingController(text: '${table?.seats ?? 2}');
    _sortController = TextEditingController(text: '${table?.sortOrder ?? 0}');
    _isActive = table?.isActive ?? true;
  }

  @override
  void dispose() {
    _labelController.dispose();
    _zoneController.dispose();
    _seatsController.dispose();
    _sortController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    final label = _labelController.text.trim();
    if (label.isEmpty) {
      setState(() => _error = 'Table label is required');
      return;
    }

    final seats = int.tryParse(_seatsController.text.trim());
    if (seats == null || seats < 1 || seats > 50) {
      setState(() => _error = 'Seats must be a whole number between 1 and 50');
      return;
    }

    final sortOrder = int.tryParse(_sortController.text.trim());
    // The admin route caps sort_order at 9999; catch it here rather than
    // surfacing a generic 400 after the form closes.
    if (sortOrder == null || sortOrder < 0 || sortOrder > 9999) {
      setState(
        () => _error = 'Sort order must be a whole number from 0 to 9999',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final repo = ref.read(posRepositoryProvider);
      final zone = _zoneController.text.trim();
      final table = widget.table;
      if (table == null) {
        await repo.createTable(
          label: label,
          zone: zone.isEmpty ? null : zone,
          seats: seats,
          sortOrder: sortOrder,
          isActive: _isActive,
        );
      } else {
        await repo.updateTable(table.id, {
          'label': label,
          'zone': zone.isEmpty ? null : zone,
          'seats': seats,
          'sort_order': sortOrder,
          'is_active': _isActive,
        });
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on PosApiException catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = error.message;
        });
      }
    } on AuthRequiredException catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = error.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Network error — please try again';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final editing = widget.table != null;

    return PopScope(
      canPop: !_saving,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.9,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
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
                            editing
                                ? 'Edit ${widget.table!.label}'
                                : 'Add table',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'A QR code is generated automatically for every '
                            'table.',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: AppColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: _saving
                          ? null
                          : () => Navigator.of(context).pop(false),
                      icon: const Icon(Icons.close),
                      tooltip: 'Close dialog',
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                _FormField(
                  label: 'Table label',
                  child: TextField(
                    controller: _labelController,
                    maxLength: 40,
                    textCapitalization: TextCapitalization.words,
                    autofocus: !editing,
                    decoration: _inputDecoration(
                      hintText: 'T1, Patio 3, VIP…',
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _FormField(
                        label: 'Zone (optional)',
                        child: TextField(
                          controller: _zoneController,
                          maxLength: 60,
                          textCapitalization: TextCapitalization.words,
                          decoration: _inputDecoration(
                            hintText: 'Indoor',
                            counterText: '',
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _FormField(
                        label: 'Seats',
                        child: TextField(
                          controller: _seatsController,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                          ],
                          decoration: _inputDecoration(hintText: '2'),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _FormField(
                        label: 'Sort order',
                        child: TextField(
                          controller: _sortController,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                          ],
                          decoration: _inputDecoration(hintText: '0'),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 24),
                        child: SwitchListTile(
                          value: _isActive,
                          onChanged: _saving
                              ? null
                              : (value) =>
                                    setState(() => _isActive = value),
                          title: const Text(
                            'Accepting QR orders',
                            style: TextStyle(fontSize: 12),
                          ),
                          contentPadding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  PosErrorBanner(_error!),
                ],
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _saving
                            ? null
                            : () => Navigator.of(context).pop(false),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(46),
                        ),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: _saving ? null : _save,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(46),
                          backgroundColor: AppColors.accent,
                          foregroundColor: AppColors.onAccent,
                        ),
                        child: _saving
                            ? const PosBusy(size: 18)
                            : const Text(
                                'Save table',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration({
    required String hintText,
    String? counterText,
  }) {
    return InputDecoration(
      hintText: hintText,
      counterText: counterText,
      isDense: true,
      filled: true,
      fillColor: AppColors.surface2,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: const OutlineInputBorder(
        borderRadius: AppRadii.mdRadius,
        borderSide: BorderSide(color: AppColors.border),
      ),
      enabledBorder: const OutlineInputBorder(
        borderRadius: AppRadii.mdRadius,
        borderSide: BorderSide(color: AppColors.border),
      ),
    );
  }
}

class _FormField extends StatelessWidget {
  const _FormField({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PosLabel(label),
        const SizedBox(height: 5),
        child,
      ],
    );
  }
}
