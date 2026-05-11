import 'package:shared_preferences/shared_preferences.dart';

/// Persistent settings for the in-app updater, backed by [SharedPreferences].
class UpdateSettingsService {
  UpdateSettingsService(this._prefs);

  final SharedPreferences _prefs;

  static const _kAutoUpdateWifi = 'updater.auto_update_wifi';
  static const _kAutoUpdateMobile = 'updater.auto_update_mobile';
  static const _kLastCheckMs = 'updater.last_check_ms';
  static const _kLastPromptMs = 'updater.last_prompt_ms';
  static const _kSkippedVersion = 'updater.skipped_version';
  static const _kCachedTag = 'updater.cached_tag';
  static const _kCachedNotes = 'updater.cached_notes';
  static const _kCachedApkUrl = 'updater.cached_apk_url';
  static const _kCachedApkSize = 'updater.cached_apk_size';
  static const _kCachedPublishedAt = 'updater.cached_published_at_ms';
  static const _kLastInstalledVersion = 'updater.last_installed_version';
  static const _kWhatsNewPending = 'updater.whats_new_pending';
  static const _kWhatsNewBody = 'updater.whats_new_body';
  static const _kWhatsNewVersion = 'updater.whats_new_version';

  static Future<UpdateSettingsService> create() async {
    final prefs = await SharedPreferences.getInstance();
    return UpdateSettingsService(prefs);
  }

  bool get autoUpdateOnWifi => _prefs.getBool(_kAutoUpdateWifi) ?? true;
  Future<void> setAutoUpdateOnWifi(bool value) =>
      _prefs.setBool(_kAutoUpdateWifi, value);

  bool get autoUpdateOnMobile => _prefs.getBool(_kAutoUpdateMobile) ?? false;
  Future<void> setAutoUpdateOnMobile(bool value) =>
      _prefs.setBool(_kAutoUpdateMobile, value);

  DateTime? get lastCheck {
    final ms = _prefs.getInt(_kLastCheckMs);
    return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms);
  }

  Future<void> markChecked([DateTime? when]) => _prefs.setInt(
        _kLastCheckMs,
        (when ?? DateTime.now()).millisecondsSinceEpoch,
      );

  DateTime? get lastPrompt {
    final ms = _prefs.getInt(_kLastPromptMs);
    return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms);
  }

  Future<void> markPromptShown([DateTime? when]) => _prefs.setInt(
        _kLastPromptMs,
        (when ?? DateTime.now()).millisecondsSinceEpoch,
      );

  String? get skippedVersion => _prefs.getString(_kSkippedVersion);
  Future<void> skipVersion(String version) =>
      _prefs.setString(_kSkippedVersion, version);
  Future<void> clearSkippedVersion() => _prefs.remove(_kSkippedVersion);

  ({
    String? tag,
    String? notes,
    String? apkUrl,
    int? apkSize,
    DateTime? publishedAt,
  }) get cachedRelease {
    final publishedAtMs = _prefs.getInt(_kCachedPublishedAt);
    return (
      tag: _prefs.getString(_kCachedTag),
      notes: _prefs.getString(_kCachedNotes),
      apkUrl: _prefs.getString(_kCachedApkUrl),
      apkSize: _prefs.getInt(_kCachedApkSize),
      publishedAt: publishedAtMs == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(publishedAtMs),
    );
  }

  Future<void> cacheRelease({
    required String tag,
    required String notes,
    required String apkUrl,
    required int apkSize,
    required DateTime publishedAt,
  }) async {
    await _prefs.setString(_kCachedTag, tag);
    await _prefs.setString(_kCachedNotes, notes);
    await _prefs.setString(_kCachedApkUrl, apkUrl);
    await _prefs.setInt(_kCachedApkSize, apkSize);
    await _prefs.setInt(
      _kCachedPublishedAt,
      publishedAt.millisecondsSinceEpoch,
    );
  }

  String? get lastInstalledVersion =>
      _prefs.getString(_kLastInstalledVersion);

  Future<void> setLastInstalledVersion(String version) =>
      _prefs.setString(_kLastInstalledVersion, version);

  bool get whatsNewPending => _prefs.getBool(_kWhatsNewPending) ?? false;
  String? get whatsNewBody => _prefs.getString(_kWhatsNewBody);
  String? get whatsNewVersion => _prefs.getString(_kWhatsNewVersion);

  Future<void> queueWhatsNew({
    required String version,
    required String body,
  }) async {
    await _prefs.setBool(_kWhatsNewPending, true);
    await _prefs.setString(_kWhatsNewBody, body);
    await _prefs.setString(_kWhatsNewVersion, version);
  }

  Future<void> clearWhatsNew() async {
    await _prefs.setBool(_kWhatsNewPending, false);
    await _prefs.remove(_kWhatsNewBody);
    await _prefs.remove(_kWhatsNewVersion);
  }
}
