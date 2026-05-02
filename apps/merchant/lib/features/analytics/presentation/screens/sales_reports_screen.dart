import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../data/analytics_models.dart';
import '../../data/sales_reports_repository.dart';
import '../../providers/sales_reports_providers.dart';
import '../../../../generated/database.dart';

/// Applies payment-method and category filters to [data], returning
/// the filtered orders and their order items.
_FilteredOrders _applyFilters(SalesReportData data, WidgetRef ref) {
  final paymentFilter = ref.read(salesPaymentFilterProvider);
  final categoryFilter = ref.read(salesCategoryFilterProvider);

  var orders = [...data.orders];

  if (paymentFilter != null) {
    if (paymentFilter == 'card') {
      orders = orders
          .where(
            (o) =>
                o.stripePaymentIntentId != null &&
                o.stripePaymentIntentId!.isNotEmpty,
          )
          .toList();
    } else if (paymentFilter == 'cash') {
      orders = orders
          .where(
            (o) =>
                o.stripePaymentIntentId == null ||
                o.stripePaymentIntentId!.isEmpty,
          )
          .toList();
    }
  }

  final currentOrderIds = orders.map((o) => o.id).toSet();
  var orderItems = data.orderItems
      .where((oi) => currentOrderIds.contains(oi.orderId))
      .toList();

  if (categoryFilter != null) {
    final menuItemIds = data.menuItems
        .where((mi) => mi.categoryId == categoryFilter)
        .map((mi) => mi.id)
        .toSet();
    final filteredOrderItemIds = orderItems
        .where((oi) => menuItemIds.contains(oi.menuItemId))
        .map((oi) => oi.id)
        .toSet();
    orders = orders.where((o) {
      final oiIds = data.orderItems
          .where((oi) => oi.orderId == o.id)
          .map((oi) => oi.id);
      return oiIds.any((id) => filteredOrderItemIds.contains(id));
    }).toList();
    orderItems = data.orderItems
        .where(
          (oi) => orders.map((o) => o.id).toSet().contains(oi.orderId),
        )
        .toList();
  }

  return _FilteredOrders(orders: orders, orderItems: orderItems);
}

class _FilteredOrders {
  final List<OrdersRow> orders;
  final List<OrderItemsRow> orderItems;

  const _FilteredOrders({required this.orders, required this.orderItems});
}

class SalesReportsScreen extends ConsumerStatefulWidget {
  const SalesReportsScreen({super.key});

  @override
  ConsumerState<SalesReportsScreen> createState() =>
      _SalesReportsScreenState();
}

class _SalesReportsScreenState extends ConsumerState<SalesReportsScreen> {
  @override
  Widget build(BuildContext context) {
    final reportAsync = ref.watch(salesReportProvider);
    // Keep auto-refresh timer alive.
    ref.watch(salesReportAutoRefreshProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sales Reports'),
        actions: [
          IconButton(
            icon: const Icon(Icons.download),
            tooltip: 'Export CSV',
            onPressed:
                reportAsync is AsyncData ? () => _exportCsv() : null,
          ),
        ],
      ),
      body: Column(
        children: [
          const _FilterSection(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () =>
                  ref.read(salesReportProvider.notifier).refresh(),
              child: reportAsync.when(
                loading: () => const _LoadingView(),
                error: (error, stack) => _ErrorView(
                  error: error,
                  onRetry: () =>
                      ref.read(salesReportProvider.notifier).refresh(),
                ),
                data: (reportData) => _ReportContent(data: reportData),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _exportCsv() async {
    final reportData = ref.read(salesReportProvider).valueOrNull;
    if (reportData == null) return;

    final filtered = _applyFilters(reportData, ref);
    final orders = filtered.orders;

    final rows = orders.map((order) {
      return [
        order.orderNumber,
        DateFormat('yyyy-MM-dd HH:mm').format(order.createdAt),
        order.status,
        _formatCentsValue(order.subtotalCents),
        _formatCentsValue(order.deliveryFeeCents),
        _formatCentsValue(order.discountCents),
        _formatCentsValue(order.totalCents),
        (order.stripePaymentIntentId != null &&
                order.stripePaymentIntentId!.isNotEmpty)
            ? 'Card (Stripe)'
            : 'Cash',
      ];
    }).toList();

    final csvContent = StringBuffer();
    csvContent.writeln(
      'Order Number,Date,Status,Subtotal (RM),Delivery Fee (RM),'
      'Discount (RM),Total (RM),Payment Method',
    );
    for (final row in rows) {
      csvContent.writeln(row.map((c) => '"$c"').join(','));
    }

    try {
      final dir = await getTemporaryDirectory();
      final file = File(
        '${dir.path}/sales-report-'
        '${DateFormat('yyyy-MM-dd').format(DateTime.now())}.csv',
      );
      await file.writeAsString(csvContent.toString());
      await Share.shareXFiles(
        [XFile(file.path)],
        text: 'Sales Report',
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to export CSV')),
        );
      }
    }
  }

  String _formatCentsValue(int cents) => formatCents(cents).substring(3);
}

/// Filter section with dropdowns and date pickers.
class _FilterSection extends ConsumerWidget {
  const _FilterSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preset = ref.watch(salesDatePresetProvider);
    final categoryFilter = ref.watch(salesCategoryFilterProvider);
    final paymentFilter = ref.watch(salesPaymentFilterProvider);
    final reportAsync = ref.watch(salesReportProvider);

    final reportData = reportAsync.valueOrNull;
    final categories = reportData != null
        ? reportData.categories
        : <CategoriesRow>[];

    return Card(
      margin: const EdgeInsets.all(12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.filter_list, size: 20),
                const SizedBox(width: 8),
                Text(
                  'Filters',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                SizedBox(
                  width: 180,
                  child: DropdownButtonFormField<DateRangePreset>(
                    initialValue: preset,
                    decoration: const InputDecoration(
                      labelText: 'Date Range',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                    ),
                    items: DateRangePreset.values.map((p) {
                      return DropdownMenuItem(
                        value: p,
                        child: Text(dateRangePresetLabel(p)),
                      );
                    }).toList(),
                    onChanged: (v) {
                      if (v != null) {
                        ref.read(salesDatePresetProvider.notifier).state = v;
                        ref.read(salesReportProvider.notifier).refresh();
                      }
                    },
                  ),
                ),
                if (preset == DateRangePreset.custom) ...[
                  SizedBox(
                    width: 180,
                    child: _DatePickerButton(
                      label: 'Start Date',
                      initialDate: ref.watch(salesCustomStartProvider),
                      onPicked: (d) {
                        ref.read(salesCustomStartProvider.notifier).state = d;
                        ref.read(salesReportProvider.notifier).refresh();
                      },
                    ),
                  ),
                  SizedBox(
                    width: 180,
                    child: _DatePickerButton(
                      label: 'End Date',
                      initialDate: ref.watch(salesCustomEndProvider),
                      onPicked: (d) {
                        ref.read(salesCustomEndProvider.notifier).state = d;
                        ref.read(salesReportProvider.notifier).refresh();
                      },
                    ),
                  ),
                ],
                SizedBox(
                  width: 180,
                  child: DropdownButtonFormField<String?>(
                    initialValue: categoryFilter,
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                        value: null,
                        child: Text('All Categories'),
                      ),
                      ...categories.map((c) => DropdownMenuItem<String?>(
                            value: c.id,
                            child: Text(c.name),
                          )),
                    ],
                    onChanged: (v) {
                      ref.read(salesCategoryFilterProvider.notifier).state = v;
                    },
                  ),
                ),
                SizedBox(
                  width: 180,
                  child: DropdownButtonFormField<String?>(
                    initialValue: paymentFilter,
                    decoration: const InputDecoration(
                      labelText: 'Payment Method',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                    ),
                    items: const [
                      DropdownMenuItem<String?>(
                        value: null,
                        child: Text('All Methods'),
                      ),
                      DropdownMenuItem<String?>(
                        value: 'card',
                        child: Text('Card (Stripe)'),
                      ),
                      DropdownMenuItem<String?>(
                        value: 'cash',
                        child: Text('Cash'),
                      ),
                    ],
                    onChanged: (v) {
                      ref.read(salesPaymentFilterProvider.notifier).state = v;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: reportAsync is AsyncLoading
                  ? null
                  : () => ref.read(salesReportProvider.notifier).refresh(),
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Refresh Report'),
            ),
          ],
        ),
      ),
    );
  }
}

/// A button that shows a date picker and displays the selected date.
class _DatePickerButton extends StatelessWidget {
  final String label;
  final DateTime? initialDate;
  final ValueChanged<DateTime> onPicked;

  const _DatePickerButton({
    required this.label,
    required this.initialDate,
    required this.onPicked,
  });

  @override
  Widget build(BuildContext context) {
    final dateStr = initialDate != null
        ? DateFormat('yyyy-MM-dd').format(initialDate!)
        : 'Select date';

    return OutlinedButton(
      onPressed: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: initialDate ?? DateTime.now(),
          firstDate: DateTime(2020),
          lastDate: DateTime.now().add(const Duration(days: 1)),
        );
        if (picked != null) {
          onPicked(DateTime(picked.year, picked.month, picked.day));
        }
      },
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        alignment: Alignment.centerLeft,
      ),
      child: Text(
        '$label: $dateStr',
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

class _ReportContent extends ConsumerWidget {
  final SalesReportData data;

  const _ReportContent({required this.data});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filtered = _applyFilters(data, ref);

    if (filtered.orders.isEmpty) {
      return const _EmptyView();
    }

    final stats = _computeStats(filtered);
    final menuItemIdToCategory = <String, String>{};
    for (final mi in data.menuItems) {
      menuItemIdToCategory[mi.id] = mi.categoryId;
    }

    final categoryRevenue = <String, int>{};
    for (final oi in filtered.orderItems) {
      final catId = menuItemIdToCategory[oi.menuItemId];
      if (catId != null) {
        categoryRevenue[catId] =
            (categoryRevenue[catId] ?? 0) + oi.lineTotalCents;
      }
    }

    final categoryBreakdown = data.categories
        .map((cat) => _CategoryRevenue(
              name: cat.name,
              revenueCents: categoryRevenue[cat.id] ?? 0,
              percentage: stats.totalRevenue > 0
                  ? ((categoryRevenue[cat.id] ?? 0) / stats.totalRevenue) * 100
                  : 0,
            ))
        .toList()
      ..sort((a, b) => b.revenueCents.compareTo(a.revenueCents));

    final totalRevenue = stats.totalRevenue;
    String formatRm(int cents) => (cents / 100).toStringAsFixed(2);

    final cardOrders = filtered.orders.where(
      (o) =>
          o.stripePaymentIntentId != null &&
          o.stripePaymentIntentId!.isNotEmpty,
    );
    final cashOrders = filtered.orders.where(
      (o) =>
          o.stripePaymentIntentId == null ||
          o.stripePaymentIntentId!.isEmpty,
    );

    final cardRevenue = cardOrders.fold<int>(0, (s, o) => s + o.totalCents);
    final cashRevenue = cashOrders.fold<int>(0, (s, o) => s + o.totalCents);

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      children: [
        // Stats cards
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _StatCard(
              title: 'Total Revenue',
              value: 'RM ${formatRm(totalRevenue)}',
            ),
            _StatCard(
              title: 'Total Orders',
              value: '${stats.totalOrders}',
            ),
            _StatCard(
              title: 'Avg Order Value',
              value: 'RM ${formatRm(stats.avgOrderValue)}',
            ),
            _StatCard(
              title: 'Delivery Fees',
              value: 'RM ${formatRm(stats.totalDeliveryFees)}',
            ),
            _StatCard(
              title: 'Discounts',
              value: 'RM ${formatRm(stats.totalDiscounts)}',
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Revenue by Category + Payment Method Breakdown
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth > 600;
            final childWidth =
                wide ? (constraints.maxWidth - 12) / 2 : constraints.maxWidth;
            return Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                SizedBox(
                  width: childWidth,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Revenue by Category',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 12),
                          if (categoryBreakdown.isNotEmpty)
                            Table(
                              columnWidths: const {
                                0: FlexColumnWidth(3),
                                1: FlexColumnWidth(3),
                                2: FlexColumnWidth(1),
                              },
                              children: [
                                const TableRow(
                                  children: [
                                    _TableHeader('Category'),
                                    _TableHeaderRight('Revenue'),
                                    _TableHeaderRight('%'),
                                  ],
                                ),
                                ...categoryBreakdown.map((cat) => TableRow(
                                      children: [
                                        _TableCell(cat.name),
                                        _TableCellRight(
                                          'RM ${formatRm(cat.revenueCents)}',
                                        ),
                                        _TableCellRight(
                                          '${cat.percentage.toStringAsFixed(1)}%',
                                        ),
                                      ],
                                    )),
                              ],
                            )
                          else
                            const Text(
                              'No data available',
                              style: TextStyle(
                                fontStyle: FontStyle.italic,
                                color: Colors.grey,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  width: childWidth,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Payment Method Breakdown',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 12),
                          Table(
                            columnWidths: const {
                              0: FlexColumnWidth(3),
                              1: FlexColumnWidth(2),
                              2: FlexColumnWidth(3),
                            },
                            children: [
                              const TableRow(
                                children: [
                                  _TableHeader('Method'),
                                  _TableHeaderRight('Orders'),
                                  _TableHeaderRight('Revenue'),
                                ],
                              ),
                              TableRow(
                                children: [
                                  const _TableCell('Card (Stripe)'),
                                  _TableCellRight('${cardOrders.length}'),
                                  _TableCellRight(
                                      'RM ${formatRm(cardRevenue)}'),
                                ],
                              ),
                              TableRow(
                                children: [
                                  const _TableCell('Cash'),
                                  _TableCellRight('${cashOrders.length}'),
                                  _TableCellRight(
                                      'RM ${formatRm(cashRevenue)}'),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 16),

        // Order Details table
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Order Details',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Table(
                    columnWidths: const {
                      0: FixedColumnWidth(90),
                      1: FixedColumnWidth(110),
                      2: FixedColumnWidth(100),
                      3: FixedColumnWidth(80),
                      4: FixedColumnWidth(80),
                      5: FixedColumnWidth(80),
                      6: FixedColumnWidth(80),
                      7: FixedColumnWidth(60),
                    },
                    children: [
                      const TableRow(
                        children: [
                          _TableHeader('Order #'),
                          _TableHeader('Date'),
                          _TableHeader('Status'),
                          _TableHeaderRight('Subtotal'),
                          _TableHeaderRight('Delivery'),
                          _TableHeaderRight('Discount'),
                          _TableHeaderRight('Total'),
                          _TableHeader('Payment'),
                        ],
                      ),
                      ...filtered.orders.take(100).map(
                            (order) => TableRow(
                              children: [
                                _TableCell(order.orderNumber),
                                _TableCell(
                                  DateFormat('MMM dd, HH:mm')
                                      .format(order.createdAt),
                                ),
                                _StatusCell(status: order.status),
                                _TableCellRight(
                                  'RM ${formatRm(order.subtotalCents)}',
                                ),
                                _TableCellRight(
                                  'RM ${formatRm(order.deliveryFeeCents)}',
                                ),
                                _TableCellRight(
                                  '-RM ${formatRm(order.discountCents)}',
                                  color: Colors.redAccent,
                                ),
                                _TableCellRight(
                                  'RM ${formatRm(order.totalCents)}',
                                ),
                                _TableCell(
                                  (order.stripePaymentIntentId != null &&
                                          order.stripePaymentIntentId!
                                              .isNotEmpty)
                                      ? 'Card'
                                      : 'Cash',
                                ),
                              ],
                            ),
                          ),
                    ],
                  ),
                ),
                if (filtered.orders.length > 100)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      'Showing first 100 of ${filtered.orders.length} orders. '
                      'Export to CSV for complete data.',
                      style: const TextStyle(
                        fontStyle: FontStyle.italic,
                        color: Colors.grey,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

_Stats _computeStats(_FilteredOrders filtered) {
  final orders = filtered.orders;
  final totalRevenue = orders.fold<int>(0, (s, o) => s + o.totalCents);
  final totalOrders = orders.length;
  final avgOrderValue = totalOrders > 0 ? totalRevenue ~/ totalOrders : 0;
  final totalDeliveryFees =
      orders.fold<int>(0, (s, o) => s + o.deliveryFeeCents);
  final totalDiscounts =
      orders.fold<int>(0, (s, o) => s + o.discountCents);

  return _Stats(
    totalRevenue: totalRevenue,
    totalOrders: totalOrders,
    avgOrderValue: avgOrderValue,
    totalDeliveryFees: totalDeliveryFees,
    totalDiscounts: totalDiscounts,
  );
}

class _CategoryRevenue {
  final String name;
  final int revenueCents;
  final double percentage;

  const _CategoryRevenue({
    required this.name,
    required this.revenueCents,
    required this.percentage,
  });
}

class _Stats {
  final int totalRevenue;
  final int totalOrders;
  final int avgOrderValue;
  final int totalDeliveryFees;
  final int totalDiscounts;

  const _Stats({
    required this.totalRevenue,
    required this.totalOrders,
    required this.avgOrderValue,
    required this.totalDeliveryFees,
    required this.totalDiscounts,
  });
}

// --- Reusable table / card widgets ---

class _StatCard extends StatelessWidget {
  final String title;
  final String value;

  const _StatCard({required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 170,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.color
                      ?.withAlpha(180),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TableHeader extends StatelessWidget {
  final String text;
  const _TableHeader(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(
        text,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 12,
          color: Theme.of(context)
              .textTheme
              .bodySmall
              ?.color
              ?.withAlpha(180),
        ),
      ),
    );
  }
}

class _TableHeaderRight extends StatelessWidget {
  final String text;
  const _TableHeaderRight(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(
        text,
        textAlign: TextAlign.right,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 12,
          color: Theme.of(context)
              .textTheme
              .bodySmall
              ?.color
              ?.withAlpha(180),
        ),
      ),
    );
  }
}

class _TableCell extends StatelessWidget {
  final String text;
  const _TableCell(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(text, style: const TextStyle(fontSize: 13)),
    );
  }
}

class _TableCellRight extends StatelessWidget {
  final String text;
  final Color? color;
  const _TableCellRight(this.text, {this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(
        text,
        textAlign: TextAlign.right,
        style: TextStyle(fontSize: 13, color: color),
      ),
    );
  }
}

class _StatusCell extends StatelessWidget {
  final String status;
  const _StatusCell({required this.status});

  @override
  Widget build(BuildContext context) {
    final (bgColor, fgColor) = switch (status) {
      'completed' || 'delivered' =>
        (Colors.green.shade800, Colors.green.shade200),
      'paid' => (Colors.blue.shade800, Colors.blue.shade200),
      _ => (Colors.orange.shade800, Colors.orange.shade200),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: bgColor.withAlpha(180),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: fgColor.withAlpha(80)),
        ),
        child: Text(
          status,
          style: TextStyle(fontSize: 11, color: fgColor),
        ),
      ),
    );
  }
}

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Loading sales report...'),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final Object error;
  final VoidCallback onRetry;

  const _ErrorView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.red),
          const SizedBox(height: 8),
          Text(error.toString()),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inbox_outlined, size: 48, color: Colors.grey),
          SizedBox(height: 12),
          Text(
            'No orders found for the selected filters',
            style: TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }
}