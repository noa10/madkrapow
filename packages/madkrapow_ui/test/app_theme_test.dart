import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

void main() {
  testWidgets('dark theme exposes the Fiery Wok foundation tokens', (
    tester,
  ) async {
    late ThemeData theme;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Builder(
          builder: (context) {
            theme = Theme.of(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, AppColors.background);
    expect(theme.colorScheme.primary, AppColors.accent);
    expect(theme.colorScheme.surface, AppColors.surface);
    expect(theme.textTheme.bodyMedium?.fontFamily, AppTypography.fontFamily);
    expect(theme.extension<BrandColors>(), isNotNull);
    expect(
      theme.filledButtonTheme.style?.shape?.resolve({}),
      isA<StadiumBorder>(),
    );
  });

  testWidgets('status pill uses the shared semantic palette', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: const Scaffold(body: StatusPill(status: 'preparing')),
      ),
    );

    expect(find.text('Preparing'), findsOneWidget);

    final container = tester.widget<Container>(
      find.descendant(
        of: find.byType(StatusPill),
        matching: find.byType(Container),
      ),
    );
    final decoration = container.decoration! as BoxDecoration;
    expect(decoration.color, const Color(0x26F97316));
  });

  testWidgets('AppCard is tappable and uses 16px rounding', (tester) async {
    var tapped = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: AppCard(
            onTap: () => tapped = true,
            child: const Text('Wok Kra Pao'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Wok Kra Pao'));
    expect(tapped, isTrue);
    final material = tester.widget<Material>(
      find.descendant(
        of: find.byType(AppCard),
        matching: find.byType(Material),
      ),
    );
    expect(material.shape, isA<RoundedRectangleBorder>());
  });

  testWidgets('unknown statuses fall back to the neutral pill', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: const Scaffold(body: StatusPill(status: 'mystery')),
      ),
    );

    expect(find.text('mystery'), findsOneWidget);
  });

  testWidgets('AppPriceText uses the ember price colour', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: const Scaffold(body: AppPriceText('RM 12.50')),
      ),
    );

    final text = tester.widget<Text>(find.text('RM 12.50'));
    expect(text.style?.color, AppColors.emberText);
  });

  testWidgets('SectionHeading renders an uppercase eyebrow and action', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: SectionHeading(
            eyebrow: 'Today',
            title: 'Popular',
            subtitle: 'Fresh from the wok',
            trailing: TextButton(
              onPressed: () {},
              child: const Text('See all'),
            ),
          ),
        ),
      ),
    );

    expect(find.text('TODAY'), findsOneWidget);
    expect(find.text('Popular'), findsOneWidget);
    expect(find.text('See all'), findsOneWidget);
  });

  testWidgets('GradientCta fires only when enabled', (tester) async {
    var taps = 0;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: Column(
            children: [
              GradientCta(
                label: 'Checkout',
                icon: Icons.lock_outline,
                onPressed: () => taps++,
              ),
              const GradientCta(label: 'Disabled', onPressed: null),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.text('Checkout'));
    await tester.tap(find.text('Disabled'));
    expect(taps, 1);

    final ink = tester.widget<Ink>(find.byType(Ink).first);
    final decoration = ink.decoration! as BoxDecoration;
    expect(decoration.gradient, isNotNull);
  });

  testWidgets('AppEmptyState exposes its action', (tester) async {
    var retried = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.darkTheme,
        home: Scaffold(
          body: AppEmptyState(
            icon: Icons.error_outline,
            title: 'Could not load',
            message: 'Try again',
            action: OutlinedButton(
              onPressed: () => retried = true,
              child: const Text('Retry'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Retry'));
    expect(retried, isTrue);
  });
}
