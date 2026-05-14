/// Public API for the canonical order-status spec.
///
/// All values are generated from `order_status.json` into `order_status.g.dart`.
/// CI parity (`npm run lint:parity`) validates the generated output.

import 'order_status.g.dart';

/// Mirrors the SQL CHECK constraint at
/// `supabase/migrations/008_scheduled_bulk_orders.sql:9-12`.
enum OrderStatus {
  pending,
  paid,
  accepted,
  preparing,
  ready,
  pickedUp,
  delivered,
  cancelled,
}

/// Delivery type — affects the customer label for `picked_up`.
enum DeliveryType { delivery, selfPickup }

/// Color role; per-platform mapping to design tokens lives in the consumer.
enum OrderStatusColorRole { primary, success, info, warning, danger, neutral }

/// Staff role used when computing the next forward transition for the
/// merchant app.
enum StaffRoleForOrders { kitchen, cashier, admin, manager }

extension OrderStatusWire on OrderStatus {
  /// Wire string (DB value).
  String get wire {
    switch (this) {
      case OrderStatus.pending:
        return 'pending';
      case OrderStatus.paid:
        return 'paid';
      case OrderStatus.accepted:
        return 'accepted';
      case OrderStatus.preparing:
        return 'preparing';
      case OrderStatus.ready:
        return 'ready';
      case OrderStatus.pickedUp:
        return 'picked_up';
      case OrderStatus.delivered:
        return 'delivered';
      case OrderStatus.cancelled:
        return 'cancelled';
    }
  }
}

/// Parse a wire string into an [OrderStatus]. Returns null for unknown values.
OrderStatus? parseOrderStatus(String? raw) {
  switch (raw) {
    case 'pending':
      return OrderStatus.pending;
    case 'paid':
      return OrderStatus.paid;
    case 'accepted':
      return OrderStatus.accepted;
    case 'preparing':
      return OrderStatus.preparing;
    case 'ready':
      return OrderStatus.ready;
    case 'picked_up':
      return OrderStatus.pickedUp;
    case 'delivered':
      return OrderStatus.delivered;
    case 'cancelled':
      return OrderStatus.cancelled;
    default:
      return null;
  }
}

/// Customer-facing label. For `picked_up`, the label depends on
/// [deliveryType] — "On the way" for delivery, "Picked Up" for self-pickup.
String customerLabel(OrderStatus status, DeliveryType deliveryType) {
  if (status == OrderStatus.pickedUp) {
    final key = deliveryType == DeliveryType.delivery
        ? 'picked_up_delivery'
        : 'picked_up_self_pickup';
    return kCustomerLabels[key] ?? 'Picked Up';
  }
  return kCustomerLabels[status.wire] ?? status.wire;
}

/// Customer-facing label given a raw wire string. Falls back to "Unknown" for
/// unrecognised values so UI surfaces never crash on schema drift.
String customerLabelFromWire(String? raw, DeliveryType deliveryType) {
  final s = parseOrderStatus(raw);
  if (s == null) return 'Unknown';
  return customerLabel(s, deliveryType);
}

/// Admin/merchant-facing label.
String adminLabel(OrderStatus status) =>
    kAdminLabels[status.wire] ?? status.wire;

/// Admin/merchant-facing label from a raw wire string. Falls back to
/// "Unknown".
String adminLabelFromWire(String? raw) {
  final s = parseOrderStatus(raw);
  if (s == null) return 'Unknown';
  return adminLabel(s);
}

/// Stepper label (used by both customer and admin steppers).
String stepLabel(OrderStatus status) =>
    kStepLabels[status.wire] ?? status.wire;

/// Color role for a status.
OrderStatusColorRole colorRole(OrderStatus status) {
  switch (kColorRoles[status.wire]) {
    case 'primary':
      return OrderStatusColorRole.primary;
    case 'success':
      return OrderStatusColorRole.success;
    case 'info':
      return OrderStatusColorRole.info;
    case 'warning':
      return OrderStatusColorRole.warning;
    case 'danger':
      return OrderStatusColorRole.danger;
    default:
      return OrderStatusColorRole.neutral;
  }
}

/// Color role for an unknown wire string falls back to neutral.
OrderStatusColorRole colorRoleFromWire(String? raw) {
  final s = parseOrderStatus(raw);
  if (s == null) return OrderStatusColorRole.neutral;
  return colorRole(s);
}

/// Centralised order-flow logic. Use these helpers from widgets and
/// repositories instead of hand-coding per-screen lists.
class OrderStatusFlow {
  OrderStatusFlow._();

  /// Steps shown in the customer + admin steppers (no `accepted`).
  static List<OrderStatus> get steps =>
      kFlowSteps.map((w) => parseOrderStatus(w)!).toList(growable: false);

  /// Steps shown in the merchant admin stepper (currently identical to
  /// `steps`; kept as a separate accessor for forward compatibility).
  static List<OrderStatus> get adminSteps =>
      kAdminFlowSteps.map((w) => parseOrderStatus(w)!).toList(growable: false);

  /// Statuses where the order is finished (no further mutation expected).
  static Set<OrderStatus> get terminal => kTerminalStatuses
      .map((w) => parseOrderStatus(w)!)
      .toSet();

  /// Statuses from which an admin can move to `cancelled`.
  static Set<OrderStatus> get cancellable => kCancellableStatuses
      .map((w) => parseOrderStatus(w)!)
      .toSet();

  /// Notification allowlist (Telegram/WhatsApp/etc.). Pending/paid/accepted
  /// are intentionally suppressed.
  static Set<OrderStatus> get notify =>
      kNotifyStatuses.map((w) => parseOrderStatus(w)!).toSet();

  static bool isTerminal(OrderStatus status) => terminal.contains(status);

  static bool isTerminalWire(String? raw) {
    final s = parseOrderStatus(raw);
    return s != null && terminal.contains(s);
  }

  /// "Completed" = picked_up OR delivered. Used by analytics-style summaries.
  static bool isCompleted(OrderStatus status) =>
      status == OrderStatus.pickedUp || status == OrderStatus.delivered;

  static bool isCompletedWire(String? raw) {
    final s = parseOrderStatus(raw);
    return s != null && isCompleted(s);
  }

  static bool isCancellable(OrderStatus status) => cancellable.contains(status);

  static bool isCancellableWire(String? raw) {
    final s = parseOrderStatus(raw);
    return s != null && cancellable.contains(s);
  }

  /// Forward transitions including cancel. Mirrors the server's
  /// VALID_TRANSITIONS map.
  static List<OrderStatus> forwardFrom(OrderStatus status) {
    return (kForwardTransitions[status.wire] ?? const [])
        .map((w) => parseOrderStatus(w))
        .whereType<OrderStatus>()
        .toList(growable: false);
  }

  /// Next forward (non-cancel) transition for the merchant Advance button,
  /// gated by staff role. Returns null when there is no advance from the
  /// current status (e.g. `delivered`, `cancelled`, or `paid` for kitchen).
  static OrderStatus? nextForwardForAdmin(
    OrderStatus current,
    StaffRoleForOrders? role,
  ) {
    final useKitchenMap = role == StaffRoleForOrders.kitchen;
    final raw = useKitchenMap
        ? (kKitchenTransitions[current.wire] ?? const [])
        : (kAdminTransitions[current.wire] ?? const [])
            .where((w) => w != 'cancelled')
            .toList(growable: false);
    if (raw.isEmpty) return null;
    return parseOrderStatus(raw.first);
  }
}

/// Dispatch banner copy (Lalamove side). Surfaced when
/// `lalamove_shipments.dispatch_status` reaches a noteworthy state.
DispatchBannerCopy? dispatchBanner(String? dispatchStatus) {
  if (dispatchStatus == null) return null;
  return kDispatchMessages[dispatchStatus];
}
