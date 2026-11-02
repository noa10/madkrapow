import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../models/pos_models.dart';
import '../../models/pos_tables.dart';
import 'pos_ui.dart';
import 'table_qr_share.dart';

/// A floor table with its printable QR code and management actions.
class TableQrCard extends StatelessWidget {
  const TableQrCard({
    super.key,
    required this.table,
    required this.baseUrl,
    required this.busy,
    required this.onEdit,
    required this.onRotate,
    required this.onToggleActive,
  });

  final TableWithToken table;
  final String baseUrl;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onRotate;
  final VoidCallback onToggleActive;

  String get _qrUrl => tableQrUrl(table.qrToken, baseUrl);

  Future<void> _copyLink(BuildContext context) async {
    try {
      await Clipboard.setData(ClipboardData(text: _qrUrl));
      if (context.mounted) {
        showPosSnackBar(context, 'Table link copied');
      }
    } catch (_) {
      if (context.mounted) {
        showPosSnackBar(context, 'Could not copy the link', error: true);
      }
    }
  }

  Future<void> _sharePng(BuildContext context) async {
    try {
      await shareTableQrImage(
        table,
        _qrUrl,
        sharePositionOrigin: _shareOrigin(context),
      );
    } catch (_) {
      if (context.mounted) {
        showPosSnackBar(
          context,
          'Could not create the QR image',
          error: true,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppCard(
      padding: const EdgeInsets.all(14),
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
                label: table.isActive ? 'Active' : 'Inactive',
                background: table.isActive
                    ? AppColors.herbSoft
                    : AppColors.surface3,
                foreground: table.isActive
                    ? AppColors.herbText
                    : AppColors.muted,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Center(
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: AppRadii.mdRadius,
              ),
              child: QrImageView(
                data: _qrUrl,
                version: QrVersions.auto,
                size: 148,
                errorCorrectionLevel: QrErrorCorrectLevel.M,
                backgroundColor: Colors.white,
                padding: EdgeInsets.zero,
                eyeStyle: const QrEyeStyle(
                  eyeShape: QrEyeShape.square,
                  color: Color(0xFF111111),
                ),
                dataModuleStyle: const QrDataModuleStyle(
                  dataModuleShape: QrDataModuleShape.square,
                  color: Color(0xFF111111),
                ),
                semanticsLabel: 'QR code for table ${table.label}',
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _qrUrl,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 10,
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _CardAction(
                  icon: Icons.edit_outlined,
                  label: 'Edit',
                  onTap: busy ? null : onEdit,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _CardAction(
                  icon: Icons.ios_share,
                  label: 'Share PNG',
                  onTap: busy ? null : () => _sharePng(context),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _CardAction(
                  icon: Icons.copy,
                  label: 'Copy link',
                  onTap: busy ? null : () => _copyLink(context),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _CardAction(
                  icon: Icons.autorenew,
                  label: 'Rotate QR',
                  onTap: busy ? null : onRotate,
                  busy: busy,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: busy ? null : onToggleActive,
            style: TextButton.styleFrom(
              foregroundColor: table.isActive
                  ? AppColors.muted
                  : AppColors.accent,
              minimumSize: const Size.fromHeight(36),
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: Text(
              table.isActive ? 'Deactivate table' : 'Activate table',
            ),
          ),
        ],
      ),
    );
  }
}

Rect _shareOrigin(BuildContext context) {
  final box = context.findRenderObject() as RenderBox?;
  if (box == null || !box.hasSize) return Rect.zero;
  return box.localToGlobal(Offset.zero) & box.size;
}

class _CardAction extends StatelessWidget {
  const _CardAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: busy ? const PosBusy(size: 13) : Icon(icon, size: 14),
      label: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(36),
        padding: const EdgeInsets.symmetric(horizontal: 6),
      ),
    );
  }
}
