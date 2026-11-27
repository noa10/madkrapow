import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/orders/presentation/widgets/orders_status_tabs.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

void main() {
  testWidgets('renders pill tabs and syncs taps with the TabController', (
    tester,
  ) async {
    await tester.pumpWidget(const _TabsHost());

    final tabs = tester.widget<OrdersStatusTabs>(find.byType(OrdersStatusTabs));
    expect(tabs.controller.index, 0);
    expect(
      tester.widget<Text>(find.text('Preparing')).style?.color,
      AppColors.onAccent,
    );
    expect(
      tester.widget<Text>(find.text('Ready')).style?.color,
      AppColors.muted,
    );

    await tester.tap(find.text('Ready'));
    await tester.pumpAndSettle();

    expect(tabs.controller.index, 1);
    expect(
      tester.widget<Text>(find.text('Ready')).style?.color,
      AppColors.onAccent,
    );
    expect(
      tester.widget<Text>(find.text('Preparing')).style?.color,
      AppColors.muted,
    );
  });

  testWidgets('stretches the four tabs across the full bar', (tester) async {
    await tester.binding.setSurfaceSize(const Size(400, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const _TabsHost());

    // 400 wide, minus 32 of side padding and 24 of gaps, split four ways.
    for (final label in ['Preparing', 'Ready', 'Upcoming', 'History']) {
      final pill = find
          .ancestor(of: find.text(label), matching: find.byType(InkWell))
          .first;
      expect(tester.getSize(pill).width, closeTo(86, 0.5));
    }
  });
}

class _TabsHost extends StatefulWidget {
  const _TabsHost();

  @override
  State<_TabsHost> createState() => _TabsHostState();
}

class _TabsHostState extends State<_TabsHost>
    with SingleTickerProviderStateMixin {
  late final TabController _controller = TabController(length: 4, vsync: this);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: AppTheme.darkTheme,
      home: Scaffold(
        appBar: AppBar(
          title: const Text('Orders'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(54),
            child: OrdersStatusTabs(
              controller: _controller,
              labels: const ['Preparing', 'Ready', 'Upcoming', 'History'],
            ),
          ),
        ),
      ),
    );
  }
}
