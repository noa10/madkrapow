// ── Checkout Models ──────────────────────────────────────────────

enum DeliveryType { delivery, selfPickup }

extension DeliveryTypeJson on DeliveryType {
  String get jsonName => switch (this) {
        DeliveryType.delivery => 'delivery',
        DeliveryType.selfPickup => 'self_pickup',
      };
}

enum FulfillmentType { asap, scheduled }

extension FulfillmentTypeJson on FulfillmentType {
  String get jsonName => switch (this) {
        FulfillmentType.asap => 'asap',
        FulfillmentType.scheduled => 'scheduled',
      };
}

class DeliveryAddress {
  const DeliveryAddress({
    this.fullName,
    this.phone,
    this.address,
    this.addressLine1,
    this.addressLine2,
    this.postalCode,
    this.city,
    this.state,
    this.latitude,
    this.longitude,
  });

  factory DeliveryAddress.fromCustomerAddress(dynamic address) {
    return DeliveryAddress(
      fullName: null,
      phone: null,
      address: address.addressLine1 != null && address.addressLine2 != null
          ? '${address.addressLine1}, ${address.addressLine2}'
          : address.addressLine1,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      postalCode: address.postalCode,
      city: address.city,
      state: address.state,
      latitude: address.latitude,
      longitude: address.longitude,
    );
  }

  factory DeliveryAddress.fromCustomerContact(dynamic contact) {
    return DeliveryAddress(
      fullName: contact.name,
      phone: contact.phone,
    );
  }

  final String? fullName;
  final String? phone;
  final String? address;
  final String? addressLine1;
  final String? addressLine2;
  final String? postalCode;
  final String? city;
  final String? state;
  final double? latitude;
  final double? longitude;

  Map<String, dynamic> toJson() => {
        if (fullName != null) 'fullName': fullName,
        if (phone != null) 'phone': phone,
        if (address != null) 'address': address,
        if (addressLine1 != null) 'address_line1': addressLine1,
        if (addressLine2 != null) 'address_line2': addressLine2,
        if (postalCode != null) 'postalCode': postalCode,
        if (city != null) 'city': city,
        if (state != null) 'state': state,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
      };
}

class CheckoutItem {
  const CheckoutItem({
    required this.id,
    required this.name,
    required this.price,
    required this.quantity,
    this.image,
    this.modifiers = const [],
  });

  final String id;
  final String name;
  final int price; // cents
  final int quantity;
  final String? image;
  final List<CheckoutModifier> modifiers;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'price': price,
        'quantity': quantity,
        if (image != null) 'image': image,
        'modifiers': modifiers.map((m) => m.toJson()).toList(),
      };
}

class CheckoutModifier {
  const CheckoutModifier({
    required this.id,
    required this.name,
    required this.priceDeltaCents,
  });

  final String id;
  final String name;
  final int priceDeltaCents;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'price_delta_cents': priceDeltaCents,
      };
}

class CheckoutRequest {
  const CheckoutRequest({
    required this.items,
    required this.deliveryAddress,
    required this.deliveryFee,
    required this.deliveryType,
    required this.fulfillmentType,
    this.scheduledFor,
    this.quotationId,
    this.serviceType,
    this.stopIds,
    this.priceBreakdown,
  });

  final List<CheckoutItem> items;
  final DeliveryAddress deliveryAddress;
  final int deliveryFee; // cents
  final DeliveryType deliveryType;
  final FulfillmentType fulfillmentType;
  final String? scheduledFor;
  final String? quotationId;
  final String? serviceType;
  final StopIds? stopIds;
  final PriceBreakdown? priceBreakdown;

  Map<String, dynamic> toJson() => {
        'items': items.map((i) => i.toJson()).toList(),
        'deliveryAddress': deliveryAddress.toJson(),
        'deliveryFee': deliveryFee,
        'deliveryType': deliveryType.jsonName,
        'fulfillmentType': fulfillmentType.jsonName,
        if (scheduledFor != null) 'scheduledFor': scheduledFor,
        if (quotationId != null) 'quotationId': quotationId,
        if (serviceType != null) 'serviceType': serviceType,
        if (stopIds != null) 'stopIds': stopIds!.toJson(),
        if (priceBreakdown != null) 'priceBreakdown': priceBreakdown!.toJson(),
      };
}

class StopIds {
  const StopIds({required this.pickup, required this.dropoff});

  final String pickup;
  final String dropoff;

  Map<String, dynamic> toJson() => {
        'pickup': pickup,
        'dropoff': dropoff,
      };
}

class PriceBreakdown {
  const PriceBreakdown({
    required this.base,
    required this.total,
    required this.currency,
    this.extraMileage,
    this.surcharge,
  });

  final String base;
  final String total;
  final String currency;
  final String? extraMileage;
  final String? surcharge;

  Map<String, dynamic> toJson() => {
        'base': base,
        'total': total,
        'currency': currency,
        if (extraMileage != null) 'extraMileage': extraMileage,
        if (surcharge != null) 'surcharge': surcharge,
      };
}

class CheckoutResult {
  const CheckoutResult({required this.checkoutUrl, this.sessionId});

  final String checkoutUrl;
  final String? sessionId;
}

class DeliveryQuoteRequest {
  const DeliveryQuoteRequest({
    this.orderId,
    required this.pickupLat,
    required this.pickupLng,
    required this.pickupAddress,
    required this.dropoffLat,
    required this.dropoffLng,
    required this.dropoffAddress,
    this.serviceType = 'MOTORCYCLE',
  });

  final String? orderId;
  final double pickupLat;
  final double pickupLng;
  final String pickupAddress;
  final double dropoffLat;
  final double dropoffLng;
  final String dropoffAddress;
  final String serviceType;

  Map<String, dynamic> toJson() => {
        if (orderId != null) 'order_id': orderId,
        'pickup': {
          'latitude': pickupLat,
          'longitude': pickupLng,
          'address': pickupAddress,
        },
        'dropoff': {
          'latitude': dropoffLat,
          'longitude': dropoffLng,
          'address': dropoffAddress,
        },
        'service_type': serviceType,
      };
}

class DeliveryQuoteResult {
  const DeliveryQuoteResult({
    this.quotationId,
    this.stopIds,
    this.priceBreakdown,
    this.feeCents,
  });

  final String? quotationId;
  final StopIds? stopIds;
  final PriceBreakdown? priceBreakdown;
  final int? feeCents;

  factory DeliveryQuoteResult.fromJson(Map<String, dynamic> json) {
    // /api/delivery/quote returns { fee: { total }, ... } while
    // /api/shipping/lalamove/quote returns { feeCents, priceBreakdown, ... }
    // Normalize both into feeCents.
    int? feeCents = json['feeCents'] as int?;
    if (feeCents == null && json['fee'] != null) {
      feeCents = (json['fee'] as Map<String, dynamic>)['total'] as int?;
    }

    return DeliveryQuoteResult(
      quotationId: json['quotationId'] as String?,
      feeCents: feeCents,
      stopIds: json['stopIds'] != null
          ? StopIds(
              pickup: json['stopIds']['pickup'] as String,
              dropoff: json['stopIds']['dropoff'] as String,
            )
          : null,
      priceBreakdown: json['priceBreakdown'] != null
          ? PriceBreakdown(
              base: json['priceBreakdown']['base'] as String,
              total: json['priceBreakdown']['total'] as String,
              currency: json['priceBreakdown']['currency'] as String,
            )
          : null,
    );
  }
}
