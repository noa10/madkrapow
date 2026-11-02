import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:madkrapow_merchant/core/utils/auth_exceptions.dart';
import 'package:madkrapow_merchant/features/pos/data/pos_api_client.dart';

http.Response _response(int statusCode, String body) =>
    http.Response(body, statusCode);

void main() {
  group('PosApiClient.decodeResponse', () {
    test('returns the decoded object for a successful response', () {
      final body = PosApiClient.decodeResponse(
        _response(
          200,
          '{"success":true,"settled_count":2,"amount_cents":5000}',
        ),
      );

      expect(body['success'], isTrue);
      expect(body['settled_count'], 2);
      expect(body['amount_cents'], 5000);
    });

    test('maps 401 to the sign-in flow', () {
      expect(
        () => PosApiClient.decodeResponse(
          _response(401, '{"error":"Unauthorized"}'),
        ),
        throwsA(isA<AuthRequiredException>()),
      );
    });

    test('maps 403 to an access-denied auth failure', () {
      expect(
        () => PosApiClient.decodeResponse(_response(403, '{}')),
        throwsA(
          isA<AuthRequiredException>().having(
            (error) => error.message,
            'message',
            contains('permission'),
          ),
        ),
      );
    });

    test('carries the server error code for snapshot guards', () {
      expect(
        () => PosApiClient.decodeResponse(
          _response(409, '{"error":"Table changed","code":"stale_settle"}'),
        ),
        throwsA(
          isA<PosApiException>()
              .having((error) => error.statusCode, 'statusCode', 409)
              .having((error) => error.code, 'code', 'stale_settle')
              .having((error) => error.message, 'message', 'Table changed'),
        ),
      );
    });

    test('falls back to the status when the error body is not JSON', () {
      expect(
        () => PosApiClient.decodeResponse(_response(500, 'upstream boom')),
        throwsA(
          isA<PosApiException>()
              .having((error) => error.message, 'message', contains('500'))
              .having((error) => error.code, 'code', isNull),
        ),
      );
    });

    test('server errors can leave a counter order outcome uncertain', () {
      expect(
        () => PosApiClient.decodeResponse(_response(500, '{}')),
        throwsA(
          isA<PosApiException>().having(
            (error) => error.outcomeUncertain,
            'outcomeUncertain',
            isTrue,
          ),
        ),
      );
      expect(
        () => PosApiClient.decodeResponse(_response(408, '{}')),
        throwsA(
          isA<PosApiException>().having(
            (error) => error.outcomeUncertain,
            'outcomeUncertain',
            isTrue,
          ),
        ),
      );
      expect(
        () => PosApiClient.decodeResponse(_response(400, '{}')),
        throwsA(
          isA<PosApiException>().having(
            (error) => error.outcomeUncertain,
            'outcomeUncertain',
            isFalse,
          ),
        ),
      );
    });

    test('rejects an empty successful body instead of inventing success', () {
      expect(
        () => PosApiClient.decodeResponse(_response(200, '')),
        throwsA(
          isA<PosApiException>().having(
            (error) => error.message,
            'message',
            contains('unexpected response'),
          ),
        ),
      );
    });

    test('rejects a successful non-object body', () {
      expect(
        () => PosApiClient.decodeResponse(_response(200, '[]')),
        throwsA(isA<PosApiException>()),
      );
    });
  });
}
