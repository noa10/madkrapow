import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:madkrapow_mobile/app.dart';

/// In-memory GotrueAsyncStorage to avoid shared_preferences platform channel
/// in the test environment.
class _InMemoryStorage implements GotrueAsyncStorage {
  final _data = <String, String>{};

  @override
  Future<String?> getItem({required String key}) async => _data[key];

  @override
  Future<void> setItem({required String key, required String value}) async =>
      _data[key] = value;

  @override
  Future<void> removeItem({required String key}) async => _data.remove(key);
}

void main() {
  setUpAll(() async {
    await Supabase.initialize(
      url: 'https://placeholder.supabase.co',
      anonKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDYzNjE4MTMsImV4cCI6MTk2MTkzNzgxM30.placeholder',
      authOptions: FlutterAuthClientOptions(
        localStorage: EmptyLocalStorage(),
        pkceAsyncStorage: _InMemoryStorage(),
      ),
    );
  });

  testWidgets('App renders without errors', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MadKrapowApp()),
    );

    // Allow the splash screen to render
    await tester.pumpAndSettle();

    // The app should render without throwing
    expect(find.byType(MadKrapowApp), findsOneWidget);
  });
}
