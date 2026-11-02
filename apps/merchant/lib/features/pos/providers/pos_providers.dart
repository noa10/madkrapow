import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/supabase_provider.dart';
import '../data/pos_api_client.dart';
import '../data/pos_repository.dart';
import '../models/pos_cart.dart';
import '../models/pos_models.dart';
import '../models/pos_tables.dart';

final posApiClientProvider = Provider<PosApiClient>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return PosApiClient(supabase);
});

final posRepositoryProvider = Provider<PosRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  final apiClient = ref.watch(posApiClientProvider);
  return PosRepository(supabase, apiClient);
});

/// Sellable menu: categories, dishes and the modifier index.
///
/// Auto-disposed so opening the POS always re-reads the live menu.
final posMenuProvider = FutureProvider.autoDispose<PosMenuData>((ref) {
  return ref.watch(posRepositoryProvider).fetchMenu();
});

/// Live floor: active tables plus open dine-in / pending take-away orders.
final posBoardProvider = FutureProvider.autoDispose<PosBoardData>((ref) {
  return ref.watch(posRepositoryProvider).fetchBoard();
});

/// Every table including inactive ones, with QR tokens (management screen).
final allTablesProvider = FutureProvider.autoDispose<List<TableWithToken>>((
  ref,
) {
  return ref.watch(posRepositoryProvider).fetchAllTables();
});

const _unset = Object();

/// Everything the cashier is building or has just submitted.
class PosSaleState {
  const PosSaleState({
    this.orderType = PosOrderType.dineIn,
    this.selectedTableId,
    this.pax = 2,
    this.customerName = '',
    this.cart = const [],
    this.paymentMethod = PosPaymentMethod.cash,
    this.submitting = false,
    this.submitError,
    this.outcomeUncertain = false,
  });

  final PosOrderType orderType;
  final String? selectedTableId;
  final int pax;
  final String customerName;
  final List<PosCartLine> cart;
  final PosPaymentMethod paymentMethod;
  final bool submitting;

  /// Why the last submit failed, rendered inside the sale panel so the message
  /// is visible in both the docked and bottom-sheet layouts (a snackbar would
  /// sit underneath the sheet and look like nothing happened).
  final String? submitError;

  /// A previous create may have completed despite an interrupted response.
  final bool outcomeUncertain;

  int get totalCents => posCartTotalCents(cart);
  int get itemCount => cart.fold<int>(0, (sum, line) => sum + line.quantity);

  /// Mirrors the web sale panel's submit gate.
  bool get canSubmit =>
      cart.isNotEmpty &&
      !submitting &&
      (orderType == PosOrderType.takeAway || selectedTableId != null) &&
      (orderType == PosOrderType.dineIn || customerName.trim().isNotEmpty);

  PosSaleState copyWith({
    PosOrderType? orderType,
    Object? selectedTableId = _unset,
    int? pax,
    String? customerName,
    List<PosCartLine>? cart,
    PosPaymentMethod? paymentMethod,
    bool? submitting,
    Object? submitError = _unset,
    bool? outcomeUncertain,
  }) {
    return PosSaleState(
      orderType: orderType ?? this.orderType,
      selectedTableId: identical(selectedTableId, _unset)
          ? this.selectedTableId
          : selectedTableId as String?,
      pax: pax ?? this.pax,
      customerName: customerName ?? this.customerName,
      cart: cart ?? this.cart,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      submitting: submitting ?? this.submitting,
      submitError: identical(submitError, _unset)
          ? this.submitError
          : submitError as String?,
      outcomeUncertain: outcomeUncertain ?? this.outcomeUncertain,
    );
  }
}

class PosSaleNotifier extends Notifier<PosSaleState> {
  int _sessionGeneration = 0;

  /// Identifies the session that owns an asynchronous create request.
  int get sessionGeneration => _sessionGeneration;

  @override
  PosSaleState build() => const PosSaleState();

  void setOrderType(PosOrderType type) {
    state = state.copyWith(orderType: type);
  }

  void selectTable(String? tableId) {
    state = state.copyWith(selectedTableId: tableId);
  }

  void setPax(int pax) {
    final clamped = pax.clamp(minPax, maxPax);
    state = state.copyWith(pax: clamped);
  }

  void setCustomerName(String name) {
    state = state.copyWith(customerName: name);
  }

  /// Adds a dish to the sale. Returns false when the sale already holds the
  /// API's maximum number of distinct lines.
  bool addItem(
    PosMenuItem item, {
    List<PosCartModifier> modifiers = const [],
    String notes = '',
    int quantity = 1,
  }) {
    if (!posCartCanAddLine(
      state.cart,
      item: item,
      modifiers: modifiers,
      notes: notes,
    )) {
      return false;
    }
    state = state.copyWith(
      cart: addPosCartLine(
        state.cart,
        item: item,
        modifiers: modifiers,
        notes: notes,
        quantity: quantity,
      ),
    );
    return true;
  }

  void changeQuantity(String lineKey, int delta) {
    state = state.copyWith(
      cart: changePosCartQuantity(state.cart, lineKey, delta),
    );
  }

  void removeLine(String lineKey) {
    state = state.copyWith(cart: removePosCartLine(state.cart, lineKey));
  }

  /// Clear the sale after a submit: cart, take-away name and payment choice.
  /// Order type, table and pax persist so a cashier can key another round for
  /// the same table.
  void resetSale() {
    state = state.copyWith(
      cart: const [],
      customerName: '',
      paymentMethod: PosPaymentMethod.cash,
      submitError: null,
      outcomeUncertain: false,
    );
  }

  void setOutcomeUncertain() {
    state = state.copyWith(outcomeUncertain: true);
  }

  /// Wipe everything, including order type, table and pax.
  ///
  /// A new `PosScreen` is created on every sign-in, so a shared counter tablet
  /// must not inherit the previous cashier's table or party size — unlike
  /// [resetSale], which deliberately keeps that context for the next round.
  void clearForNewSession() {
    _sessionGeneration++;
    state = const PosSaleState();
  }

  void setPaymentMethod(PosPaymentMethod method) {
    state = state.copyWith(paymentMethod: method);
  }

  /// Start a new round at an occupied table from the board.
  void startTableOrder(RestaurantTable table, int? tablePax) {
    state = state.copyWith(
      orderType: PosOrderType.dineIn,
      selectedTableId: table.id,
      pax: tablePax ?? 2,
      cart: const [],
      customerName: '',
      paymentMethod: PosPaymentMethod.cash,
      submitError: null,
    );
  }

  void setSubmitting(bool submitting) {
    state = state.copyWith(submitting: submitting);
  }

  void setSubmitError(String? message) {
    state = state.copyWith(submitError: message);
  }
}

final posSaleProvider = NotifierProvider<PosSaleNotifier, PosSaleState>(
  PosSaleNotifier.new,
);

/// Keeps the table board and unpaid queue current.
///
/// A Realtime filter can only express one predicate and the board needs both
/// dine-in and counter take-away events, so any `orders` event triggers a
/// debounced refresh — mirroring the web POS hook. The screen watches this
/// only while its tab is visible, so hidden branches do not keep refetching.
final posRealtimeWatcherProvider = Provider.autoDispose<void>((ref) {
  final repo = ref.watch(posRepositoryProvider);
  Timer? timer;

  final channel = repo.subscribeToOrderChanges(
    onChange: () {
      timer?.cancel();
      timer = Timer(const Duration(milliseconds: 300), () {
        ref.invalidate(posBoardProvider);
      });
    },
  );

  ref.onDispose(() {
    timer?.cancel();
    repo.unsubscribe(channel);
  });
});
