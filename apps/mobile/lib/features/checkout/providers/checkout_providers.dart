import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart';

import '../../../config/env.dart';
import '../../../core/providers/supabase_provider.dart';
import '../data/checkout_models.dart';
import '../data/checkout_repository.dart';

final checkoutRepositoryProvider = Provider<CheckoutRepository>((ref) {
  return CheckoutRepository(ref.watch(supabaseProvider));
});

/// Checkout state — mirrors web's useCheckoutStore from stores/checkout.ts.
class CheckoutState {
  const CheckoutState({
    this.deliveryAddress,
    this.deliveryQuote,
    this.deliveryType = DeliveryType.delivery,
    this.fulfillmentType = FulfillmentType.asap,
    this.scheduledFor,
    this.quotationId,
    this.serviceType,
    this.stopIds,
    this.priceBreakdown,
    this.quoteExpiresAt,
  });

  final DeliveryAddress? deliveryAddress;
  final DeliveryQuoteResult? deliveryQuote;
  final DeliveryType deliveryType;
  final FulfillmentType fulfillmentType;
  final String? scheduledFor;
  final String? quotationId;
  final String? serviceType;
  final StopIds? stopIds;
  final PriceBreakdown? priceBreakdown;
  final DateTime? quoteExpiresAt;

  CheckoutState copyWith({
    DeliveryAddress? deliveryAddress,
    DeliveryQuoteResult? deliveryQuote,
    DeliveryType? deliveryType,
    FulfillmentType? fulfillmentType,
    String? scheduledFor,
    String? quotationId,
    String? serviceType,
    StopIds? stopIds,
    PriceBreakdown? priceBreakdown,
    DateTime? quoteExpiresAt,
    bool clearShippingQuote = false,
    bool clearScheduledFor = false,
  }) {
    return CheckoutState(
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      deliveryQuote: clearShippingQuote ? null : (deliveryQuote ?? this.deliveryQuote),
      deliveryType: deliveryType ?? this.deliveryType,
      fulfillmentType: fulfillmentType ?? this.fulfillmentType,
      scheduledFor: clearScheduledFor ? null : (scheduledFor ?? this.scheduledFor),
      quotationId: clearShippingQuote ? null : (quotationId ?? this.quotationId),
      serviceType: clearShippingQuote ? null : (serviceType ?? this.serviceType),
      stopIds: clearShippingQuote ? null : (stopIds ?? this.stopIds),
      priceBreakdown: clearShippingQuote ? null : (priceBreakdown ?? this.priceBreakdown),
      quoteExpiresAt: clearShippingQuote ? null : (quoteExpiresAt ?? this.quoteExpiresAt),
    );
  }

  /// Check if the Lalamove quote has expired.
  bool isQuoteExpired() {
    if (quoteExpiresAt == null) return true;
    return DateTime.now().isAfter(quoteExpiresAt!);
  }
}

class CheckoutNotifier extends Notifier<CheckoutState> {
  @override
  CheckoutState build() => const CheckoutState();

  void setDeliveryAddress(DeliveryAddress address) {
    state = state.copyWith(deliveryAddress: address);
  }

  void setDeliveryType(DeliveryType type) {
    // Switching delivery type clears shipping data (mirrors web)
    state = state.copyWith(
      deliveryType: type,
      clearShippingQuote: true,
    );
  }

  void setFulfillmentType(FulfillmentType type) {
    // Switching fulfillment type clears scheduled window (mirrors web)
    state = state.copyWith(
      fulfillmentType: type,
      clearScheduledFor: type == FulfillmentType.asap,
    );
  }

  void setShippingQuote(DeliveryQuoteResult quote) {
    state = state.copyWith(
      deliveryQuote: quote,
      quotationId: quote.quotationId,
      stopIds: quote.stopIds,
      priceBreakdown: quote.priceBreakdown,
      // Quotes typically expire in 1 hour
      quoteExpiresAt: DateTime.now().add(const Duration(hours: 1)),
    );
  }

  void clearShippingQuote() {
    state = state.copyWith(clearShippingQuote: true);
  }

  /// Geocode the delivery address and fetch a Lalamove quote.
  /// Returns the fee in cents, or throws on failure.
  Future<int> fetchDeliveryQuote(DeliveryAddress address) async {
    final repo = ref.read(checkoutRepositoryProvider);

    // Geocode the dropoff address
    final addressString = [
      address.address ?? '',
      address.city ?? '',
      address.state ?? '',
      address.postalCode ?? '',
    ].where((s) => s.isNotEmpty).join(', ');

    final locations = await locationFromAddress(addressString);
    if (locations.isEmpty) {
      throw Exception('Could not find coordinates for this address');
    }
    final dropoff = locations.first;

    final request = DeliveryQuoteRequest(
      pickupLat: double.parse(AppEnv.storeLatitude),
      pickupLng: double.parse(AppEnv.storeLongitude),
      pickupAddress: AppEnv.storeAddress,
      dropoffLat: dropoff.latitude,
      dropoffLng: dropoff.longitude,
      dropoffAddress: addressString,
    );

    final result = await repo.getDeliveryQuote(request);
    setShippingQuote(result);
    return result.feeCents ?? 0;
  }
}

final checkoutProvider = NotifierProvider<CheckoutNotifier, CheckoutState>(() {
  return CheckoutNotifier();
});
