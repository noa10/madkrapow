import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../config/env.dart';
import '../../../../core/utils/auth_exceptions.dart';
import '../../data/pos_api_client.dart';
import '../../models/pos_models.dart';
import '../../providers/pos_providers.dart';
import '../widgets/pos_ui.dart';
import '../widgets/table_form_sheet.dart';
import '../widgets/table_qr_card.dart';
import '../widgets/table_qr_share.dart';

/// Floor-plan management: add/edit tables, toggle QR ordering and print codes.
class TablesManagementScreen extends ConsumerStatefulWidget {
  const TablesManagementScreen({super.key});

  @override
  ConsumerState<TablesManagementScreen> createState() =>
      _TablesManagementScreenState();
}

class _TablesManagementScreenState
    extends ConsumerState<TablesManagementScreen> {
  String? _busyId;
  bool _refreshing = false;

  /// Public web origin embedded in every table QR.
  String get _baseUrl => AppEnv.webApiUrl.replaceAll(RegExp(r'/+$'), '');

  Future<void> _refresh() async {
    if (!mounted || _refreshing) return;
    setState(() => _refreshing = true);
    try {
      ref.invalidate(allTablesProvider);
      // The POS screen stays mounted underneath this pushed route, so its
      // board provider would otherwise keep serving the pre-edit floor plan.
      ref.invalidate(posBoardProvider);
      await ref.read(allTablesProvider.future);
    } catch (_) {
      // The provider renders its own error state.
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  Future<void> _addTable() async {
    final saved = await showTableFormSheet(context);
    if (!saved || !mounted) return;
    showPosSnackBar(context, 'Table saved');
    await _refresh();
  }

  Future<void> _editTable(TableWithToken table) async {
    final saved = await showTableFormSheet(context, table: table);
    if (!saved || !mounted) return;
    showPosSnackBar(context, 'Table saved');
    await _refresh();
  }

  Future<void> _toggleActive(TableWithToken table) async {
    if (_busyId != null) return;
    setState(() => _busyId = table.id);
    try {
      await ref.read(posRepositoryProvider).updateTable(table.id, {
        'is_active': !table.isActive,
      });
      if (!mounted) return;
      showPosSnackBar(
        context,
        table.isActive ? 'Table deactivated' : 'Table activated',
      );
      await _refresh();
    } on PosApiException catch (error) {
      if (mounted) {
        showPosSnackBar(
          context,
          'Could not update table: ${error.message}',
          error: true,
        );
      }
    } on AuthRequiredException catch (error) {
      if (mounted) showPosSnackBar(context, error.message, error: true);
    } catch (_) {
      if (mounted) {
        showPosSnackBar(
          context,
          'Network error — check the connection and try again.',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _rotateQr(TableWithToken table) async {
    if (_busyId != null) return;
    final confirmed = await showPosConfirmDialog(
      context,
      title: 'Rotate QR for ${table.label}?',
      message:
          'The current QR code and link stop working immediately. Reprint and '
          'replace the table’s QR after rotating.',
      confirmLabel: 'Rotate QR',
      warning: true,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busyId = table.id);
    try {
      await ref.read(posRepositoryProvider).rotateTableToken(table.id);
      if (!mounted) return;
      showPosSnackBar(
        context,
        'QR code rotated — previously printed codes for this table no longer '
        'work.',
      );
      await _refresh();
    } on PosApiException catch (error) {
      if (mounted) {
        showPosSnackBar(
          context,
          'Could not rotate the QR: ${error.message}',
          error: true,
        );
      }
    } on AuthRequiredException catch (error) {
      if (mounted) showPosSnackBar(context, error.message, error: true);
    } catch (_) {
      if (mounted) {
        showPosSnackBar(
          context,
          'Network error — check the connection and try again.',
          error: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _shareSheet(List<TableWithToken> activeTables) async {
    if (activeTables.isEmpty) return;
    try {
      final box = context.findRenderObject() as RenderBox?;
      await shareTablesQrSheet(
        activeTables,
        _baseUrl,
        sharePositionOrigin: box == null || !box.hasSize
            ? null
            : box.localToGlobal(Offset.zero) & box.size,
      );
    } catch (_) {
      if (mounted) {
        showPosSnackBar(
          context,
          'Could not create the QR sheet',
          error: true,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tablesAsync = ref.watch(allTablesProvider);
    final tables = tablesAsync.valueOrNull;
    final activeTables =
        tables?.where((table) => table.isActive).toList(growable: false) ??
        const <TableWithToken>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tables'),
        actions: [
          IconButton(
            icon: const Icon(Icons.print_outlined),
            tooltip: 'Print QR sheet',
            onPressed: activeTables.isEmpty || _refreshing
                ? null
                : () => _shareSheet(activeTables),
          ),
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add table',
            onPressed: _addTable,
          ),
        ],
      ),
      body: tables == null
          ? tablesAsync.isLoading
                ? const Center(child: PosBusy(size: 28))
                : _TablesError(
                    message: '${tablesAsync.error ?? 'Failed to load tables'}',
                    onRetry: _refresh,
                  )
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(12),
                children: [
                  _ExplainerCard(),
                  if (tablesAsync.hasError) ...[
                    const SizedBox(height: 10),
                    PosErrorBanner(
                      'Could not refresh tables: ${tablesAsync.error}',
                    ),
                  ],
                  const SizedBox(height: 12),
                  if (tables.isEmpty)
                    _EmptyTables(onAdd: _addTable)
                  else
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final width = constraints.maxWidth;
                        final columns = width >= 1100
                            ? 3
                            : width >= 700
                            ? 2
                            : 1;
                        const spacing = 10.0;
                        final cardWidth =
                            (width - spacing * (columns - 1)) / columns;
                        return Wrap(
                          spacing: spacing,
                          runSpacing: spacing,
                          children: [
                            for (final table in tables)
                              SizedBox(
                                width: cardWidth,
                                child: TableQrCard(
                                  table: table,
                                  baseUrl: _baseUrl,
                                  busy: _busyId == table.id,
                                  onEdit: () => _editTable(table),
                                  onRotate: () => _rotateQr(table),
                                  onToggleActive: () => _toggleActive(table),
                                ),
                              ),
                          ],
                        );
                      },
                    ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }
}

class _ExplainerCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.chair_outlined,
            size: 20,
            color: AppColors.accent,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'How table QR ordering works',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.foreground,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'A diner scans the table’s QR, picks dishes, enters pax and '
                  'sends the order. It appears on the kitchen display as an '
                  'unpaid dine-in ticket; the cashier collects cash or QR Pay '
                  'in the POS table board. Deactivating a table stops its QR '
                  'from accepting orders without deleting its history.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11,
                    height: 1.5,
                    color: AppColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyTables extends StatelessWidget {
  const _EmptyTables({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
      child: Column(
        children: [
          const Icon(
            Icons.chair_outlined,
            size: 34,
            color: AppColors.muted,
          ),
          const SizedBox(height: 12),
          Text(
            'No tables yet',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Add your first table to generate its QR code.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add table'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accent,
              foregroundColor: AppColors.onAccent,
            ),
          ),
        ],
      ),
    );
  }
}

class _TablesError extends StatelessWidget {
  const _TablesError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off_outlined,
              size: 34,
              color: AppColors.muted,
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.muted,
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
