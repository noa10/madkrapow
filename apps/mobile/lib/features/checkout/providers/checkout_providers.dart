import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geocoding/geocoding.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../../generated/tables/customer_addresses.dart';
import '../../../generated/tables/customer_contacts.dart';
import '../data/checkout_models.dart';
import '../data/checkout_repository.dart';

final checkoutRepositoryProvider = Provider<CheckoutRepository>((ref) {
  return CheckoutRepository(ref.watch(supabaseProvider));
});

/// Checkout state — mirrors web's useCheckoutStore from stores/checkout.ts.
class CheckoutState {
  const CheckoutState({
    this.deliveryAddress,
    this.contactInfo,
    this.deliveryQuote,
    this.deliveryType = DeliveryType.delivery,
    this.fulfillmentType = FulfillmentType.asap,
    this.scheduledFor,
    this.quotationId,
    this.serviceType,
    this.stopIds,
    this.priceBreakdown,
    this.quoteExpiresAt,
    this.selectedContactId,
    this.selectedAddressId,
    this.useManualContact = false,
    this.useManualAddress = false,
    this.appliedPromos = const [],
    this.includeCutlery = true,
  });

  final DeliveryAddress? deliveryAddress;
  final DeliveryAddress? contactInfo;
  final DeliveryQuoteResult? deliveryQuote;
  final DeliveryType deliveryType;
  final FulfillmentType fulfillmentType;
  final String? scheduledFor;
  final String? quotationId;
  final String? serviceType;
  final StopIds? stopIds;
  final PriceBreakdown? priceBreakdown;
  final DateTime? quoteExpiresAt;

  final String? selectedContactId;
  final String? selectedAddressId;
  final bool useManualContact;
  final bool useManualAddress;
  final List<AppliedPromo> appliedPromos;
  final bool includeCutlery;

  int get discountTotalCents {
    return appliedPromos.fold(0, (sum, p) => sum + p.discountCents);
  }

  CheckoutState copyWith({
    DeliveryAddress? deliveryAddress,
    DeliveryAddress? contactInfo,
    DeliveryQuoteResult? deliveryQuote,
    DeliveryType? deliveryType,
    FulfillmentType? fulfillmentType,
    String? scheduledFor,
    String? quotationId,
    String? serviceType,
    StopIds? stopIds,
    PriceBreakdown? priceBreakdown,
    DateTime? quoteExpiresAt,
    String? selectedContactId,
    String? selectedAddressId,
    bool? useManualContact,
    bool? useManualAddress,
    bool clearShippingQuote = false,
    bool clearScheduledFor = false,
    List<AppliedPromo>? appliedPromos,
    bool? includeCutlery,
  }) {
    return CheckoutState(
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      contactInfo: contactInfo ?? this.contactInfo,
      deliveryQuote: clearShippingQuote ? null : (deliveryQuote ?? this.deliveryQuote),
      deliveryType: deliveryType ?? this.deliveryType,
      fulfillmentType: fulfillmentType ?? this.fulfillmentType,
      scheduledFor: clearScheduledFor ? null : (scheduledFor ?? this.scheduledFor),
      quotationId: clearShippingQuote ? null : (quotationId ?? this.quotationId),
      serviceType: clearShippingQuote ? null : (serviceType ?? this.serviceType),
      stopIds: clearShippingQuote ? null : (stopIds ?? this.stopIds),
      priceBreakdown: clearShippingQuote ? null : (priceBreakdown ?? this.priceBreakdown),
      quoteExpiresAt: clearShippingQuote ? null : (quoteExpiresAt ?? this.quoteExpiresAt),
      selectedContactId: selectedContactId ?? this.selectedContactId,
      selectedAddressId: selectedAddressId ?? this.selectedAddressId,
      useManualContact: useManualContact ?? this.useManualContact,
      useManualAddress: useManualAddress ?? this.useManualAddress,
      appliedPromos: appliedPromos ?? this.appliedPromos,
      includeCutlery: includeCutlery ?? this.includeCutlery,
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

  void setContactInfo(DeliveryAddress contact) {
    state = state.copyWith(contactInfo: contact);
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

  void setIncludeCutlery(bool value) {
    state = state.copyWith(includeCutlery: value);
  }

  void setShippingQuote(DeliveryQuoteResult quote) {
    state = state.copyWith(
      deliveryQuote: quote,
      quotationId: quote.quotationId,
      serviceType: quote.serviceType,
      stopIds: quote.stopIds,
      priceBreakdown: quote.priceBreakdown,
      quoteExpiresAt:
          quote.expiresAt ?? DateTime.now().add(const Duration(minutes: 5)),
    );
  }

  void clearShippingQuote() {
    state = state.copyWith(clearShippingQuote: true);
  }

  void selectContact(String? contactId) {
    state = state.copyWith(
      selectedContactId: contactId,
      useManualContact: contactId == null,
    );
  }

  void selectAddress(String? addressId, {CustomerAddressesRow? address}) {
    if (address != null) {
      state = state.copyWith(
        selectedAddressId: addressId,
        useManualAddress: false,
        deliveryAddress: DeliveryAddress.fromCustomerAddress(address),
      );
    } else {
      state = state.copyWith(
        selectedAddressId: addressId,
        useManualAddress: addressId == null,
      );
    }
  }

  void toggleManualContact(bool value) {
    state = state.copyWith(
      useManualContact: value,
      selectedContactId: value ? null : state.selectedContactId,
    );
  }

  void toggleManualAddress(bool value) {
    state = state.copyWith(
      useManualAddress: value,
      selectedAddressId: value ? null : state.selectedAddressId,
    );
  }

  /// Pre-fill contact from the customer profile.
  void initializeContact(CustomerContactsRow? defaultContact, String? profileName, String? profilePhone) {
    if (defaultContact != null) {
      state = state.copyWith(
        selectedContactId: defaultContact.id,
        contactInfo: DeliveryAddress.fromCustomerContact(defaultContact),
      );
    } else if (profileName != null || profilePhone != null) {
      state = state.copyWith(
        contactInfo: DeliveryAddress(fullName: profileName, phone: profilePhone),
      );
    }
  }

  /// Pre-fill address from the customer's default address.
  void initializeAddress(CustomerAddressesRow? defaultAddress) {
    if (defaultAddress != null) {
      state = state.copyWith(
        selectedAddressId: defaultAddress.id,
        deliveryAddress: DeliveryAddress.fromCustomerAddress(defaultAddress),
      );
    }
  }

  // ── Promo Methods ───────────────────────────────────────────────────

  /// Apply a validated promo to the checkout.
  void applyPromo(AppliedPromo promo) {
    final currentCodes = state.appliedPromos.map((p) => p.code).toSet();
    if (currentCodes.contains(promo.code)) return;

    // Check stacking: one per category (order vs delivery)
    final existing = state.appliedPromos.where((p) => p.scope == promo.scope).toList();
    final updated = existing.isEmpty
        ? [...state.appliedPromos, promo]
        : [
            ...state.appliedPromos.where((p) => p.scope != promo.scope),
            if (promo.discountCents > existing.first.discountCents) promo else existing.first,
          ];

    state = state.copyWith(appliedPromos: updated);
  }

  /// Remove a promo by its code.
  void removePromo(String code) {
    state = state.copyWith(
      appliedPromos: state.appliedPromos.where((p) => p.code != code).toList(),
    );
  }

  /// Clear all applied promos.
  void clearPromos() {
    state = state.copyWith(appliedPromos: []);
  }

  /// Validate a promo code and apply it if valid.
  /// Returns the applied promo on success, throws on failure.
  Future<AppliedPromo> validateAndApplyPromo({
    required String code,
    required int subtotalCents,
    required int deliveryFeeCents,
  }) async {
    final repo = ref.read(checkoutRepositoryProvider);
    final validated = await repo.validatePromo(
      code: code,
      subtotalCents: subtotalCents,
      deliveryFeeCents: deliveryFeeCents,
    );
    applyPromo(validated);
    return validated;
  }

  /// Fetch and apply auto-promos based on current cart totals.
  Future<void> fetchAndApplyAutoPromos({
    required int subtotalCents,
    required int deliveryFeeCents,
  }) async {
    final repo = ref.read(checkoutRepositoryProvider);
    final autoPromos = await repo.fetchAutoPromos(
      subtotalCents: subtotalCents,
      deliveryFeeCents: deliveryFeeCents,
    );
    clearPromos();
    for (final promo in autoPromos) {
      applyPromo(promo);
    }
  }

  /// Geocode the delivery address and fetch a Lalamove quote.
  /// Returns the fee in cents, or throws on failure.
  Future<int> fetchDeliveryQuote(DeliveryAddress address) async {
    final repo = ref.read(checkoutRepositoryProvider);

    final addressString = [
      address.address ?? address.addressLine1 ?? '',
      address.city ?? '',
      address.state ?? '',
      address.postalCode ?? '',
    ].where((s) => s.isNotEmpty).join(', ');

    // Use stored coordinates if available; otherwise geocode the address.
    double dropoffLat;
    double dropoffLng;

    if (address.latitude != null && address.longitude != null) {
      dropoffLat = address.latitude!;
      dropoffLng = address.longitude!;
      debugPrint('DeliveryQuote: using stored coords $dropoffLat, $dropoffLng');
    } else {
      debugPrint('DeliveryQuote: geocoding "$addressString"');
      List<Location> locations;
      try {
        locations = await locationFromAddress(addressString);
      } catch (e) {
        debugPrint('DeliveryQuote: geocoding failed — $e');
        throw Exception('Could not geocode address: $e');
      }
      if (locations.isEmpty) {
        debugPrint('DeliveryQuote: no results for "$addressString"');
        throw Exception('Could not find coordinates for this address');
      }
      dropoffLat = locations.first.latitude;
      dropoffLng = locations.first.longitude;
      debugPrint('DeliveryQuote: resolved to $dropoffLat, $dropoffLng');
    }

    final request = DeliveryQuoteRequest(
      dropoffLat: dropoffLat,
      dropoffLng: dropoffLng,
      dropoffAddress: addressString,
    );

    debugPrint('DeliveryQuote: calling API with server-side store pickup');
    final result = await repo.getDeliveryQuote(request);
    debugPrint('DeliveryQuote: got fee=${result.feeCents} cents, quoteId=${result.quotationId}');
    setShippingQuote(result);
    return result.feeCents ?? 0;
  }
}

final checkoutProvider = NotifierProvider<CheckoutNotifier, CheckoutState>(() {
  return CheckoutNotifier();
});
