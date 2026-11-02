import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../models/pos_models.dart';
import 'company_qr_panel.dart';
import 'pos_ui.dart';

/// Take payment for a pay-now sale before the order is created.
///
/// Both methods confirm explicitly in the sheet: cash ("Cash received") and
/// company QR ("Payment received"). The order is only created after the
/// cashier confirms, and a failure is shown inside the sheet — a snackbar
/// alone can sit underneath a modal barrier and look like nothing happened.
Future<bool> showPosPayNowSheet(
  BuildContext context, {
  required PosPaymentMethod method,
  required int amountCents,
  required String label,
  required Future<String?> Function() onConfirm,
  bool outcomeUncertain = false,
}) async {
  final paid = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    builder: (context) => _PosPayNowSheet(
      method: method,
      amountCents: amountCents,
      label: label,
      onConfirm: onConfirm,
      outcomeUncertain: outcomeUncertain,
    ),
  );
  return paid ?? false;
}

class _PosPayNowSheet extends StatefulWidget {
  const _PosPayNowSheet({
    required this.method,
    required this.amountCents,
    required this.label,
    required this.onConfirm,
    required this.outcomeUncertain,
  });

  final PosPaymentMethod method;
  final int amountCents;
  final String label;
  final Future<String?> Function() onConfirm;
  final bool outcomeUncertain;

  @override
  State<_PosPayNowSheet> createState() => _PosPayNowSheetState();
}

class _PosPayNowSheetState extends State<_PosPayNowSheet> {
  bool _busy = false;
  late bool _outcomeUncertain;
  String? _error;

  @override
  void initState() {
    super.initState();
    _outcomeUncertain = widget.outcomeUncertain;
  }

  bool get _isCash => widget.method == PosPaymentMethod.cash;

  Future<void> _confirm() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    if (_outcomeUncertain) {
      final confirmed = await showPosConfirmDialog(
        context,
        title: 'Check orders first',
        message:
            'The previous order may have been recorded or may still be '
            'processing. Check Orders and wait if necessary. Retrying can '
            'create a duplicate ticket.',
        confirmLabel: 'Order not found — retry',
        warning: true,
      );
      if (!mounted) return;
      if (!confirmed) {
        setState(() => _busy = false);
        return;
      }
    }

    String? message;
    try {
      message = await widget.onConfirm();
    } catch (_) {
      _outcomeUncertain = true;
      message = 'Could not confirm the order. Check Orders before retrying.';
    }

    if (!mounted) return;
    if (message == null) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _busy = false;
      _error = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      canPop: !_busy,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
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
                        Row(
                          children: [
                            Icon(
                              _isCash ? Icons.payments_outlined : Icons.qr_code,
                              size: 18,
                              color: _isCash
                                  ? AppColors.herbText
                                  : AppColors.accent,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _isCash ? 'Collect cash' : 'Scan to pay',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.label,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _busy
                        ? null
                        : () => Navigator.of(context).pop(false),
                    icon: const Icon(Icons.close),
                    tooltip: 'Close',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_isCash)
                Column(
                  children: [
                    Text(
                      formatPrice(widget.amountCents),
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.surface2,
                        borderRadius: AppRadii.mdRadius,
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text(
                        'Take the cash from the customer, then confirm. The '
                        'order is sent to the kitchen and recorded as paid.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.muted,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ],
                )
              else
                CompanyQrPanel(amountCents: widget.amountCents),
              if (_error != null) ...[
                const SizedBox(height: 12),
                PosErrorBanner(_error!),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => Navigator.of(context).pop(false),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : _confirm,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        backgroundColor: AppColors.accent,
                        foregroundColor: AppColors.onAccent,
                      ),
                      child: _busy
                          ? const PosBusy(size: 18)
                          : Text(
                              _isCash ? 'Cash received' : 'Payment received',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
