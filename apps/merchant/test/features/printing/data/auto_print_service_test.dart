import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/core/utils/auth_exceptions.dart';
import 'package:madkrapow_merchant/features/orders/data/merchant_api_client.dart';
import 'package:madkrapow_merchant/features/printing/data/auto_print_service.dart';
import 'package:madkrapow_merchant/features/printing/data/escpos_printer.dart';
import 'package:madkrapow_merchant/features/printing/data/printer_settings.dart';
import 'package:mocktail/mocktail.dart';

class MockMerchantApiClient extends Mock implements MerchantApiClient {}

/// Records the bytes it is given, optionally failing on a given call so the
/// loop's stop behaviour can be observed.
class RecordingPrinter extends EscPosPrinter {
  RecordingPrinter({
    this.failOnCall,
    this.error = const PrinterUnreachableException('printer is offline'),
  });

  final int? failOnCall;
  final Object error;
  final printed = <List<int>>[];
  final printedSettings = <PrinterSettings>[];
  int calls = 0;

  @override
  Future<void> printBytes(PrinterSettings settings, List<int> bytes) async {
    calls++;
    if (failOnCall != null && calls >= failOnCall!) throw error;
    printedSettings.add(settings);
    printed.add(List<int>.of(bytes));
  }
}

const settings = PrinterSettings(host: '192.168.0.99', port: 9100);
const orderId = 'ef72d60e-9e92-4b0a-a0a9-cd3b4095780a';

Map<String, dynamic> job(String type, List<int> bytes) {
  return {
    'job_id': '$orderId:$type',
    'order_id': orderId,
    'type': type,
    'bytes': base64Encode(bytes),
  };
}

void main() {
  late MockMerchantApiClient api;
  late RecordingPrinter printer;

  setUp(() {
    api = MockMerchantApiClient();
    printer = RecordingPrinter();
  });

  AutoPrintService buildService({PrinterSettings printerSettings = settings}) {
    return AutoPrintService(
      api: api,
      printer: printer,
      settings: () => printerSettings,
    );
  }

  test('prints every job returned by the claim without re-rendering', () async {
    when(() => api.post('/print/jobs/claim-staff')).thenAnswer(
      (_) async => {
        'ok': true,
        'jobs': [
          job('kitchen_docket', [0x1B, 0x40, 0x01]),
          job('receipt', [0x1B, 0x40, 0x02]),
          job('grabfood_ticket', [0x1B, 0x40, 0x03]),
        ],
      },
    );

    final printed = await buildService().printPendingJobs();

    expect(printed, 3);
    expect(printer.printed, [
      [0x1B, 0x40, 0x01],
      [0x1B, 0x40, 0x02],
      [0x1B, 0x40, 0x03],
    ]);
    expect(printer.printedSettings, [settings, settings, settings]);
    verify(() => api.post('/print/jobs/claim-staff')).called(1);
    verifyNoMoreInteractions(api);
  });

  test('does not claim anything when the printer has no address', () async {
    final printed = await buildService(
      printerSettings: const PrinterSettings(host: '   ', port: 9100),
    ).printPendingJobs();

    expect(printed, 0);
    expect(printer.calls, 0);
    verifyNever(() => api.post('/print/jobs/claim-staff'));
  });

  test('does not claim anything when direct printing is disabled', () async {
    final printed = await buildService(
      printerSettings: const PrinterSettings(
        host: '192.168.0.99',
        port: 9100,
        enabled: false,
      ),
    ).printPendingJobs();

    expect(printed, 0);
    expect(printer.calls, 0);
    verifyNever(() => api.post('/print/jobs/claim-staff'));
  });

  test('a printer failure stops the loop without throwing', () async {
    printer = RecordingPrinter(failOnCall: 2);
    when(() => api.post('/print/jobs/claim-staff')).thenAnswer(
      (_) async => {
        'ok': true,
        'jobs': [
          job('kitchen_docket', [0x1B, 0x40, 0x01]),
          job('receipt', [0x1B, 0x40, 0x02]),
          job('grabfood_ticket', [0x1B, 0x40, 0x03]),
        ],
      },
    );

    final printed = await buildService().printPendingJobs();

    expect(printed, 1);
    expect(printer.calls, 2);
    expect(printer.printed.single, [0x1B, 0x40, 0x01]);
  });

  test('an auth failure returns zero without printing', () async {
    when(
      () => api.post('/print/jobs/claim-staff'),
    ).thenThrow(const AuthRequiredException('expired'));

    final printed = await buildService().printPendingJobs();

    expect(printed, 0);
    expect(printer.calls, 0);
  });

  test(
    'a job without usable bytes is skipped without failing the batch',
    () async {
      when(() => api.post('/print/jobs/claim-staff')).thenAnswer(
        (_) async => {
          'ok': true,
          'jobs': [
            {'job_id': '$orderId:receipt', 'order_id': orderId, 'bytes': ''},
            job('receipt', [0x1B, 0x40, 0x09]),
          ],
        },
      );

      final printed = await buildService().printPendingJobs();

      expect(printed, 1);
      expect(printer.printed.single, [0x1B, 0x40, 0x09]);
    },
  );

  test('the re-entrancy guard prevents a second concurrent claim', () async {
    final response = Completer<Map<String, dynamic>>();
    when(
      () => api.post('/print/jobs/claim-staff'),
    ).thenAnswer((_) => response.future);
    final service = buildService();

    final first = service.printPendingJobs();
    expect(await service.printPendingJobs(), 0);

    response.complete({
      'ok': true,
      'jobs': [
        job('receipt', [0x1B, 0x40, 0x07]),
      ],
    });
    expect(await first, 1);

    verify(() => api.post('/print/jobs/claim-staff')).called(1);
    expect(printer.printed.single, [0x1B, 0x40, 0x07]);
  });
}
