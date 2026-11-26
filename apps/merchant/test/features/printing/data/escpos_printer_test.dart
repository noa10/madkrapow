import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/printing/data/escpos_printer.dart';
import 'package:madkrapow_merchant/features/printing/data/printer_settings.dart';

const settings = PrinterSettings(host: '192.168.0.99', port: 9100);

class FakePrintSocket implements PrintSocket {
  final written = <int>[];
  bool flushed = false;
  bool closed = false;

  @override
  void add(List<int> data) => written.addAll(data);

  @override
  Future<void> flush() async {
    flushed = true;
  }

  @override
  Future<void> close() async {
    closed = true;
  }
}

void main() {
  test('writes the exact bytes to the configured host and port', () async {
    final socket = FakePrintSocket();
    String? connectedHost;
    int? connectedPort;
    Duration? connectedTimeout;
    final printer = EscPosPrinter(
      connect: (host, port, {timeout}) async {
        connectedHost = host;
        connectedPort = port;
        connectedTimeout = timeout;
        return socket;
      },
    );

    await printer.printBytes(settings, [0x1B, 0x40, 0x41]);

    expect(connectedHost, '192.168.0.99');
    expect(connectedPort, 9100);
    expect(connectedTimeout, const Duration(seconds: 5));
    expect(socket.written, [0x1B, 0x40, 0x41]);
    expect(socket.flushed, isTrue);
    expect(socket.closed, isTrue);
  });

  test('a socket error surfaces as PrinterUnreachableException', () async {
    final printer = EscPosPrinter(
      connect: (host, port, {timeout}) async =>
          throw const SocketException('Connection refused'),
    );

    await expectLater(
      printer.printBytes(settings, [0x1B, 0x40]),
      throwsA(isA<PrinterUnreachableException>()),
    );
  });

  test('a connect timeout surfaces as PrinterUnreachableException', () async {
    final printer = EscPosPrinter(
      connect: (host, port, {timeout}) async =>
          throw TimeoutException('connect timed out', timeout),
    );

    await expectLater(
      printer.printBytes(settings, [0x1B, 0x40]),
      throwsA(isA<PrinterUnreachableException>()),
    );
  });

  test('the overall guard stops a printer that never responds', () async {
    final printer = EscPosPrinter(
      connect: (host, port, {timeout}) => Completer<PrintSocket>().future,
      overallTimeout: const Duration(milliseconds: 20),
    );

    await expectLater(
      printer.printBytes(settings, [0x1B, 0x40]),
      throwsA(isA<PrinterUnreachableException>()),
    );
  });

  test('a flush error is reported as PrinterUnreachableException', () async {
    final printer = EscPosPrinter(
      connect: (host, port, {timeout}) async => _FlushFailingSocket(),
    );

    await expectLater(
      printer.printBytes(settings, [0x1B, 0x40]),
      throwsA(isA<PrinterUnreachableException>()),
    );
  });
}

class _FlushFailingSocket implements PrintSocket {
  @override
  void add(List<int> data) {}

  @override
  Future<void> flush() async => throw const SocketException('broken pipe');

  @override
  Future<void> close() async {}
}
