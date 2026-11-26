import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/escpos_printer.dart';
import '../data/printer_settings.dart';

/// Overridden in `main()` with the loaded [SharedPreferences] instance.
final printerSettingsStoreProvider = Provider<PrinterSettingsStore>((ref) {
  throw UnimplementedError('printerSettingsStoreProvider must be overridden');
});

/// The device's printer address, initialised synchronously from local storage.
class PrinterSettingsController extends Notifier<PrinterSettings> {
  @override
  PrinterSettings build() {
    return ref.watch(printerSettingsStoreProvider).read();
  }

  Future<void> save(PrinterSettings next) async {
    await ref.read(printerSettingsStoreProvider).write(next);
    state = next;
  }
}

final printerSettingsProvider =
    NotifierProvider<PrinterSettingsController, PrinterSettings>(
      PrinterSettingsController.new,
    );

final escPosPrinterProvider = Provider<EscPosPrinter>((ref) {
  return EscPosPrinter();
});
