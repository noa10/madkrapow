import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../orders/providers/admin_order_providers.dart';
import '../data/auto_print_service.dart';
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

/// Claims jobs the server has not printed anywhere else and sends them to the
/// device's printer. Reads the printer settings on every claim so a change in
/// the settings screen applies without restarting the app.
final autoPrintServiceProvider = Provider<AutoPrintService>((ref) {
  return AutoPrintService(
    api: ref.watch(merchantApiClientProvider),
    printer: ref.watch(escPosPrinterProvider),
    settings: () => ref.read(printerSettingsProvider),
  );
});
