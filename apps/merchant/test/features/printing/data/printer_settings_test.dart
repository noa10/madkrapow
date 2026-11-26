import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/printing/data/printer_settings.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('read returns the defaults when nothing is stored', () async {
    final store = PrinterSettingsStore(await SharedPreferences.getInstance());

    final settings = store.read();

    expect(settings.host, '192.168.0.99');
    expect(settings.port, 9100);
    expect(settings.isConfigured, isTrue);
  });

  test('write persists the settings and read round-trips them', () async {
    final prefs = await SharedPreferences.getInstance();
    final store = PrinterSettingsStore(prefs);

    await store.write(const PrinterSettings(host: '10.0.0.5', port: 9200));

    expect(prefs.getString(PrinterSettingsStore.hostKey), '10.0.0.5');
    expect(prefs.getInt(PrinterSettingsStore.portKey), 9200);
    final reloaded = PrinterSettingsStore(
      await SharedPreferences.getInstance(),
    ).read();
    expect(reloaded, const PrinterSettings(host: '10.0.0.5', port: 9200));
  });

  test('write trims the host', () async {
    final prefs = await SharedPreferences.getInstance();
    final store = PrinterSettingsStore(prefs);

    await store.write(const PrinterSettings(host: '  10.0.0.7  ', port: 9100));

    expect(store.read().host, '10.0.0.7');
  });

  test('read prefers stored values over the defaults', () async {
    SharedPreferences.setMockInitialValues({
      PrinterSettingsStore.hostKey: '172.16.0.9',
      PrinterSettingsStore.portKey: 1234,
    });
    final store = PrinterSettingsStore(await SharedPreferences.getInstance());

    final settings = store.read();

    expect(settings.host, '172.16.0.9');
    expect(settings.port, 1234);
  });

  test('a blank host means the printer is not configured', () {
    const settings = PrinterSettings(host: '   ', port: 9100);

    expect(settings.isConfigured, isFalse);
  });

  test('a disabled switch means the printer is not configured', () {
    const settings = PrinterSettings(
      host: '192.168.0.99',
      port: 9100,
      enabled: false,
    );

    expect(settings.isConfigured, isFalse);
  });

  test('write persists the enabled switch and read round-trips it', () async {
    final store = PrinterSettingsStore(await SharedPreferences.getInstance());

    await store.write(
      const PrinterSettings(host: '10.0.0.5', port: 9200, enabled: false),
    );

    expect(store.read().enabled, isFalse);
    expect(store.read().isConfigured, isFalse);
  });

  test('copyWith replaces only the provided fields', () {
    const settings = PrinterSettings(host: '192.168.0.99', port: 9100);

    expect(settings.copyWith(port: 9200).host, '192.168.0.99');
    expect(settings.copyWith(port: 9200).port, 9200);
    expect(settings.copyWith(host: '10.0.0.1').host, '10.0.0.1');
    expect(settings.copyWith(host: '10.0.0.1').port, 9100);
  });
}
