import 'dart:io';

/// Resolves a localhost API URL to the platform-appropriate host.
///
/// - Android emulator: localhost -> 10.0.2.2
/// - iOS simulator / web / desktop: localhost unchanged
/// - Physical devices: user must set their machine's LAN IP in .env
String resolveApiUrl(String rawUrl) {
  if (!rawUrl.contains('localhost')) return rawUrl;

  if (Platform.isAndroid) {
    return rawUrl.replaceFirst('localhost', '10.0.2.2');
  }

  return rawUrl;
}
