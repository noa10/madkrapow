import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_mobile/app.dart';

void main() {
  testWidgets('App renders without errors', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MadKrapowApp()),
    );

    // The app should render without throwing
    expect(find.byType(MadKrapowApp), findsOneWidget);
  });
}
