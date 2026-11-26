import 'dart:convert';

import '../../../core/utils/auth_exceptions.dart';
import '../../orders/data/merchant_api_client.dart';
import 'escpos_printer.dart';
import 'printer_settings.dart';

/// The order cannot be printed by this account — the server denies access to
/// orders outside the caller's role (for example a kitchen user reprinting a
/// completed delivery order).
class ReceiptNotAvailableException implements Exception {
  const ReceiptNotAvailableException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// How long to wait for the server to render the receipt before giving up, so
/// the print button can never spin forever.
const _renderTimeout = Duration(seconds: 30);

/// Fetches a rendered print job from the web API and prints it over ESC/POS.
///
/// [type] is `receipt`, `kitchen_docket` or `grabfood_ticket`; the server builds
/// every job so the app never recomputes order totals.
///
/// Throws [FormatException] when the server response carries no usable bytes,
/// [ReceiptNotAvailableException] when the order is not printable by this
/// account, and [PrinterUnreachableException] when the printer cannot be
/// reached.
Future<void> printReceipt({
  required MerchantApiClient api,
  required EscPosPrinter printer,
  required PrinterSettings settings,
  required String orderId,
  String type = 'receipt',
}) async {
  final Map<String, dynamic> response;
  try {
    response = await api
        .post('/print/jobs/render', {
          'order_id': orderId,
          'type': type,
          'reprint': true,
        })
        .timeout(_renderTimeout);
  } on AuthRequiredException {
    rethrow;
  } catch (error) {
    // The render route answers 404 for orders this account may not print, and
    // the client surfaces the server's message. Anything else stays generic.
    if (error.toString().contains('Order not found')) {
      throw const ReceiptNotAvailableException(
        'This order is not available to your role, so it cannot be printed.',
      );
    }
    rethrow;
  }
  final encoded = response['bytes'];
  if (encoded is! String || encoded.isEmpty) {
    throw const FormatException('Receipt render response is missing bytes');
  }
  final bytes = base64Decode(encoded);
  await printer.printBytes(settings, bytes);
}

/// Prints a small hardcoded receipt so staff can verify the printer address.
Future<void> printTestSlip({
  required EscPosPrinter printer,
  required PrinterSettings settings,
}) async {
  await printer.printBytes(settings, _buildTestSlip());
}

List<int> _buildTestSlip() {
  final now = DateTime.now();
  String two(int value) => value.toString().padLeft(2, '0');
  final timestamp =
      '${now.year}-${two(now.month)}-${two(now.day)} '
      '${two(now.hour)}:${two(now.minute)}';

  return [
    0x1B, 0x40, // ESC @ — initialize
    0x1B, 0x61, 0x01, // ESC a 1 — center align
    0x1B, 0x45, 0x01, // ESC E 1 — bold on
    ...ascii.encode('MAD KRAPOW\n'),
    0x1B, 0x45, 0x00, // ESC E 0 — bold off
    ...ascii.encode('PRINTER TEST\n'),
    ...ascii.encode('$timestamp\n'),
    ...ascii.encode('\n'),
    0x1B, 0x64, 0x03, // ESC d 3 — feed 3 lines
    0x1D, 0x56, 0x42, 0x00, // GS V B 0 — partial cut
  ];
}
