import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_mobile/features/checkout/data/checkout_models.dart';

void main() {
  group('DeliveryQuoteRequest', () {
    test('omits pickup so the server uses canonical store coordinates', () {
      const request = DeliveryQuoteRequest(
        dropoffLat: 3.137944,
        dropoffLng: 101.529757,
        dropoffAddress: 'Lot 3761, Shah Alam',
      );

      expect(request.toJson(), isNot(contains('pickup')));
      expect(request.toJson()['dropoff'], {
        'latitude': 3.137944,
        'longitude': 101.529757,
        'address': 'Lot 3761, Shah Alam',
      });
    });
  });

  group('DeliveryQuoteResult', () {
    test('parses normalized web delivery quote response', () {
      final result = DeliveryQuoteResult.fromJson({
        'quotationId': 'quote_123',
        'serviceType': 'MOTORCYCLE',
        'expiresAt': '2026-05-06T16:00:00.000Z',
        'feeCents': 725,
        'stopIds': {'pickup': 'pick_1', 'dropoff': 'drop_1'},
        'priceBreakdown': {
          'base': '7.25',
          'total': '7.25',
          'currency': 'MYR',
        },
      });

      expect(result.quotationId, 'quote_123');
      expect(result.serviceType, 'MOTORCYCLE');
      expect(result.feeCents, 725);
      expect(result.stopIds?.pickup, 'pick_1');
      expect(result.priceBreakdown?.total, '7.25');
      expect(result.expiresAt?.toUtc().toIso8601String(), '2026-05-06T16:00:00.000Z');
    });
  });
}
