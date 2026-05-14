// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/madkrapow_orders/order_status.json
// Regenerate: dart run packages/madkrapow_orders/tool/generate.dart

// ignore_for_file: type=lint

/// Canonical list of orders.status values.
const List<String> kOrderStatusValues = ['pending', 'paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'];

const List<String> kTerminalStatuses = ['delivered', 'cancelled'];
const List<String> kCancellableStatuses = ['pending', 'paid', 'accepted', 'preparing', 'ready'];
const List<String> kFlowSteps = ['pending', 'paid', 'preparing', 'ready', 'picked_up', 'delivered'];
const List<String> kAdminFlowSteps = ['pending', 'paid', 'preparing', 'ready', 'picked_up', 'delivered'];
const List<String> kNotifyStatuses = ['preparing', 'ready', 'picked_up', 'delivered', 'cancelled'];

const Map<String, List<String>> kForwardTransitions = {'pending': ['paid', 'cancelled'], 'paid': ['preparing', 'cancelled'], 'accepted': ['cancelled'], 'preparing': ['ready', 'cancelled'], 'ready': ['picked_up', 'cancelled'], 'picked_up': ['delivered'], 'delivered': [], 'cancelled': []};
const Map<String, List<String>> kAdminTransitions = {'pending': ['paid', 'cancelled'], 'paid': ['preparing', 'cancelled'], 'accepted': ['cancelled'], 'preparing': ['ready', 'cancelled'], 'ready': ['cancelled']};
const Map<String, List<String>> kKitchenTransitions = {'preparing': ['ready']};

const Map<String, String> kCustomerLabels = {'pending': 'Pending Payment', 'paid': 'Paid', 'accepted': 'Accepted', 'preparing': 'Preparing', 'ready': 'Ready', 'picked_up_delivery': 'On the way', 'picked_up_self_pickup': 'Picked Up', 'delivered': 'Delivered', 'cancelled': 'Cancelled'};
const Map<String, String> kAdminLabels = {'pending': 'Pending', 'paid': 'Paid', 'accepted': 'Accepted', 'preparing': 'Preparing', 'ready': 'Ready', 'picked_up': 'Picked Up', 'delivered': 'Delivered', 'cancelled': 'Cancelled'};
const Map<String, String> kStepLabels = {'pending': 'Pending', 'paid': 'Paid', 'preparing': 'Preparing', 'ready': 'Ready', 'picked_up': 'Picked Up', 'delivered': 'Delivered'};
const Map<String, String> kColorRoles = {'pending': 'warning', 'paid': 'info', 'accepted': 'info', 'preparing': 'primary', 'ready': 'success', 'picked_up': 'success', 'delivered': 'success', 'cancelled': 'danger'};

class DispatchBannerCopy {
  final String title;
  final String body;
  final String customerBody;
  final String severity;
  const DispatchBannerCopy({required this.title, required this.body, required this.customerBody, required this.severity});
}

const Map<String, DispatchBannerCopy> kDispatchMessages = {
  'manual_review': DispatchBannerCopy(title: 'Delivery flagged for manual review', body: 'Driver rejection limit reached — Lalamove could not assign a replacement driver. Choose: retry delivery, contact the customer, or cancel the order.', customerBody: 'We hit a delivery hiccup and our team is working on it. We\'ll keep you posted.', severity: 'danger'),
  'failed': DispatchBannerCopy(title: 'Delivery failed', body: 'Order expired — no driver was assigned within the Lalamove expiry window. Choose: retry delivery, contact the customer, or cancel the order.', customerBody: 'We couldn\'t dispatch a driver in time. Our team is sorting this out.', severity: 'danger'),
  'driver_pending': DispatchBannerCopy(title: 'Looking for a driver', body: 'Lalamove is assigning a driver.', customerBody: 'Looking for a driver…', severity: 'info'),
  'driver_assigned': DispatchBannerCopy(title: 'Driver assigned', body: 'A driver has been assigned and will arrive shortly.', customerBody: 'A driver has been assigned and is on the way.', severity: 'info'),
  'in_transit': DispatchBannerCopy(title: 'Driver in transit', body: 'The driver has picked up the order.', customerBody: 'Your order is on the way.', severity: 'info'),
};
