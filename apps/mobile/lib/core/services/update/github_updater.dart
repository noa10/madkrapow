import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:isolate';
import 'dart:ui';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_downloader/flutter_downloader.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

import 'semver.dart';
import 'update_info.dart';
import 'update_settings_service.dart';
import 'updater_config.dart';

const Duration _kCheckInterval = Duration(hours: 6);
const Duration _kRePromptInterval = Duration(hours: 24);
const Duration _kApiTimeout = Duration(seconds: 10);

enum UpdateCheckStatus {
  updateAvailable,
  upToDate,
  skipped,
  error,
}

class UpdateCheckResult {
  const UpdateCheckResult({
    required this.status,
    this.info,
    this.error,
    this.currentVersion,
  });

  final UpdateCheckStatus status;
  final UpdateInfo? info;
  final String? error;
  final SemVer? currentVersion;

  bool get hasUpdate =>
      status == UpdateCheckStatus.updateAvailable && info != null;
}

class _GithubUpdaterPorts {
  static const name = 'github_updater_download_port';
}

ReceivePort? _globalDownloadPort;

@pragma('vm:entry-point')
void _flutterDownloaderCallback(String id, int status, int progress) {
  final send = IsolateNameServer.lookupPortByName(_GithubUpdaterPorts.name);
  send?.send([id, status, progress]);
}

class GithubUpdater {
  GithubUpdater({
    required this.config,
    required this.settings,
    http.Client? httpClient,
    Connectivity? connectivity,
    PackageInfo? packageInfo,
  })  : _http = httpClient ?? http.Client(),
        _connectivity = connectivity ?? Connectivity(),
        _packageInfoOverride = packageInfo;

  final UpdaterConfig config;
  final UpdateSettingsService settings;
  final http.Client _http;
  final Connectivity _connectivity;
  final PackageInfo? _packageInfoOverride;

  PackageInfo? _packageInfoCache;
  bool _downloaderReady = false;
  String? _activeDownloadTaskId;
  final _downloadCompleter = <String, Completer<String?>>{};
  final _progressControllers = <String, StreamController<int>>{};

  Future<PackageInfo> _packageInfo() async {
    if (_packageInfoOverride != null) return _packageInfoOverride;
    return _packageInfoCache ??= await PackageInfo.fromPlatform();
  }

  Future<void> initDownloader() async {
    if (_downloaderReady) return;
    if (!Platform.isAndroid) {
      _downloaderReady = true;
      return;
    }
    try {
      await FlutterDownloader.initialize(debug: kDebugMode);
      _globalDownloadPort ??= ReceivePort();
      IsolateNameServer.removePortNameMapping(_GithubUpdaterPorts.name);
      IsolateNameServer.registerPortWithName(
        _globalDownloadPort!.sendPort,
        _GithubUpdaterPorts.name,
      );
      _globalDownloadPort!.listen(_onDownloaderEvent);
      await FlutterDownloader.registerCallback(_flutterDownloaderCallback);
      _downloaderReady = true;
    } catch (e, st) {
      _log('Downloader init failed: $e', error: st);
    }
  }

  void _onDownloaderEvent(dynamic data) {
    if (data is! List || data.length < 3) return;
    final taskId = data[0] as String;
    final statusInt = data[1] as int;
    final progress = data[2] as int;
    final status = DownloadTaskStatus.fromInt(statusInt);

    final progressCtl = _progressControllers[taskId];
    if (progressCtl != null && !progressCtl.isClosed) {
      progressCtl.add(progress);
    }

    final completer = _downloadCompleter[taskId];
    if (completer == null || completer.isCompleted) return;

    if (status == DownloadTaskStatus.complete) {
      FlutterDownloader.loadTasksWithRawQuery(
        query: "SELECT * FROM task WHERE task_id='$taskId'",
      ).then((tasks) {
        if (tasks == null || tasks.isEmpty) {
          completer.complete(null);
          return;
        }
        final t = tasks.first;
        final path = '${t.savedDir}${Platform.pathSeparator}${t.filename ?? ''}';
        completer.complete(path);
      });
    } else if (status == DownloadTaskStatus.failed ||
        status == DownloadTaskStatus.canceled) {
      completer.complete(null);
    }
  }

  Future<UpdateCheckResult> check({bool force = false}) async {
    if (!Platform.isAndroid) {
      return const UpdateCheckResult(status: UpdateCheckStatus.upToDate);
    }
    final last = settings.lastCheck;
    if (!force &&
        last != null &&
        DateTime.now().difference(last) < _kCheckInterval) {
      _log('Skipping check (last=${last.toIso8601String()})');
      final cached = _cachedInfo();
      if (cached == null) {
        return const UpdateCheckResult(status: UpdateCheckStatus.upToDate);
      }
      return _evaluate(cached);
    }

    try {
      final info = await _fetchLatest();
      await settings.markChecked();
      if (info == null) {
        _log('No release found for prefix ${config.tagPrefix}');
        return const UpdateCheckResult(status: UpdateCheckStatus.upToDate);
      }
      await settings.cacheRelease(
        tag: info.tag,
        notes: info.releaseNotes,
        apkUrl: info.apkUrl,
        apkSize: info.apkSizeBytes,
        publishedAt: info.publishedAt,
      );
      return _evaluate(info);
    } on TimeoutException {
      _log('GitHub check timed out');
      return const UpdateCheckResult(
        status: UpdateCheckStatus.error,
        error: 'Timed out reaching GitHub',
      );
    } catch (e, st) {
      _log('Check failed: $e', error: st);
      return UpdateCheckResult(
        status: UpdateCheckStatus.error,
        error: e.toString(),
      );
    }
  }

  UpdateInfo? _cachedInfo() {
    final c = settings.cachedRelease;
    if (c.tag == null || c.apkUrl == null || c.publishedAt == null) {
      return null;
    }
    final version = _parseTag(c.tag!);
    if (version == null) return null;
    return UpdateInfo(
      tag: c.tag!,
      version: version,
      releaseNotes: c.notes ?? '',
      apkUrl: c.apkUrl!,
      apkSizeBytes: c.apkSize ?? 0,
      publishedAt: c.publishedAt!,
    );
  }

  Future<UpdateCheckResult> _evaluate(UpdateInfo info) async {
    final pkg = await _packageInfo();
    final current = SemVer.tryParse(pkg.version);
    if (current == null) {
      _log('Could not parse current version "${pkg.version}"');
      return const UpdateCheckResult(
        status: UpdateCheckStatus.error,
        error: 'Current version unparseable',
      );
    }
    if (info.version <= current) {
      if (settings.lastInstalledVersion != pkg.version) {
        await settings.setLastInstalledVersion(pkg.version);
      }
      return UpdateCheckResult(
        status: UpdateCheckStatus.upToDate,
        currentVersion: current,
      );
    }
    if (settings.skippedVersion == info.version.toString()) {
      return UpdateCheckResult(
        status: UpdateCheckStatus.skipped,
        info: info,
        currentVersion: current,
      );
    }
    return UpdateCheckResult(
      status: UpdateCheckStatus.updateAvailable,
      info: info,
      currentVersion: current,
    );
  }

  Future<UpdateInfo?> _fetchLatest() async {
    final headers = <String, String>{
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'madkrapow-${config.appType}-updater',
      if (config.githubToken != null && config.githubToken!.isNotEmpty)
        'Authorization': 'Bearer ${config.githubToken}',
    };
    final resp = await _http
        .get(config.releasesEndpoint, headers: headers)
        .timeout(_kApiTimeout);
    if (resp.statusCode == 403 && resp.headers['x-ratelimit-remaining'] == '0') {
      throw StateError('GitHub rate limit exhausted');
    }
    if (resp.statusCode != 200) {
      throw StateError('GitHub API ${resp.statusCode}');
    }
    final decoded = jsonDecode(resp.body);
    if (decoded is! List) return null;

    UpdateInfo? best;
    for (final item in decoded) {
      if (item is! Map) continue;
      if (item['draft'] == true) continue;
      final tag = item['tag_name'];
      if (tag is! String || !tag.startsWith(config.tagPrefix)) continue;
      final version = _parseTag(tag);
      if (version == null) continue;
      final assets = item['assets'];
      if (assets is! List || assets.isEmpty) continue;
      Map? apkAsset;
      for (final a in assets.cast<Map>()) {
        final name = a['name'];
        if (name is String && name.toLowerCase().endsWith('.apk')) {
          apkAsset = a;
          break;
        }
      }
      if (apkAsset == null) continue;
      final url = apkAsset['browser_download_url'] as String?;
      if (url == null) continue;
      final size = (apkAsset['size'] is int) ? apkAsset['size'] as int : 0;
      final publishedAtRaw =
          item['published_at'] as String? ?? item['created_at'] as String?;
      final publishedAt = publishedAtRaw != null
          ? DateTime.tryParse(publishedAtRaw) ?? DateTime.now()
          : DateTime.now();
      final candidate = UpdateInfo(
        tag: tag,
        version: version,
        releaseNotes: item['body'] as String? ?? '',
        apkUrl: url,
        apkSizeBytes: size,
        publishedAt: publishedAt,
      );
      if (best == null || candidate.version > best.version) {
        best = candidate;
      }
    }
    return best;
  }

  SemVer? _parseTag(String tag) {
    if (!tag.startsWith(config.tagPrefix)) return null;
    return SemVer.tryParse(tag.substring(config.tagPrefix.length));
  }

  Future<bool> shouldAutoDownload() async {
    if (!Platform.isAndroid) return false;
    final conns = await _connectivity.checkConnectivity();
    final onWifi = conns.contains(ConnectivityResult.wifi) ||
        conns.contains(ConnectivityResult.ethernet);
    final onMobile = conns.contains(ConnectivityResult.mobile);
    if (onWifi && settings.autoUpdateOnWifi) return true;
    if (onMobile && settings.autoUpdateOnMobile) return true;
    return false;
  }

  ({Stream<int> progress, Future<String?> done}) download(UpdateInfo info) {
    final progressController = StreamController<int>.broadcast();
    final doneCompleter = Completer<String?>();

    () async {
      try {
        await initDownloader();
        if (!Platform.isAndroid) {
          progressController.close();
          doneCompleter.complete(null);
          return;
        }

        final dir = await _downloadDir();
        final filename = _filenameFor(info);
        final target = File('${dir.path}${Platform.pathSeparator}$filename');
        if (await target.exists()) {
          try {
            await target.delete();
          } catch (_) {/* ignore */}
        }

        final previousId = _activeDownloadTaskId;
        if (previousId != null) {
          try {
            await FlutterDownloader.cancel(taskId: previousId);
          } catch (_) {/* ignore */}
        }

        final taskId = await FlutterDownloader.enqueue(
          url: info.apkUrl,
          headers: {
            'Accept': 'application/octet-stream',
            'User-Agent': 'madkrapow-${config.appType}-updater',
            if (config.githubToken != null && config.githubToken!.isNotEmpty)
              'Authorization': 'Bearer ${config.githubToken}',
          },
          savedDir: dir.path,
          fileName: filename,
          showNotification: true,
          openFileFromNotification: false,
          saveInPublicStorage: false,
          allowCellular: true,
          requiresStorageNotLow: false,
        );

        if (taskId == null) {
          progressController.close();
          doneCompleter.complete(null);
          return;
        }

        _activeDownloadTaskId = taskId;
        _progressControllers[taskId] = progressController;
        _downloadCompleter[taskId] = Completer<String?>();

        final path = await _downloadCompleter[taskId]!.future;
        _downloadCompleter.remove(taskId);
        _progressControllers.remove(taskId);
        _activeDownloadTaskId = null;
        if (!progressController.isClosed) await progressController.close();

        if (path == null) {
          doneCompleter.complete(null);
          return;
        }

        final file = File(path);
        if (!await file.exists()) {
          _log('Downloaded file missing at $path');
          doneCompleter.complete(null);
          return;
        }
        if (info.apkSizeBytes > 0) {
          final actual = await file.length();
          if (actual != info.apkSizeBytes) {
            _log(
              'Size mismatch: expected ${info.apkSizeBytes}, got $actual',
            );
            doneCompleter.complete(null);
            return;
          }
        }
        doneCompleter.complete(path);
      } catch (e, st) {
        _log('Download failed: $e', error: st);
        if (!progressController.isClosed) await progressController.close();
        if (!doneCompleter.isCompleted) doneCompleter.complete(null);
      }
    }();

    return (progress: progressController.stream, done: doneCompleter.future);
  }

  Future<bool> install(String apkPath) async {
    try {
      if (!Platform.isAndroid) return false;
      final status = await Permission.requestInstallPackages.request();
      if (!status.isGranted) {
        _log('Install permission not granted');
        return false;
      }
      final result = await OpenFilex.open(
        apkPath,
        type: 'application/vnd.android.package-archive',
      );
      _log('open_filex result: ${result.type} — ${result.message}');
      return result.type == ResultType.done;
    } catch (e, st) {
      _log('Install failed: $e', error: st);
      return false;
    }
  }

  Future<void> cleanupDownloadedApk(String path) async {
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (_) {/* ignore */}
  }

  Future<void> cleanupOldApks() async {
    try {
      if (!Platform.isAndroid) return;
      final dir = await _downloadDir();
      if (!await dir.exists()) return;
      final pkg = await _packageInfo();
      final currentSuffix = '-v${pkg.version}.apk';
      await for (final entity in dir.list()) {
        if (entity is! File) continue;
        final name = entity.path.split(Platform.pathSeparator).last;
        if (!name.endsWith('.apk')) continue;
        if (name.endsWith(currentSuffix)) continue;
        try {
          await entity.delete();
        } catch (_) {/* ignore */}
      }
    } catch (_) {/* ignore */}
  }

  void dispose() {
    for (final ctl in _progressControllers.values) {
      if (!ctl.isClosed) ctl.close();
    }
    _progressControllers.clear();
    _http.close();
  }

  Future<Directory> _downloadDir() async {
    final base = await getExternalStorageDirectory() ??
        await getApplicationSupportDirectory();
    final dir = Directory('${base.path}${Platform.pathSeparator}updater');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  String _filenameFor(UpdateInfo info) =>
      'madkrapow-${config.appType}-v${info.version}.apk';

  bool shouldRePrompt() {
    final last = settings.lastPrompt;
    if (last == null) return true;
    return DateTime.now().difference(last) >= _kRePromptInterval;
  }

  void _log(String message, {Object? error}) {
    developer.log(
      message,
      name: 'GithubUpdater[${config.appType}]',
      error: error,
    );
  }
}
