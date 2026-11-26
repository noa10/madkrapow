import 'package:shared_preferences/shared_preferences.dart';

/// Network address of the store's ESC/POS receipt printer.
class PrinterSettings {
  const PrinterSettings({
    required this.host,
    required this.port,
    this.enabled = true,
  });

  final String host;
  final int port;

  /// Staff can turn direct printing off (for a device with no printer nearby),
  /// which restores the Android system print dialog.
  final bool enabled;

  /// Direct printing needs both the switch and an address; otherwise receipt
  /// printing falls back to the Android system print dialog.
  bool get isConfigured => enabled && host.trim().isNotEmpty;

  PrinterSettings copyWith({String? host, int? port, bool? enabled}) {
    return PrinterSettings(
      host: host ?? this.host,
      port: port ?? this.port,
      enabled: enabled ?? this.enabled,
    );
  }

  @override
  bool operator ==(Object other) {
    return other is PrinterSettings &&
        other.host == host &&
        other.port == port &&
        other.enabled == enabled;
  }

  @override
  int get hashCode => Object.hash(host, port, enabled);

  @override
  String toString() =>
      'PrinterSettings(host: $host, port: $port, enabled: $enabled)';
}

/// Local copy of the printer address, kept on the device.
class PrinterSettingsStore {
  PrinterSettingsStore(this._prefs);

  final SharedPreferences _prefs;

  static const hostKey = 'receipt_printer_host';
  static const portKey = 'receipt_printer_port';
  static const enabledKey = 'receipt_printer_enabled';
  static const defaultHost = '192.168.0.99';
  static const defaultPort = 9100;

  PrinterSettings read() {
    return PrinterSettings(
      host: _prefs.getString(hostKey) ?? defaultHost,
      port: _prefs.getInt(portKey) ?? defaultPort,
      enabled: _prefs.getBool(enabledKey) ?? true,
    );
  }

  Future<void> write(PrinterSettings settings) async {
    await Future.wait([
      _prefs.setString(hostKey, settings.host.trim()),
      _prefs.setInt(portKey, settings.port),
      _prefs.setBool(enabledKey, settings.enabled),
    ]);
  }
}
