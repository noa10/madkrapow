import 'semver.dart';

/// A parsed GitHub release candidate for this app.
class UpdateInfo {
  const UpdateInfo({
    required this.tag,
    required this.version,
    required this.releaseNotes,
    required this.apkUrl,
    required this.apkSizeBytes,
    required this.publishedAt,
  });

  final String tag;
  final SemVer version;
  final String releaseNotes;
  final String apkUrl;
  final int apkSizeBytes;
  final DateTime publishedAt;

  String get prettySize {
    if (apkSizeBytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    double size = apkSizeBytes.toDouble();
    var unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return '${size.toStringAsFixed(size >= 10 || unit == 0 ? 0 : 1)} ${units[unit]}';
  }
}
