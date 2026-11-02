import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_models.dart';
import 'package:madkrapow_merchant/features/pos/models/pos_tables.dart';
import 'package:madkrapow_merchant/features/pos/presentation/widgets/pos_settle_sheet.dart';

const _target = PosSettleTarget(
  kind: PosSettleKind.order,
  id: 'o1',
  label: 'MK-001',
  context: 'Table T1',
  amountCents: 2500,
  orderCount: 1,
  orderIds: ['o1'],
);

void main() {
  testWidgets('cash confirm fires once and keeps the sheet busy', (
    tester,
  ) async {
    final calls = <PosPaymentMethod>[];
    final pending = Completer<String?>();
    bool? result;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await showPosSettleSheet(
                  context,
                  target: _target,
                  onConfirm: (method) {
                    calls.add(method);
                    return pending.future;
                  },
                );
              },
              child: const Text('Open settle'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open settle'));
    await tester.pumpAndSettle();
    expect(find.text('Collect payment'), findsOneWidget);

    await tester.tap(find.text('Cash'));
    await tester.pump();
    // The busy guard disables both method buttons, so a second tap while the
    // request is in flight must not collect a second time.
    await tester.tap(find.text('Cash'));
    await tester.pump();

    expect(calls, [PosPaymentMethod.cash]);

    pending.complete(null);
    await tester.pumpAndSettle();

    expect(result, isTrue);
    expect(find.text('Collect payment'), findsNothing);
  });

  testWidgets('cannot be dragged away while the settle is in flight', (
    tester,
  ) async {
    final pending = Completer<String?>();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showPosSettleSheet(
                context,
                target: _target,
                onConfirm: (_) => pending.future,
              ),
              child: const Text('Open settle'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open settle'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash'));
    await tester.pump();
    await tester.drag(find.byType(BottomSheet), const Offset(0, 800));
    // The busy spinner animates forever, so pumpAndSettle cannot be used.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // Dismissing the sheet mid-request would hide a collection that may already
    // have been recorded.
    expect(find.text('Collect payment'), findsOneWidget);

    pending.complete(null);
    await tester.pumpAndSettle();
  });

  testWidgets('a failed confirm keeps the sheet open with the message', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showPosSettleSheet(
                context,
                target: _target,
                onConfirm: (_) async => 'Table changed — try again.',
              ),
              child: const Text('Open settle'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open settle'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash'));
    await tester.pumpAndSettle();

    expect(find.text('Table changed — try again.'), findsOneWidget);
    expect(find.text('Collect payment'), findsOneWidget);
  });
}
