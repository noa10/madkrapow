import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../../core/utils/auth_exceptions.dart';
import '../../orders/data/merchant_api_client.dart';
import 'escpos_printer.dart';
import 'printer_settings.dart';

/// How long to wait for the server to hand out pending jobs before giving up,
/// so a slow network never leaves a claim hanging.
const _claimTimeout = Duration(seconds: 30);

/// Claims print jobs the server has not handed to another device yet and
/// forwards their already-rendered ESC/POS bytes to the local printer.
///
/// The server returns each job at most once, so this can safely run on every
/// realtime order event: when nothing is pending it returns an empty list.
///
/// [printPendingJobs] never throws — a printing problem must not break the
/// order list it is fired from.
class AutoPrintService {
  AutoPrintService({
    required MerchantApiClient api,
    required EscPosPrinter printer,
    required PrinterSettings Function() settings,
  }) : _api = api,
       _printer = printer,
       _settings = settings;

  final MerchantApiClient _api;
  final EscPosPrinter _printer;

  /// Read on every call so a printer address changed in settings applies
  /// immediately, without rebuilding the service.
  final PrinterSettings Function() _settings;

  /// Two realtime events can land together; only the first claim runs and the
  /// second returns immediately, so jobs are never claimed twice in a burst.
  bool _claimInFlight = false;

  /// Claims the server's pending jobs and prints each one verbatim.
  ///
  /// Returns the number of jobs printed. Stops at the first printer failure
  /// and reports how many were printed before it, since the server has already
  /// marked every claimed job as handed out.
  Future<int> printPendingJobs() async {
    if (_claimInFlight) return 0;

    final settings = _settings();
    if (!settings.isConfigured) return 0;

    _claimInFlight = true;
    try {
      final Map<String, dynamic> response;
      try {
        response = await _api
            .post('/print/jobs/claim-staff')
            .timeout(_claimTimeout);
      } on AuthRequiredException {
        // The session expired mid-shift; the order screens handle sign-in.
        return 0;
      } catch (error) {
        debugPrint('AutoPrint: claim failed — $error');
        return 0;
      }

      final jobs = response['jobs'];
      if (jobs is! List) {
        debugPrint('AutoPrint: claim response has no jobs list');
        return 0;
      }

      var printed = 0;
      for (final job in jobs) {
        final bytes = _decodeJobBytes(job);
        if (bytes == null) {
          debugPrint('AutoPrint: skipping a job without usable bytes');
          continue;
        }
        try {
          await _printer.printBytes(settings, bytes);
        } on PrinterUnreachableException catch (error) {
          debugPrint('AutoPrint: printer unreachable — $error');
          break;
        } catch (error) {
          debugPrint('AutoPrint: could not print a job — $error');
          break;
        }
        printed++;
      }
      return printed;
    } finally {
      _claimInFlight = false;
    }
  }

  /// The server sends ESC/POS bytes base64-encoded; anything else is skipped
  /// rather than allowed to fail the whole batch.
  List<int>? _decodeJobBytes(Object? job) {
    if (job is! Map) return null;
    final encoded = job['bytes'];
    if (encoded is! String || encoded.isEmpty) return null;
    try {
      return base64Decode(encoded);
    } on FormatException {
      return null;
    }
  }
}
