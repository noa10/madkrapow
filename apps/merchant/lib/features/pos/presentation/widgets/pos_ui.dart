/// Shared presentation helpers for the counter POS.
///
/// Snackbars, confirmations and small labels repeat across the sale panel,
/// table board and table management screens; keeping them here means the copy
/// and colours stay identical everywhere.
library;

import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

/// Show a POS message, replacing any snackbar already on screen.
void showPosSnackBar(
  BuildContext context,
  String message, {
  bool error = false,
}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      // The theme's foreground on `danger` is ~3.4:1 — below WCAG AA for this
      // body text. The dark background colour reads ~5:1 on the same red.
      content: Text(
        message,
        style: error ? const TextStyle(color: AppColors.background) : null,
      ),
      backgroundColor: error ? AppColors.danger : null,
      duration: Duration(seconds: error ? 5 : 4),
    ),
  );
}

/// Ask before an irreversible POS action. Returns false when dismissed.
Future<bool> showPosConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  bool destructive = false,
  bool warning = false,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) {
      final confirmColor = destructive
          ? AppColors.danger
          : warning
          ? AppColors.warning
          : AppColors.accent;
      return AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: confirmColor,
              foregroundColor: destructive || warning
                  ? AppColors.background
                  : AppColors.onAccent,
            ),
            child: Text(confirmLabel),
          ),
        ],
      );
    },
  );
  return confirmed ?? false;
}

/// Small uppercase label used above grouped POS controls.
class PosLabel extends StatelessWidget {
  const PosLabel(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: color ?? AppColors.muted,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.1,
      ),
    );
  }
}

/// Inline error block, visible inside dialogs where a snackbar would sit
/// underneath the modal barrier.
class PosErrorBanner extends StatelessWidget {
  const PosErrorBanner(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.dangerSoft,
        borderRadius: AppRadii.smRadius,
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
      ),
      child: Text(
        message,
        style: const TextStyle(
          fontSize: 12,
          height: 1.4,
          color: AppColors.dangerText,
        ),
      ),
    );
  }
}

/// Pill used by the table board for Free / Occupied / Unpaid.
class PosStatePill extends StatelessWidget {
  const PosStatePill({
    super.key,
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppRadii.pillRadius,
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: foreground,
        ),
      ),
    );
  }
}

/// Loader sized for a POS pane or dialog.
class PosBusy extends StatelessWidget {
  const PosBusy({super.key, this.size = 20});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: const CircularProgressIndicator(strokeWidth: 2),
    );
  }
}
