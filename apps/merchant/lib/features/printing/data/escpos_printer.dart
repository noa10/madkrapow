import 'dart:async';
import 'dart:io';

import 'printer_settings.dart';

/// Minimal socket surface used by [EscPosPrinter].
///
/// Tests inject a fake implementation so printing can be verified without a
/// real network connection.
abstract class PrintSocket {
  void add(List<int> data);
  Future<void> flush();
  Future<void> close();
}

/// Opens a [PrintSocket] for the printer's host and port.
typedef PrintSocketConnector =
    Future<PrintSocket> Function(String host, int port, {Duration? timeout});

/// Thrown when the printer cannot be reached, so the UI can offer the system
/// print dialog as a fallback.
class PrinterUnreachableException implements Exception {
  const PrinterUnreachableException(this.message);

  final String message;

  @override
  String toString() => message;
}

class _IoPrintSocket implements PrintSocket {
  _IoPrintSocket(this._socket);

  final Socket _socket;

  @override
  void add(List<int> data) => _socket.add(data);

  @override
  Future<void> flush() => _socket.flush();

  @override
  Future<void> close() async {
    // Close gracefully so the printer receives every buffered byte before the
    // connection goes away; destroy() can discard them.
    try {
      await _socket.close().timeout(const Duration(seconds: 2));
    } catch (_) {
      _socket.destroy();
    }
  }
}

Future<PrintSocket> _connectTcp(
  String host,
  int port, {
  Duration? timeout,
}) async {
  final socket = await Socket.connect(host, port, timeout: timeout);
  return _IoPrintSocket(socket);
}

/// Sends raw ESC/POS bytes to a thermal printer over TCP.
class EscPosPrinter {
  EscPosPrinter({
    PrintSocketConnector? connect,
    this.connectTimeout = const Duration(seconds: 5),
    this.overallTimeout = const Duration(seconds: 15),
  }) : _connect = connect ?? _connectTcp;

  final PrintSocketConnector _connect;
  final Duration connectTimeout;

  /// Upper bound on the whole send, so the UI never waits forever.
  final Duration overallTimeout;

  Future<void> printBytes(PrinterSettings settings, List<int> bytes) async {
    try {
      await _send(settings, bytes).timeout(overallTimeout);
    } on TimeoutException {
      throw const PrinterUnreachableException(
        'The printer did not respond in time. The receipt may still print — '
        'check the printer before retrying.',
      );
    } on SocketException {
      throw const PrinterUnreachableException(
        'Could not reach the printer. Check that it is powered on and on the '
        'same network.',
      );
    }
  }

  Future<void> _send(PrinterSettings settings, List<int> bytes) async {
    PrintSocket? socket;
    try {
      socket = await _connect(
        settings.host,
        settings.port,
        timeout: connectTimeout,
      );
      socket.add(bytes);
      await socket.flush();
    } finally {
      final opened = socket;
      if (opened != null) {
        try {
          await opened.close();
        } catch (_) {
          // Closing is best-effort; the send result is already decided.
        }
      }
    }
  }
}
