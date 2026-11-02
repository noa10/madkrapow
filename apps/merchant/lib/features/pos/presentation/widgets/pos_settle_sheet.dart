import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../models/pos_models.dart';
import '../../models/pos_tables.dart';
import 'company_qr_panel.dart';
import 'pos_ui.dart';

/// Collect payment for an unpaid POS order or every unpaid order at a table.
///
/// The amount and label come from the settle target, so the grouped total shown
/// here is the same number the card and the sale panel used. Returns true when
/// the target was resolved — the payment was recorded, or the server reported
/// it as already settled or changed — so the caller refreshes the board.
Future<bool> showPosSettleSheet(
  BuildContext context, {
  required PosSettleTarget target,
  required Future<String?> Function(PosPaymentMethod method) onConfirm,
}) async {
  final settled = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    builder: (context) => _PosSettleSheet(target: target, onConfirm: onConfirm),
  );
  return settled ?? false;
}

enum _SettleStage { method, qr }

class _PosSettleSheet extends StatefulWidget {
  const _PosSettleSheet({required this.target, required this.onConfirm});

  final PosSettleTarget target;
  final Future<String?> Function(PosPaymentMethod method) onConfirm;

  @override
  State<_PosSettleSheet> createState() => _PosSettleSheetState();
}

class _PosSettleSheetState extends State<_PosSettleSheet> {
  _SettleStage _stage = _SettleStage.method;
  bool _busy = false;
  String? _error;

  Future<void> _confirm(PosPaymentMethod method) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    String? message;
    try {
      message = await widget.onConfirm(method);
    } catch (_) {
      message = 'Network error — check the connection and try again.';
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

  void _close() {
    if (_busy) return;
    Navigator.of(context).pop(false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final target = widget.target;
    final isQr = _stage == _SettleStage.qr;

    return PopScope(
      canPop: !_busy,
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
                        isQr ? 'Scan to pay' : 'Collect payment',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${target.label} · ${target.context}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: _busy ? null : _close,
                  icon: const Icon(Icons.close),
                  tooltip: 'Close',
                ),
              ],
            ),
            if (isQr) ...[
              const SizedBox(height: 12),
              CompanyQrPanel(
                amountCents: target.amountCents,
                note:
                    'Confirm only after the customer shows a successful payment.',
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                PosErrorBanner(_error!),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy
                          ? null
                          : () => setState(() => _stage = _SettleStage.method),
                      icon: const Icon(Icons.arrow_back, size: 18),
                      label: const Text('Back'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _busy
                          ? null
                          : () => _confirm(PosPaymentMethod.qrPay),
                      icon: _busy
                          ? const PosBusy(size: 16)
                          : const Icon(Icons.check, size: 18),
                      label: const Text(
                        'Payment received',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        backgroundColor: AppColors.accent,
                        foregroundColor: AppColors.onAccent,
                      ),
                    ),
                  ),
                ],
              ),
            ] else ...[
              const SizedBox(height: 16),
              Text(
                formatPrice(target.amountCents),
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (target.orderCount > 1) ...[
                const SizedBox(height: 4),
                Text(
                  'Settles all ${target.orderCount} unpaid orders at this table.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.muted,
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                PosErrorBanner(_error!),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy
                          ? null
                          : () => _confirm(PosPaymentMethod.cash),
                      icon: _busy
                          ? const PosBusy(size: 16)
                          : const Icon(Icons.payments_outlined, size: 18),
                      label: const Text('Cash'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(50),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy
                          ? null
                          : () => setState(() => _stage = _SettleStage.qr),
                      icon: const Icon(Icons.qr_code, size: 18),
                      label: const Text('Company QR'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(50),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: null,
                icon: const Icon(Icons.credit_card, size: 18),
                label: const Text('Card terminal — coming soon'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(44),
                  foregroundColor: AppColors.muted,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'The order is marked paid and the kitchen is notified.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 11,
                  color: AppColors.muted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
