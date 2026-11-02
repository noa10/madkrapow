import '../../generated/tables/orders.dart';

/// Order columns added by the counter-POS migrations (057–064).
///
/// The generated [OrdersRow] predates those columns, so these getters read
/// through the row's underlying field map. Money stays in integer cents.
extension OrderPosFields on OrdersRow {
  String? get tableId => getField<String>('table_id');
  String? get tableLabel => getField<String>('table_label');
  int? get pax => getField<int>('pax');
  String? get paymentMethod => getField<String>('payment_method');
  String? get source => getField<String>('source');

  bool get isDineIn => deliveryType == 'dine_in';
  bool get isUnpaid => status == 'pending';
}

/// Human label for `orders.delivery_type`.
String orderTypeLabel(String deliveryType) => switch (deliveryType) {
  'dine_in' => 'Dine-in',
  'self_pickup' || 'pickup' => 'Pickup',
  _ => 'Delivery',
};

/// Human label for `orders.payment_method`.
String orderPaymentMethodLabel(String? method) => switch (method) {
  'cash' => 'Cash',
  'qr_pay' => 'Company QR',
  'card' => 'Card',
  _ => '—',
};

/// Whether a `payments.raw` value marks a self-declared table-QR payment
/// (migration 065).
///
/// The diner tapped "I have paid" on their own phone; the server never saw the
/// bank transfer. Staff must verify the account before hand-over, so the order
/// detail warns instead of treating the ticket as an ordinary paid sale.
bool isClaimedByDiner(Object? raw) =>
    raw is Map && raw['claimed_via'] == 'table_qr';

/// Copy for the order-detail explanation shown while an order is unpaid.
///
/// Mirrors the two pending banners on the web admin order page: an unpaid
/// counter / table-QR ticket is already with the kitchen, while every other
/// pending order is still waiting on the Stripe webhook.
class PendingPaymentNotice {
  const PendingPaymentNotice({required this.title, required this.body});

  final String title;
  final String body;
}

PendingPaymentNotice? pendingPaymentNoticeFor(OrdersRow order) {
  if (!order.isUnpaid) return null;
  if (order.isDineIn || order.source == 'counter') {
    return PendingPaymentNotice(
      title: 'Awaiting payment at the counter',
      body: order.source == 'counter'
          ? 'This unpaid ${order.isDineIn ? 'dine-in' : 'take-away'} '
                'order is already with the kitchen. Collect cash or Company QR '
                'in the POS '
                '${order.isDineIn ? 'table board' : 'Unpaid take-away list'} '
                'to mark it paid.'
          : 'This dine-in order came from the table QR. The kitchen already '
                'sees it; collect cash or Company QR in the POS table board '
                'to mark it paid.',
    );
  }
  return const PendingPaymentNotice(
    title: 'Awaiting payment confirmation',
    body:
        'This order is pending Stripe payment. It will appear in the merchant '
        'app once the payment webhook confirms the transaction. If the '
        'customer has already paid, check the Stripe webhook endpoint '
        'configuration or try refreshing this page.',
  );
}
