import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

/// The merchant's DuitNow QR poster plus the amount due.
///
/// The image is a public, receive-only payment QR supplied by the business.
/// The white frame preserves the QR quiet zone.
class CompanyQrPanel extends StatelessWidget {
  const CompanyQrPanel({super.key, required this.amountCents, this.note});

  final int amountCents;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: AppRadii.lgRadius,
            border: Border.all(color: AppColors.border),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 260),
            child: Image.asset(
              'assets/images/company-qr.jpeg',
              fit: BoxFit.contain,
              semanticLabel: 'Company DuitNow QR code — scan to pay',
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          formatPrice(amountCents),
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.foreground,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Ask the customer to scan with any Malaysian banking app or '
          'e-wallet, then confirm once the payment is received.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(color: AppColors.muted),
        ),
        if (note != null) ...[
          const SizedBox(height: 6),
          Text(
            note!,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 11,
              color: AppColors.muted,
            ),
          ),
        ],
      ],
    );
  }
}
