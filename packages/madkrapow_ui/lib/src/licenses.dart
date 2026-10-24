import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Registers the bundled Plus Jakarta Sans font license so it appears in the
/// app's open-source licenses page. Call once after `ensureInitialized()`.
void registerMadkrapowUiLicenses() {
  LicenseRegistry.addLicense(() async* {
    final license = await rootBundle.loadString(
      'packages/madkrapow_ui/assets/fonts/OFL.txt',
    );
    yield LicenseEntryWithLineBreaks(const ['Plus Jakarta Sans'], license);
  });
}
