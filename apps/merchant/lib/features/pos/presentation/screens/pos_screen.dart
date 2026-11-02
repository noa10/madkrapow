import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../config/routes.dart';
import '../../../../core/constants/roles.dart';
import '../../../../core/utils/auth_exceptions.dart';
import '../../../auth/providers/admin_auth_providers.dart';
import '../../data/pos_api_client.dart';
import '../../data/pos_repository.dart';
import '../../models/pos_cart.dart';
import '../../models/pos_models.dart';
import '../../models/pos_tables.dart';
import '../../providers/pos_providers.dart';
import '../widgets/pos_item_options_sheet.dart';
import '../widgets/pos_menu_panel.dart';
import '../widgets/pos_pay_now_sheet.dart';
import '../widgets/pos_sale_panel.dart';
import '../widgets/pos_settle_sheet.dart';
import '../widgets/pos_table_board.dart';
import '../widgets/pos_ui.dart';

enum _PosView { sale, tables }

/// Counter POS: take dine-in / take-away sales, watch the floor and collect
/// payment for unpaid tickets.
class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key});

  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen>
    with WidgetsBindingObserver {
  _PosView _view = _PosView.sale;
  final _customerNameController = TextEditingController();

  String? _busyId;
  bool _refreshing = false;
  bool _refreshQueued = false;
  bool _submitLock = false;
  bool _sheetOpen = false;
  bool _ready = false;
  String? _lastOrderCode;
  bool? _wasVisible;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // A new screen starts a new session. Reset after the first build because
    // Riverpod forbids modifying providers during a widget lifecycle callback.
    // The loading shell prevents the previous sale appearing in the meantime.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(posSaleProvider.notifier).clearForNewSession();
      setState(() => _ready = true);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visible = TickerMode.valuesOf(context).enabled;
    final wasVisible = _wasVisible;
    _wasVisible = visible;

    // The tab shell keeps visited branches mounted, so the auto-disposed
    // providers never refetch on their own and the Realtime watcher was
    // stopped while hidden. Re-read the menu and floor when the POS becomes
    // visible again so a price edit or another cashier's round is not missed.
    if (wasVisible == false && visible) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _refresh();
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Realtime does not replay events missed while the socket was suspended,
    // so a tablet that was backgrounded (or locked) can show a stale floor
    // until the next order event. Re-read on resume.
    if (state == AppLifecycleState.resumed && mounted && _wasVisible == true) {
      _refresh();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _customerNameController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  Future<void> _refresh() async {
    if (!mounted) return;
    if (_refreshing) {
      _refreshQueued = true;
      return;
    }
    setState(() => _refreshing = true);
    // Read both concurrently but tolerate one failing: a menu edit is still
    // relevant when the board request fails, and vice versa. The failed
    // provider renders its own error state.
    final boardFuture = ref.refresh(posBoardProvider.future);
    final menuFuture = ref.refresh(posMenuProvider.future);
    PosBoardData? board;
    PosMenuData? menu;
    try {
      board = await boardFuture;
    } catch (_) {
      // The provider renders its own error state.
    }
    try {
      menu = await menuFuture;
    } catch (_) {
      // The provider renders its own error state.
    }
    if (mounted) {
      // A menu edit or a deactivated table can invalidate the open sale.
      _reconcileSale(menu: menu, board: board);
      setState(() => _refreshing = false);
      if (_refreshQueued) {
        _refreshQueued = false;
        _refresh();
      }
    }
  }

  /// Match the open sale against freshly fetched data.
  ///
  /// The server re-prices and re-validates a create, but cash is taken in the
  /// sale sheet before that call. Adopting the live price keeps the shown total
  /// honest; dropping vanished dishes avoids charging for something the server
  /// will reject. Either change forces an explicit review before Charge.
  void _reconcileSale({PosMenuData? menu, PosBoardData? board}) {
    if (!mounted) return;
    final notifier = ref.read(posSaleProvider.notifier);

    if (menu != null) {
      final sale = ref.read(posSaleProvider);
      if (sale.cart.isNotEmpty) {
        final result = reconcilePosCart(
          sale.cart,
          menuItemsById: {for (final item in menu.menuItems) item.id: item},
          modifierGroupsByItem: menu.modifierGroupsByItem,
        );
        if (result.reviewRequired) notifier.applyCartReconciliation(result);
      }
    }

    if (board != null) {
      final tableId = ref.read(posSaleProvider).selectedTableId;
      if (tableId != null &&
          !board.tables.any((table) => table.id == tableId)) {
        notifier.selectTable(null);
        notifier.setSubmitError(
          'The selected table is no longer active. Pick another table.',
        );
      }
    }
  }

  /// Post-mutation refresh. A sale changes the floor, never the menu, so this
  /// skips the menu queries — matching the web POS's `refresh()`.
  Future<void> _refreshBoard() async {
    try {
      ref.invalidate(posBoardProvider);
      final board = await ref.read(posBoardProvider.future);
      if (mounted) _reconcileSale(board: board);
    } catch (_) {
      // The board renders its own error state.
    }
  }

  // ---------------------------------------------------------------------------
  // Sale
  // ---------------------------------------------------------------------------

  Future<void> _handleMenuSelect(PosMenuItem item) async {
    final menu = ref.read(posMenuProvider).valueOrNull;
    final cached = menu?.modifierGroupsByItem[item.id];
    if (cached != null && cached.isNotEmpty) {
      await _openOptions(item, cached);
      return;
    }

    // Prefetch empty/stale or groups missing: check the DB before adding, so a
    // customizable dish can never be added without its options.
    final groups = await ref
        .read(posRepositoryProvider)
        .fetchModifierGroupsForItem(item.id);
    if (!mounted) return;
    if (groups == null) {
      showPosSnackBar(
        context,
        'Could not load options. The dish was not added to the sale.',
        error: true,
      );
      return;
    }
    if (groups.isNotEmpty) {
      await _openOptions(item, groups);
      return;
    }
    if (!ref.read(posSaleProvider.notifier).addItem(item)) _showLineLimit();
  }

  void _showLineLimit() {
    showPosSnackBar(
      context,
      'A sale can hold up to $maxPosCartLines lines. Submit this order and '
      'start another.',
      error: true,
    );
  }

  Future<void> _openOptions(
    PosMenuItem item,
    List<PosModifierGroup> groups,
  ) async {
    final result = await showPosItemOptionsSheet(
      context,
      item: item,
      groups: groups,
    );
    if (result == null || !mounted) return;
    final added = ref
        .read(posSaleProvider.notifier)
        .addItem(
          item,
          modifiers: result.modifiers,
          notes: result.notes,
          quantity: result.quantity,
        );
    if (!added) _showLineLimit();
  }

  String _saleLabel(PosSaleState sale, PosBoardData? board) {
    if (sale.orderType == PosOrderType.takeAway) {
      final name = sale.customerName.trim();
      return 'Take-away · ${name.isEmpty ? 'Walk-in' : name}';
    }
    final table = board?.tables
        .where((entry) => entry.id == sale.selectedTableId)
        .firstOrNull;
    return '${table == null ? 'Dine-in' : 'Table ${table.label}'} · '
        '${sale.pax} pax';
  }

  /// Runs the submit flow. Returns true when an order was created.
  Future<bool> _handleSubmit() async {
    // A second tap while the first request is in flight must not pop the sale
    // sheet as if a payment were confirmed.
    if (_submitLock) return false;
    // `_submitLock` is only set once the sheet confirms, so a fast double tap
    // could stack two pay-now sheets before either is mounted. `_sheetOpen` is
    // a separate guard — `_submitSale` runs from inside the sheet and must not
    // be blocked by it.
    if (_sheetOpen) return false;
    final sale = ref.read(posSaleProvider);
    if (!sale.canSubmit) return false;
    if (sale.reviewRequired) {
      final confirmed = await showPosConfirmDialog(
        context,
        title: 'Review the updated sale',
        message:
            sale.reviewMessage ??
            'The menu changed while you were selling. Check the dishes and '
                'total before charging.',
        confirmLabel: 'Charge ${formatPrice(sale.totalCents)}',
        warning: true,
      );
      if (!mounted || !confirmed) return false;
      ref.read(posSaleProvider.notifier).clearReviewRequired();
    }

    final board = ref.read(posBoardProvider).valueOrNull;
    _sheetOpen = true;
    try {
      final paid = await showPosPayNowSheet(
        context,
        method: sale.paymentMethod,
        amountCents: sale.totalCents,
        label: _saleLabel(sale, board),
        outcomeUncertain: sale.outcomeUncertain,
        onConfirm: _submitSale,
      );
      return paid;
    } finally {
      // Reset whether the sheet was confirmed, cancelled or failed.
      _sheetOpen = false;
    }
  }

  /// Creates the order and returns an error message, or null on success.
  Future<String?> _submitSale() async {
    if (_submitLock) {
      return 'An order is already being recorded. Wait for it to finish.';
    }

    final sale = ref.read(posSaleProvider);
    if (sale.cart.isEmpty) return 'Add at least one dish to the sale.';
    if (sale.orderType == PosOrderType.dineIn && sale.selectedTableId == null) {
      return 'Pick a table for a dine-in order.';
    }
    if (sale.orderType == PosOrderType.takeAway &&
        sale.customerName.trim().isEmpty) {
      return 'Enter the customer name for take-away.';
    }

    final board = ref.read(posBoardProvider).valueOrNull;
    final selectedTable = sale.selectedTableId == null
        ? null
        : board?.tables
              .where((entry) => entry.id == sale.selectedTableId)
              .firstOrNull;
    final customerName = sale.customerName.trim();

    _submitLock = true;
    final notifier = ref.read(posSaleProvider.notifier);
    final sessionGeneration = notifier.sessionGeneration;
    bool isCurrentSession() => notifier.sessionGeneration == sessionGeneration;
    notifier.setSubmitting(true);
    notifier.setSubmitError(null);

    try {
      final result = await ref
          .read(posRepositoryProvider)
          .createOrder(
            items: [
              for (final line in sale.cart)
                {
                  'menu_item_id': line.item.id,
                  'quantity': line.quantity,
                  'modifier_ids': [
                    for (final modifier in line.modifiers) modifier.id,
                  ],
                  if (line.notes.isNotEmpty) 'notes': line.notes,
                },
            ],
            orderType: sale.orderType,
            tableId: sale.orderType == PosOrderType.dineIn
                ? sale.selectedTableId
                : null,
            pax: sale.orderType == PosOrderType.dineIn ? sale.pax : null,
            paymentMethod: sale.paymentMethod,
            customerName: customerName.isEmpty ? null : customerName,
          );

      // A response from an old cashier must not touch the next cashier's
      // app-scoped sale, even when the old screen was disposed during the call.
      if (!isCurrentSession()) return null;
      _lastOrderCode = result.code;
      // Only a confirmed create releases the duplicate-order guard.
      notifier.resetSale(orderConfirmed: true);

      if (!mounted) return null;

      // The server re-prices from the live menu. A difference means the cart
      // showed a stale price, so name both amounts for the cashier.
      final priceNote = result.totalCents == sale.totalCents
          ? ''
          : ' · Price updated: ${formatPrice(sale.totalCents)} → '
                '${formatPrice(result.totalCents)}';

      final contextLabel = sale.orderType == PosOrderType.dineIn
          ? 'Table ${result.tableLabel ?? selectedTable?.label ?? ''} · '
                '${result.pax ?? sale.pax} pax'
          : 'Take-away';

      // Only safe once the screen is still mounted — a disposed
      // TextEditingController must not be touched.
      _customerNameController.clear();

      showPosSnackBar(
        context,
        'Order ${result.code} paid · ${formatPrice(result.totalCents)} · '
        '$contextLabel$priceNote',
      );

      await _refreshBoard();
      return null;
    } on PosApiException catch (error) {
      if (error.outcomeUncertain) {
        if (isCurrentSession()) {
          notifier.setOutcomeUncertain();
          notifier.setSubmitError(
            'Could not confirm the order. Check Orders before retrying.',
          );
        }
        rethrow;
      }
      if (isCurrentSession()) {
        notifier.setSubmitError('Could not record the order: ${error.message}');
      }
      return error.message;
    } on AuthRequiredException catch (error) {
      if (isCurrentSession()) notifier.setSubmitError(error.message);
      return error.message;
    } catch (_) {
      if (isCurrentSession()) {
        notifier.setOutcomeUncertain();
        notifier.setSubmitError(
          'Could not confirm the order. Check Orders before retrying.',
        );
      }
      rethrow;
    } finally {
      _submitLock = false;
      if (isCurrentSession()) notifier.setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------------

  Future<void> _openSettle(PosSettleTarget target) async {
    if (_busyId != null) return;
    final settled = await showPosSettleSheet(
      context,
      target: target,
      onConfirm: (method) => _settle(target, method),
    );
    if (!settled || !mounted) return;
    await _refreshBoard();
  }

  /// Collects one target and returns an error message, or null on success.
  Future<String?> _settle(
    PosSettleTarget target,
    PosPaymentMethod method,
  ) async {
    setState(() => _busyId = target.id);
    final repo = ref.read(posRepositoryProvider);

    try {
      final result = target.kind == PosSettleKind.table
          ? await repo.settleTable(target.id, method, target.orderIds)
          : await repo.settleOrder(target.id, method);

      if (!mounted) return null;

      // Never report a collection the server did not confirm.
      if (!result.success && !result.alreadySettled) {
        return 'The server did not confirm the payment. Check the table board '
            'before retrying.';
      }

      if (result.alreadySettled) {
        showPosSnackBar(
          context,
          'Already collected — this bill was paid from another screen. '
          'Nothing was charged twice.',
        );
        return null;
      }

      showPosSnackBar(
        context,
        target.kind == PosSettleKind.table
            ? 'Payment collected · ${target.label} · '
                  '${result.settledCount} order'
                  '${result.settledCount == 1 ? '' : 's'} · '
                  '${formatPrice(result.amountCents)}'
            : 'Payment collected · ${target.label} · '
                  '${formatPrice(result.amountCents)}',
      );
      return null;
    } on PosApiException catch (error) {
      if (!mounted) return error.message;

      if (error.code == 'stale_settle') {
        // Close the sheet instead of leaving it open: its amount and snapshot
        // order ids are stale, so confirming again would hit the same 409.
        // The caller refreshes the board; the cashier reopens the collect
        // sheet against the new total (matching the web POS).
        showPosSnackBar(
          context,
          'Table changed — a round was added or paid while you were '
          'collecting. Review the new total and try again.',
          error: true,
        );
        return null;
      }
      if (error.code == 'already_paid') {
        showPosSnackBar(
          context,
          'Already collected — this bill was paid from another screen. '
          'Nothing was charged twice.',
        );
        return null;
      }

      showPosSnackBar(
        context,
        'Could not collect payment: ${error.message}',
        error: true,
      );
      return error.message;
    } on AuthRequiredException catch (error) {
      return error.message;
    } catch (_) {
      return 'Network error — check the connection and try again.';
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _voidOrder(PosOpenOrder order) async {
    if (_busyId != null) return;
    final confirmed = await showPosConfirmDialog(
      context,
      title: 'Void order ${order.code}?',
      message:
          'This cancels the unpaid order and removes it from the kitchen '
          'queue. Use it when a customer left or the order was keyed '
          'incorrectly.',
      confirmLabel: 'Void order',
      destructive: true,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busyId = order.id);
    try {
      await ref.read(posRepositoryProvider).voidOrder(order.id);
      if (!mounted) return;
      showPosSnackBar(
        context,
        'Order ${order.code} voided — the unpaid ticket was removed from the '
        'kitchen queue.',
      );
      await _refreshBoard();
    } on PosApiException catch (error) {
      if (mounted) {
        showPosSnackBar(
          context,
          'Could not void the order: ${error.message}',
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

  Future<void> _closeTable(TableSummary summary) async {
    if (_busyId != null) return;
    final table = summary.table;
    final saleBeforeClose = ref.read(posSaleProvider);
    final clearsSale =
        saleBeforeClose.orderType == PosOrderType.dineIn &&
        saleBeforeClose.selectedTableId == table.id &&
        saleBeforeClose.cart.isNotEmpty;
    final baseWarning = closeTableWarning(
      summary.kitchenActiveOrderCount,
      summary.dinerClaimedOrderCount,
    );
    final itemCount = saleBeforeClose.itemCount;
    final message = [
      baseWarning ??
          'Closing marks every order served and frees the table for the next '
              'guests.',
      if (clearsSale)
        'The unsent sale for this table ($itemCount item'
            '${itemCount == 1 ? '' : 's'}) will also be cleared.',
    ].join('\n\n');
    final confirmed = await showPosConfirmDialog(
      context,
      title: 'Close table ${table.label}?',
      message: message,
      confirmLabel: 'Close table',
      warning: true,
    );
    if (!confirmed || !mounted) return;

    setState(() => _busyId = table.id);
    try {
      final result = await ref.read(posRepositoryProvider).closeTable(
        table.id,
        [for (final order in summary.orders) order.id],
      );
      if (!mounted) return;
      if (!result.success) {
        showPosSnackBar(
          context,
          'The server did not confirm the close. Check the table board before '
          'retrying.',
          error: true,
        );
        return;
      }
      showPosSnackBar(
        context,
        'Table ${table.label} closed · ${result.closed} order'
        '${result.closed == 1 ? '' : 's'} marked served.',
      );
      final sale = ref.read(posSaleProvider);
      if (sale.selectedTableId == table.id) {
        // The guests have left; their unsent dishes must not leak into the
        // next table's sale.
        if (sale.orderType == PosOrderType.dineIn && sale.cart.isNotEmpty) {
          ref.read(posSaleProvider.notifier).resetSale();
          _customerNameController.clear();
        }
        ref.read(posSaleProvider.notifier).selectTable(null);
      }
      await _refreshBoard();
    } on PosApiException catch (error) {
      if (!mounted) return;
      if (error.code == 'stale_close') {
        showPosSnackBar(
          context,
          'Table changed — a round was added or paid while you were closing. '
          'Review the table and try again.',
          error: true,
        );
        await _refreshBoard();
        return;
      }
      showPosSnackBar(
        context,
        'Could not close the table: ${error.message}',
        error: true,
      );
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

  Future<void> _startTableOrder(TableSummary summary) async {
    if (ref.read(posSaleProvider).cart.isNotEmpty) {
      final confirmed = await showPosConfirmDialog(
        context,
        title: 'Discard current sale?',
        message:
            'Starting a new table order will remove the dishes in the '
            'current sale.',
        confirmLabel: 'Discard and continue',
        destructive: true,
      );
      if (!mounted || !confirmed) return;
    }
    ref
        .read(posSaleProvider.notifier)
        .startTableOrder(summary.table, summary.pax);
    _customerNameController.clear();
    setState(() => _view = _PosView.sale);
  }

  void _clearSale() {
    ref.read(posSaleProvider.notifier).resetSale();
    _customerNameController.clear();
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(body: Center(child: PosBusy(size: 28)));
    }

    // The POS branch stays mounted while another tab is active (IndexedStack),
    // so gate the Realtime subscription on visibility — hidden tabs must not
    // keep refetching the board on every order event.
    if (TickerMode.valuesOf(context).enabled) {
      ref.watch(posRealtimeWatcherProvider);
    }

    final boardAsync = ref.watch(posBoardProvider);
    final menuAsync = ref.watch(posMenuProvider);
    final role = ref.watch(staffRoleProvider);
    final canManageTables = role?.canManageTables ?? false;
    final board = boardAsync.valueOrNull;
    // A failed board query must not block a take-away sale: the sale view only
    // needs the menu, so fall back to an empty floor (matching the web POS,
    // which keeps the sale UI usable under its error banner).
    final effectiveBoard =
        board ?? const PosBoardData(tables: [], openOrders: []);
    final boardLoading = board == null && boardAsync.isLoading;

    final summaries = effectiveBoard.summaries;
    final unpaidCount =
        summaries.where((summary) => summary.hasUnpaid).length +
        effectiveBoard.unpaidTakeaway.length;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Counter POS'),
            if (_lastOrderCode != null)
              Text(
                'Last: $_lastOrderCode',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
              ),
          ],
        ),
        actions: [
          if (canManageTables)
            IconButton(
              icon: const Icon(Icons.table_restaurant_outlined),
              tooltip: 'Manage tables',
              onPressed: () => context.push(AppRoutes.posTables),
            ),
          IconButton(
            icon: _refreshing
                ? const PosBusy(size: 18)
                : const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _refreshing ? null : _refresh,
          ),
        ],
      ),
      body: Column(
        children: [
          _ViewHeader(
            view: _view,
            unpaidCount: unpaidCount,
            onChanged: (view) => setState(() => _view = view),
          ),
          if (boardAsync.hasError && (_view == _PosView.sale || board != null))
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: PosErrorBanner(
                board == null
                    ? 'Could not load the floor: ${boardAsync.error} '
                          'You can still record a take-away sale.'
                    : 'Could not refresh the floor: ${boardAsync.error}',
              ),
            ),
          Expanded(
            child: boardLoading
                ? const Center(child: PosBusy(size: 28))
                : board == null && _view == _PosView.tables
                ? _ErrorState(
                    message: '${boardAsync.error ?? 'Failed to load POS'}',
                    onRetry: _refresh,
                  )
                : _view == _PosView.sale
                ? _buildSaleView(effectiveBoard, menuAsync)
                : PosTableBoard(
                    summaries: summaries,
                    unpaidTakeaway: effectiveBoard.unpaidTakeaway,
                    busyId: _busyId,
                    refreshing: _refreshing,
                    onNewOrder: _startTableOrder,
                    onSettle: _openSettle,
                    onVoid: _voidOrder,
                    onCloseTable: _closeTable,
                    onRefresh: _refresh,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildSaleView(PosBoardData board, AsyncValue<PosMenuData> menuAsync) {
    final summariesById = {
      for (final summary in board.summaries) summary.table.id: summary,
    };

    final salePanel = PosSalePanel(
      tables: board.tables,
      summaries: summariesById,
      customerNameController: _customerNameController,
      onCollectUnpaid: _openSettle,
      onSubmit: _handleSubmit,
      onClear: _clearSale,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 900) {
          return Row(
            children: [
              Expanded(child: _buildMenuPane(menuAsync)),
              const VerticalDivider(width: 1, color: AppColors.border),
              SizedBox(width: 380, child: salePanel),
            ],
          );
        }
        return Column(
          children: [
            Expanded(child: _buildMenuPane(menuAsync)),
            _ReviewBar(
              sale: ref.watch(posSaleProvider),
              onTap: () =>
                  _openSaleSheet(board: board, summariesById: summariesById),
            ),
          ],
        );
      },
    );
  }

  Widget _buildMenuPane(AsyncValue<PosMenuData> menuAsync) {
    return menuAsync.when(
      data: (data) => PosMenuPanel(data: data, onSelect: _handleMenuSelect),
      loading: () => const Center(child: PosBusy(size: 26)),
      error: (error, stack) => _ErrorState(
        message: 'Could not load the menu: $error',
        onRetry: _refresh,
      ),
    );
  }

  Future<void> _openSaleSheet({
    required PosBoardData board,
    required Map<String, TableSummary> summariesById,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (sheetContext) {
        final media = MediaQuery.of(sheetContext);
        final keyboard = media.viewInsets.bottom;
        // Lift the sheet above the keyboard and shrink it to the space that is
        // left, so the Charge footer (outside the scrollable body) stays
        // reachable while the cashier types a take-away name.
        return AnimatedPadding(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: EdgeInsets.only(bottom: keyboard),
          child: SizedBox(
            height: (media.size.height - keyboard) * 0.85,
            child: PosSalePanel(
              tables: board.tables,
              summaries: summariesById,
              customerNameController: _customerNameController,
              onCollectUnpaid: (target) {
                Navigator.of(sheetContext).pop();
                _openSettle(target);
              },
              onSubmit: () async {
                final submitted = await _handleSubmit();
                if (submitted && sheetContext.mounted) {
                  Navigator.of(sheetContext).pop();
                }
              },
              onClear: _clearSale,
            ),
          ),
        );
      },
    );
  }
}

class _ViewHeader extends StatelessWidget {
  const _ViewHeader({
    required this.view,
    required this.unpaidCount,
    required this.onChanged,
  });

  final _PosView view;
  final int unpaidCount;
  final ValueChanged<_PosView> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              borderRadius: AppRadii.mdRadius,
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _HeaderTab(
                  label: 'Sale',
                  active: view == _PosView.sale,
                  onTap: () => onChanged(_PosView.sale),
                ),
                _HeaderTab(
                  label: 'Tables',
                  active: view == _PosView.tables,
                  badge: unpaidCount > 0 ? unpaidCount : null,
                  onTap: () => onChanged(_PosView.tables),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Cash · Company QR',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.end,
              style: TextStyle(fontSize: 11, color: AppColors.muted),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderTab extends StatelessWidget {
  const _HeaderTab({
    required this.label,
    required this.active,
    required this.onTap,
    this.badge,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      child: Material(
        color: active ? AppColors.accent : Colors.transparent,
        borderRadius: AppRadii.smRadius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: active ? AppColors.onAccent : AppColors.muted,
                    ),
                  ),
                  if (badge != null) ...[
                    const SizedBox(width: 5),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 1,
                      ),
                      decoration: const BoxDecoration(
                        color: AppColors.warning,
                        borderRadius: AppRadii.pillRadius,
                      ),
                      child: Text(
                        '$badge',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.background,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReviewBar extends StatelessWidget {
  const _ReviewBar({required this.sale, required this.onTap});

  final PosSaleState sale;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: FilledButton(
        onPressed: onTap,
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.onAccent,
        ),
        child: Row(
          children: [
            const Icon(Icons.shopping_bag_outlined, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                sale.cart.isEmpty
                    ? 'Review sale'
                    : 'Review ${sale.itemCount} item'
                          '${sale.itemCount == 1 ? '' : 's'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              formatPrice(sale.totalCents),
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onAccent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

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
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
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
