import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/how_it_works_section.dart';
import 'package:madkrapow_mobile/features/menu/presentation/widgets/how_to_order_section.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

void main() {
  testWidgets('HowToOrderSection renders both channels and browses the menu', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var browsed = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: SingleChildScrollView(
            child: HowToOrderSection(onBrowseMenu: () => browsed = true),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Two ways to order'), findsOneWidget);
    expect(find.text('Order on GrabFood'), findsOneWidget);
    expect(find.text('Order direct'), findsOneWidget);
    expect(find.text('Available on the Grab app'), findsOneWidget);

    await tester.ensureVisible(find.text('Browse the menu'));
    await tester.tap(find.text('Browse the menu'));
    expect(browsed, isTrue);
  });

  testWidgets('HowItWorksSection renders all four steps', (tester) async {
    tester.view.physicalSize = const Size(393, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: const Scaffold(
          body: SingleChildScrollView(child: HowItWorksSection()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('How it works'), findsOneWidget);
    expect(find.text('Pick your dish'), findsOneWidget);
    expect(find.text('Enter your address'), findsOneWidget);
    expect(find.text('Review & pay'), findsOneWidget);
    expect(find.text('Wait for delivery'), findsOneWidget);
    expect(find.text('STEP 01'), findsOneWidget);
    expect(find.text('STEP 04'), findsOneWidget);
  });
}
