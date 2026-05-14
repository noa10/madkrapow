import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:madkrapow_merchant/features/auth/providers/admin_auth_providers.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/advance_status_button.dart';
import 'package:madkrapow_merchant/core/constants/roles.dart';

Widget _wrap({
  required StaffRole? role,
  required String currentStatus,
}) {
  return ProviderScope(
    overrides: [
      staffRoleProvider.overrideWith((ref) => role),
    ],
    child: MaterialApp(
      home: Scaffold(
        body: AdvanceStatusButton(
          orderId: 'test-order',
          currentStatus: currentStatus,
        ),
      ),
    ),
  );
}

void main() {
  group('AdvanceStatusButton', () {
    testWidgets('paid + admin shows "Mark Preparing"', (tester) async {
      await tester.pumpWidget(_wrap(role: StaffRole.admin, currentStatus: 'paid'));
      expect(find.text('Mark Preparing'), findsOneWidget);
    });

    testWidgets('paid + cashier shows "Mark Preparing"', (tester) async {
      await tester
          .pumpWidget(_wrap(role: StaffRole.cashier, currentStatus: 'paid'));
      expect(find.text('Mark Preparing'), findsOneWidget);
    });

    testWidgets('paid + manager shows "Mark Preparing"', (tester) async {
      await tester
          .pumpWidget(_wrap(role: StaffRole.manager, currentStatus: 'paid'));
      expect(find.text('Mark Preparing'), findsOneWidget);
    });

    testWidgets('paid + kitchen does NOT show an advance button', (tester) async {
      await tester
          .pumpWidget(_wrap(role: StaffRole.kitchen, currentStatus: 'paid'));
      expect(find.text('Mark Preparing'), findsNothing);
      expect(find.text('Mark Ready'), findsNothing);
    });

    testWidgets('preparing + any role shows "Mark Ready"', (tester) async {
      for (final role in StaffRole.values) {
        await tester
            .pumpWidget(_wrap(role: role, currentStatus: 'preparing'));
        expect(find.text('Mark Ready'), findsOneWidget,
            reason: 'role=$role should advance preparing → ready');
      }
    });

    testWidgets('delivered shows the green Order Complete pill', (tester) async {
      await tester
          .pumpWidget(_wrap(role: StaffRole.admin, currentStatus: 'delivered'));
      expect(find.text('Order Complete'), findsOneWidget);
    });

    testWidgets('cancelled shows the red Order Cancelled pill', (tester) async {
      await tester
          .pumpWidget(_wrap(role: StaffRole.admin, currentStatus: 'cancelled'));
      expect(find.text('Order Cancelled'), findsOneWidget);
    });

    testWidgets('unknown status renders empty (no crash)', (tester) async {
      await tester.pumpWidget(_wrap(
        role: StaffRole.admin,
        currentStatus: 'mystery_status',
      ));
      // No advance button, no terminal pill — empty SizedBox.shrink.
      expect(find.text('Mark Preparing'), findsNothing);
      expect(find.text('Mark Ready'), findsNothing);
      expect(find.text('Order Complete'), findsNothing);
    });
  });
}
