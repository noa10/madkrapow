import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/orders/presentation/widgets/status_stepper.dart';
import 'package:madkrapow_orders/order_status.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  group('StatusStepper', () {
    testWidgets('renders the six customer steps for delivery', (tester) async {
      await tester.pumpWidget(_wrap(const StatusStepper(currentStatus: 'paid')));
      // Customer-facing labels per the spec
      expect(find.text('Pending Payment'), findsOneWidget);
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text('Preparing'), findsOneWidget);
      expect(find.text('Ready'), findsOneWidget);
      // 'On the way' is the customer label for picked_up + delivery
      expect(find.text('On the way'), findsOneWidget);
      expect(find.text('Delivered'), findsOneWidget);
      // Accepted is hidden from the standard stepper
      expect(find.text('Accepted'), findsNothing);
    });

    testWidgets('renders the same six steps with self_pickup label override',
        (tester) async {
      await tester.pumpWidget(_wrap(const StatusStepper(
        currentStatus: 'paid',
        deliveryType: DeliveryType.selfPickup,
      )));
      // Self-pickup uses 'Picked Up' instead of 'On the way'
      expect(find.text('Picked Up'), findsOneWidget);
      expect(find.text('On the way'), findsNothing);
    });

    testWidgets('renders an unknown-status banner instead of crashing',
        (tester) async {
      await tester
          .pumpWidget(_wrap(const StatusStepper(currentStatus: 'mystery_status')));
      // Falls back to "Unknown" via customerLabelFromWire
      expect(find.textContaining('Status:'), findsOneWidget);
      expect(find.textContaining('Unknown'), findsOneWidget);
      // No stepper steps appear when unknown
      expect(find.text('Paid'), findsNothing);
    });
  });
}
