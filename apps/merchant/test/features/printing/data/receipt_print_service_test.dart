import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/utils/auth_exceptions.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_api_client.dart';
import 'package:madkrapow_merchant/features/printing/data/escpos_printer.dart';
import 'package:madkrapow_merchant/features/printing/data/printer_settings.dart';
import 'package:madkrapow_merchant/features/printing/data/receipt_print_service.dart';
import 'package:mocktail/mocktail.dart';

class MockMerchantApiClient extends Mock implements MerchantApiClient {}

class RecordingPrinter extends EscPosPrinter {
  final printed = <List<int>>[];
  final printedSettings = <PrinterSettings>[];

  @override
  Future<void> printBytes(PrinterSettings settings, List<int> bytes) async {
    printedSettings.add(settings);
    printed.add(List<int>.of(bytes));
  }
}

const settings = PrinterSettings(host: '192.168.0.99', port: 9100);
const orderId = 'ef72d60e-9e92-4b0a-a0a9-cd3b4095780a';

void main() {
  late MockMerchantApiClient api;
  late RecordingPrinter printer;

  setUp(() {
    api = MockMerchantApiClient();
    printer = RecordingPrinter();
  });

  test(
    'requests the rendered receipt and forwards the decoded bytes',
    () async {
      Map<String, dynamic>? requestBody;
      when(() => api.post('/print/jobs/render', any())).thenAnswer((
        invocation,
      ) {
        requestBody =
            invocation.positionalArguments[1] as Map<String, dynamic>?;
        return Future.value({
          'ok': true,
          'order_id': orderId,
          'order_number': 'MK-1001',
          'type': 'receipt',
          'reprint': true,
          'bytes': base64Encode([0x1B, 0x40, 0x48, 0x69]),
        });
      });

      await printReceipt(
        api: api,
        printer: printer,
        settings: settings,
        orderId: orderId,
      );

      expect(requestBody, {
        'order_id': orderId,
        'type': 'receipt',
        'reprint': true,
      });
      expect(printer.printed.single, [0x1B, 0x40, 0x48, 0x69]);
      expect(printer.printedSettings.single, settings);
    },
  );

  test('throws FormatException when the response has no bytes', () async {
    when(
      () => api.post('/print/jobs/render', any()),
    ).thenAnswer((_) async => {'ok': true});

    await expectLater(
      printReceipt(
        api: api,
        printer: printer,
        settings: settings,
        orderId: orderId,
      ),
      throwsA(isA<FormatException>()),
    );
    expect(printer.printed, isEmpty);
  });

  test('throws FormatException when the bytes are not valid base64', () async {
    when(
      () => api.post('/print/jobs/render', any()),
    ).thenAnswer((_) async => {'bytes': 'not base64!'});

    await expectLater(
      printReceipt(
        api: api,
        printer: printer,
        settings: settings,
        orderId: orderId,
      ),
      throwsA(isA<FormatException>()),
    );
    expect(printer.printed, isEmpty);
  });

  test(
    'reports a denied order as not available, not as a retryable failure',
    () async {
      when(
        () => api.post('/print/jobs/render', any()),
      ).thenAnswer((_) async => throw Exception('Order not found'));

      await expectLater(
        printReceipt(
          api: api,
          printer: printer,
          settings: settings,
          orderId: orderId,
        ),
        throwsA(isA<ReceiptNotAvailableException>()),
      );
      expect(printer.printed, isEmpty);
    },
  );

  test(
    'lets session errors through so the screen can prompt a sign-in',
    () async {
      when(
        () => api.post('/print/jobs/render', any()),
      ).thenAnswer((_) async => throw const AuthRequiredException('expired'));

      await expectLater(
        printReceipt(
          api: api,
          printer: printer,
          settings: settings,
          orderId: orderId,
        ),
        throwsA(isA<AuthRequiredException>()),
      );
      expect(printer.printed, isEmpty);
    },
  );

  test('printTestSlip sends an ESC/POS receipt with a partial cut', () async {
    await printTestSlip(printer: printer, settings: settings);

    final bytes = printer.printed.single;
    expect(bytes.take(2), [0x1B, 0x40]);
    expect(ascii.decode(bytes), contains('PRINTER TEST'));
    expect(ascii.decode(bytes), contains('MAD KRAPOW'));
    expect(bytes.sublist(bytes.length - 4), [0x1D, 0x56, 0x42, 0x00]);
    expect(printer.printedSettings.single, settings);
  });
}
