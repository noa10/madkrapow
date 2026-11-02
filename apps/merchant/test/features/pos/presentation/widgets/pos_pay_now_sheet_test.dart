import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/company_qr_panel.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_pay_now_sheet.dart';

const _amountCents = 1250;

/// Opens the pay-now sheet and leaves it on screen.
Future<void> _pump(
  WidgetTester tester, {
  required PosPaymentMethod method,
  required Future<String?> Function() onConfirm,
  String label = 'Table T1 · 2 pax',
  bool outcomeUncertain = false,
  void Function(Future<bool> sheet)? onSheet,
}) async {
  // A tall surface so the whole sheet (panel and buttons) is laid out without
  // the confirm button falling off the bottom.
  tester.view.physicalSize = const Size(800, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () {
                final sheet = showPosPayNowSheet(
                  context,
                  method: method,
                  amountCents: _amountCents,
                  label: label,
                  outcomeUncertain: outcomeUncertain,
                  onConfirm: onConfirm,
                );
                onSheet?.call(sheet);
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('cash sheet shows the amount and asks for the cash', (
    tester,
  ) async {
    await _pump(
      tester,
      method: PosPaymentMethod.cash,
      onConfirm: () async => null,
    );

    expect(find.text('Collect cash'), findsOneWidget);
    expect(find.text('RM 12.50'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Cash received'), findsOneWidget);
  });

  testWidgets('QR sheet shows the QR panel and the amount', (tester) async {
    await _pump(
      tester,
      method: PosPaymentMethod.qrPay,
      onConfirm: () async => null,
    );

    expect(find.text('Scan to pay'), findsOneWidget);
    expect(find.byType(CompanyQrPanel), findsOneWidget);
    expect(find.text('RM 12.50'), findsOneWidget);
    expect(
      find.widgetWithText(FilledButton, 'Payment received'),
      findsOneWidget,
    );
  });

  testWidgets('confirms only once when the button is tapped twice', (
    tester,
  ) async {
    var calls = 0;
    // A confirm that never completes keeps the sheet busy, so the second tap
    // has to be rejected by the sheet's own guard.
    final pending = Completer<String?>();

    await _pump(
      tester,
      method: PosPaymentMethod.cash,
      onConfirm: () {
        calls++;
        return pending.future;
      },
    );

    // Both taps land in the same frame: the sheet sets its busy flag
    // synchronously, so the second tap must not reach onConfirm again.
    await tester.tap(find.text('Cash received'));
    // The sheet has not rebuilt yet, so the second tap hits the same button.
    expect(find.text('Cash received'), findsOneWidget);
    await tester.tap(find.text('Cash received'));
    await tester.pump();

    expect(calls, 1);
  });

  testWidgets('closes the sheet and reports success when the charge lands', (
    tester,
  ) async {
    Future<bool>? sheet;
    await _pump(
      tester,
      method: PosPaymentMethod.cash,
      onConfirm: () async => null,
      onSheet: (future) => sheet = future,
    );

    await tester.tap(find.text('Cash received'));
    await tester.pumpAndSettle();

    // The sheet is gone, and it reported that an order was created — that
    // boolean is what closes the sale sheet on the narrow layout. A sheet
    // that popped with `false` would leave the cashier on an empty sale with
    // no confirmation.
    expect(find.text('Collect cash'), findsNothing);
    expect(await sheet, isTrue);
  });

  testWidgets('requires an order check before retrying an uncertain payment', (
    tester,
  ) async {
    var calls = 0;
    await _pump(
      tester,
      method: PosPaymentMethod.cash,
      onConfirm: () async {
        calls++;
        if (calls == 1) throw TimeoutException('response lost');
        return null;
      },
    );

    await tester.tap(find.text('Cash received'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash received'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(calls, 1);
    expect(find.text('Check orders first'), findsOneWidget);
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('Cancel'),
      ),
    );
    await tester.pumpAndSettle();
    expect(calls, 1);

    await tester.tap(find.text('Cash received'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Order not found — retry'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Collect cash'), findsNothing);
  });

  testWidgets('reopening an uncertain sale still requires an order check', (
    tester,
  ) async {
    var calls = 0;
    await _pump(
      tester,
      method: PosPaymentMethod.cash,
      outcomeUncertain: true,
      onConfirm: () async {
        calls++;
        return null;
      },
    );
    await tester.tap(find.text('Cash received'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(calls, 0);
    expect(find.text('Check orders first'), findsOneWidget);
  });

  testWidgets('cannot be dragged away while the create is in flight', (
    tester,
  ) async {
    final pending = Completer<String?>();
    await _pump(
      tester,
      method: PosPaymentMethod.cash,
      onConfirm: () => pending.future,
    );

    await tester.tap(find.text('Cash received'));
    await tester.pump();
    await tester.drag(find.byType(BottomSheet), const Offset(0, 800));
    // The busy spinner animates forever, so pumpAndSettle cannot be used.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // A dragged-away sheet would let the cashier clear and re-ring while the
    // first order may still be created.
    expect(find.text('Collect cash'), findsOneWidget);

    pending.complete(null);
    await tester.pumpAndSettle();
  });

  testWidgets('keeps the sheet open and shows the error when confirm fails', (
    tester,
  ) async {
    await _pump(
      tester,
      method: PosPaymentMethod.cash,
      onConfirm: () async => 'Could not record the order: session expired',
    );

    await tester.tap(find.text('Cash received'));
    await tester.pumpAndSettle();

    // The sheet stays open with its own error banner — a snackbar would sit
    // underneath the modal barrier and look like nothing happened.
    expect(find.text('Collect cash'), findsOneWidget);
    expect(
      find.text('Could not record the order: session expired'),
      findsOneWidget,
    );
  });
}
