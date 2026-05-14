import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_orders/order_status.dart';

void main() {
  group('OrderStatus parsing', () {
    test('parseOrderStatus round-trips wire values', () {
      for (final s in OrderStatus.values) {
        final parsed = parseOrderStatus(s.wire);
        expect(parsed, equals(s), reason: 'failed for ${s.wire}');
      }
    });

    test('parseOrderStatus returns null for unknown', () {
      expect(parseOrderStatus('mystery'), isNull);
      expect(parseOrderStatus(null), isNull);
      expect(parseOrderStatus(''), isNull);
    });

    test('canonical list matches the eight schema values in order', () {
      expect(OrderStatus.values.map((s) => s.wire).toList(), equals([
        'pending',
        'paid',
        'accepted',
        'preparing',
        'ready',
        'picked_up',
        'delivered',
        'cancelled',
      ]));
    });
  });

  group('labels', () {
    test('customerLabel respects deliveryType for picked_up', () {
      expect(
        customerLabel(OrderStatus.pickedUp, DeliveryType.delivery),
        equals('On the way'),
      );
      expect(
        customerLabel(OrderStatus.pickedUp, DeliveryType.selfPickup),
        equals('Picked Up'),
      );
    });

    test('customerLabel uses "Pending Payment" for pending', () {
      expect(
        customerLabel(OrderStatus.pending, DeliveryType.delivery),
        equals('Pending Payment'),
      );
    });

    test('customerLabelFromWire falls back to Unknown', () {
      expect(
        customerLabelFromWire('mystery', DeliveryType.delivery),
        equals('Unknown'),
      );
    });

    test('adminLabel uses "Pending"', () {
      expect(adminLabel(OrderStatus.pending), equals('Pending'));
      expect(adminLabel(OrderStatus.pickedUp), equals('Picked Up'));
    });

    test('adminLabelFromWire falls back to Unknown', () {
      expect(adminLabelFromWire('mystery'), equals('Unknown'));
    });
  });

  group('color roles', () {
    test('colorRole maps each status', () {
      expect(colorRole(OrderStatus.pending), OrderStatusColorRole.warning);
      expect(colorRole(OrderStatus.paid), OrderStatusColorRole.info);
      expect(colorRole(OrderStatus.preparing), OrderStatusColorRole.primary);
      expect(colorRole(OrderStatus.ready), OrderStatusColorRole.success);
      expect(colorRole(OrderStatus.delivered), OrderStatusColorRole.success);
      expect(colorRole(OrderStatus.cancelled), OrderStatusColorRole.danger);
    });

    test('colorRoleFromWire falls back to neutral', () {
      expect(colorRoleFromWire('mystery'), OrderStatusColorRole.neutral);
      expect(colorRoleFromWire(null), OrderStatusColorRole.neutral);
    });
  });

  group('OrderStatusFlow', () {
    test('steps does NOT contain accepted', () {
      expect(OrderStatusFlow.steps.contains(OrderStatus.accepted), isFalse);
    });

    test('steps starts at pending and ends at delivered', () {
      expect(OrderStatusFlow.steps.first, OrderStatus.pending);
      expect(OrderStatusFlow.steps.last, OrderStatus.delivered);
      expect(OrderStatusFlow.steps.length, 6);
    });

    test('terminal == {delivered, cancelled}', () {
      expect(
        OrderStatusFlow.terminal,
        equals({OrderStatus.delivered, OrderStatus.cancelled}),
      );
    });

    test('cancellable matches forward-transition map', () {
      final fromTransitions = OrderStatus.values
          .where(
            (s) => OrderStatusFlow.forwardFrom(s).contains(OrderStatus.cancelled),
          )
          .toSet();
      expect(OrderStatusFlow.cancellable, equals(fromTransitions));
    });

    test('isTerminal / isCancellable', () {
      expect(OrderStatusFlow.isTerminal(OrderStatus.delivered), isTrue);
      expect(OrderStatusFlow.isTerminal(OrderStatus.preparing), isFalse);
      expect(OrderStatusFlow.isCancellable(OrderStatus.preparing), isTrue);
      expect(OrderStatusFlow.isCancellable(OrderStatus.delivered), isFalse);
    });

    test('isCompleted treats picked_up and delivered as completed', () {
      expect(OrderStatusFlow.isCompleted(OrderStatus.pickedUp), isTrue);
      expect(OrderStatusFlow.isCompleted(OrderStatus.delivered), isTrue);
      expect(OrderStatusFlow.isCompleted(OrderStatus.cancelled), isFalse);
      expect(OrderStatusFlow.isCompleted(OrderStatus.preparing), isFalse);
    });

    test('nextForwardForAdmin: paid → preparing for admin/cashier/manager', () {
      for (final role in const [
        StaffRoleForOrders.admin,
        StaffRoleForOrders.cashier,
        StaffRoleForOrders.manager,
      ]) {
        expect(
          OrderStatusFlow.nextForwardForAdmin(OrderStatus.paid, role),
          OrderStatus.preparing,
          reason: 'role $role should advance paid → preparing',
        );
      }
    });

    test('nextForwardForAdmin: kitchen cannot advance from paid', () {
      expect(
        OrderStatusFlow.nextForwardForAdmin(
          OrderStatus.paid,
          StaffRoleForOrders.kitchen,
        ),
        isNull,
      );
    });

    test('nextForwardForAdmin: preparing → ready for any role', () {
      for (final role in StaffRoleForOrders.values) {
        expect(
          OrderStatusFlow.nextForwardForAdmin(OrderStatus.preparing, role),
          OrderStatus.ready,
        );
      }
    });

    test('nextForwardForAdmin: ready/delivered/cancelled have no forward', () {
      for (final s in const [
        OrderStatus.ready,
        OrderStatus.delivered,
        OrderStatus.cancelled,
      ]) {
        expect(
          OrderStatusFlow.nextForwardForAdmin(s, StaffRoleForOrders.admin),
          isNull,
          reason: 's=$s',
        );
      }
    });

    test('notify suppresses pending/paid/accepted', () {
      expect(OrderStatusFlow.notify.contains(OrderStatus.pending), isFalse);
      expect(OrderStatusFlow.notify.contains(OrderStatus.paid), isFalse);
      expect(OrderStatusFlow.notify.contains(OrderStatus.accepted), isFalse);
      expect(OrderStatusFlow.notify.contains(OrderStatus.preparing), isTrue);
      expect(OrderStatusFlow.notify.contains(OrderStatus.cancelled), isTrue);
    });
  });

  group('dispatchBanner', () {
    test('returns copy for manual_review and failed', () {
      final mr = dispatchBanner('manual_review');
      expect(mr, isNotNull);
      expect(mr!.title, contains('manual review'));
      expect(mr.severity, 'danger');

      final f = dispatchBanner('failed');
      expect(f, isNotNull);
      expect(f!.severity, 'danger');
    });

    test('returns null for unknown dispatch status', () {
      expect(dispatchBanner('cosmic_event'), isNull);
      expect(dispatchBanner(null), isNull);
    });
  });
}
