import 'package:flutter/material.dart';

/// Payment-provider classification for an order.
enum PaymentProvider { stripe, cash, pending }

/// Delivery-provider classification for an order.
enum DeliveryProvider { lalamove, selfPickup, inHouse, pending }

/// Source fields used to derive the badges. Reuses the snake_case wire keys
/// from the orders table so a `Map<String, dynamic>` row or a typed model
/// (with the same getters) both work.
class ProviderBadgeData {
  ProviderBadgeData({
    this.status,
    this.deliveryType,
    this.stripePaymentIntentId,
    this.stripeSessionId,
    this.lalamoveOrderId,
    this.lalamoveQuoteId,
    this.driverName,
    this.driverPhone,
  });

  final String? status;
  final String? deliveryType;
  final String? stripePaymentIntentId;
  final String? stripeSessionId;
  final String? lalamoveOrderId;
  final String? lalamoveQuoteId;
  final String? driverName;
  final String? driverPhone;
}

PaymentProvider paymentProviderFor(ProviderBadgeData data) {
  if ((data.stripePaymentIntentId != null && data.stripePaymentIntentId!.isNotEmpty) ||
      (data.stripeSessionId != null && data.stripeSessionId!.isNotEmpty)) {
    return PaymentProvider.stripe;
  }
  if (data.status == 'pending') return PaymentProvider.pending;
  return PaymentProvider.cash;
}

DeliveryProvider deliveryProviderFor(ProviderBadgeData data) {
  if (data.deliveryType == 'self_pickup' || data.deliveryType == 'pickup') {
    return DeliveryProvider.selfPickup;
  }
  if ((data.lalamoveOrderId != null && data.lalamoveOrderId!.isNotEmpty) ||
      (data.lalamoveQuoteId != null && data.lalamoveQuoteId!.isNotEmpty)) {
    return DeliveryProvider.lalamove;
  }
  if ((data.driverName != null && data.driverName!.isNotEmpty) ||
      (data.driverPhone != null && data.driverPhone!.isNotEmpty)) {
    return DeliveryProvider.inHouse;
  }
  return DeliveryProvider.pending;
}

String paymentLabel(PaymentProvider p) {
  switch (p) {
    case PaymentProvider.stripe:
      return 'Stripe';
    case PaymentProvider.cash:
      return 'Cash';
    case PaymentProvider.pending:
      return 'Awaiting';
  }
}

String deliveryLabel(DeliveryProvider p) {
  switch (p) {
    case DeliveryProvider.lalamove:
      return 'Lalamove';
    case DeliveryProvider.selfPickup:
      return 'Self Pickup';
    case DeliveryProvider.inHouse:
      return 'In-house';
    case DeliveryProvider.pending:
      return 'Pending Dispatch';
  }
}

IconData paymentIcon(PaymentProvider p) {
  switch (p) {
    case PaymentProvider.stripe:
      return Icons.credit_card;
    case PaymentProvider.cash:
      return Icons.payments_outlined;
    case PaymentProvider.pending:
      return Icons.hourglass_top_rounded;
  }
}

IconData deliveryIcon(DeliveryProvider p) {
  switch (p) {
    case DeliveryProvider.lalamove:
      return Icons.local_shipping_outlined;
    case DeliveryProvider.selfPickup:
      return Icons.storefront_outlined;
    case DeliveryProvider.inHouse:
      return Icons.delivery_dining_outlined;
    case DeliveryProvider.pending:
      return Icons.hourglass_empty;
  }
}

Color paymentColor(PaymentProvider p) {
  switch (p) {
    case PaymentProvider.stripe:
      return const Color(0xFF7C5BD3);
    case PaymentProvider.cash:
      return const Color(0xFF10B981);
    case PaymentProvider.pending:
      return const Color(0xFFD97706);
  }
}

Color deliveryColor(DeliveryProvider p) {
  switch (p) {
    case DeliveryProvider.lalamove:
      return const Color(0xFFF97316);
    case DeliveryProvider.selfPickup:
      return const Color(0xFF0EA5E9);
    case DeliveryProvider.inHouse:
      return const Color(0xFF14B8A6);
    case DeliveryProvider.pending:
      return const Color(0xFF64748B);
  }
}

/// Compact pill that shows both payment and delivery provider.
class ProviderBadges extends StatelessWidget {
  const ProviderBadges({
    super.key,
    required this.data,
    this.dense = false,
    this.showLabels = true,
  });

  final ProviderBadgeData data;

  /// When true, renders a tighter row appropriate for list cards.
  final bool dense;

  final bool showLabels;

  @override
  Widget build(BuildContext context) {
    final payment = paymentProviderFor(data);
    final delivery = deliveryProviderFor(data);

    return Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        _Pill(
          icon: paymentIcon(payment),
          label: paymentLabel(payment),
          color: paymentColor(payment),
          dense: dense,
          showLabel: showLabels,
          semanticPrefix: 'Payment',
        ),
        _Pill(
          icon: deliveryIcon(delivery),
          label: deliveryLabel(delivery),
          color: deliveryColor(delivery),
          dense: dense,
          showLabel: showLabels,
          semanticPrefix: 'Delivery',
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.icon,
    required this.label,
    required this.color,
    required this.dense,
    required this.showLabel,
    required this.semanticPrefix,
  });

  final IconData icon;
  final String label;
  final Color color;
  final bool dense;
  final bool showLabel;
  final String semanticPrefix;

  @override
  Widget build(BuildContext context) {
    final iconSize = dense ? 11.0 : 13.0;
    final fontSize = dense ? 10.0 : 11.5;
    final padH = dense ? 6.0 : 8.0;
    final padV = dense ? 2.0 : 3.0;

    return Semantics(
      label: '$semanticPrefix: $label',
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: padH, vertical: padV),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.35), width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: iconSize, color: color),
            if (showLabel) ...[
              SizedBox(width: dense ? 3 : 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: fontSize,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
