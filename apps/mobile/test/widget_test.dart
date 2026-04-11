import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_mobile/main.dart';

void main() {
  testWidgets('App renders home page', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MadKrapowApp()),
    );

    expect(find.text('Mad Krapow'), findsWidgets);
    expect(find.byIcon(Icons.local_fire_department), findsOneWidget);
  });
}
