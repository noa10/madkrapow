import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

import 'github_updater.dart';
import 'update_info.dart';
import 'update_settings_service.dart';

enum UpdateAction { none, promptManual, autoDownloading }

class UpdateState {
  const UpdateState({
    this.info,
    this.action = UpdateAction.none,
    this.downloading = false,
    this.downloadProgress = 0,
    this.downloadedPath,
    this.lastCheckError,
    this.lastCheckAt,
  });

  final UpdateInfo? info;
  final UpdateAction action;
  final bool downloading;
  final int downloadProgress;
  final String? downloadedPath;
  final String? lastCheckError;
  final DateTime? lastCheckAt;

  UpdateState copyWith({
    UpdateInfo? info,
    bool clearInfo = false,
    UpdateAction? action,
    bool? downloading,
    int? downloadProgress,
    String? downloadedPath,
    bool clearDownloadedPath = false,
    String? lastCheckError,
    bool clearError = false,
    DateTime? lastCheckAt,
  }) {
    return UpdateState(
      info: clearInfo ? null : (info ?? this.info),
      action: action ?? this.action,
      downloading: downloading ?? this.downloading,
      downloadProgress: downloadProgress ?? this.downloadProgress,
      downloadedPath: clearDownloadedPath
          ? null
          : (downloadedPath ?? this.downloadedPath),
      lastCheckError:
          clearError ? null : (lastCheckError ?? this.lastCheckError),
      lastCheckAt: lastCheckAt ?? this.lastCheckAt,
    );
  }
}

class UpdateController extends ChangeNotifier {
  UpdateController({required this.updater, required this.settings});

  final GithubUpdater updater;
  final UpdateSettingsService settings;

  UpdateState _state = const UpdateState();
  UpdateState get state => _state;

  bool _checkInFlight = false;

  void _emit(UpdateState next) {
    _state = next;
    notifyListeners();
  }

  Future<void> runCheck({bool force = false}) async {
    if (_checkInFlight) return;
    _checkInFlight = true;
    try {
      final result = await updater.check(force: force);
      _emit(_state.copyWith(
        clearError: true,
        lastCheckAt: DateTime.now(),
      ));
      switch (result.status) {
        case UpdateCheckStatus.updateAvailable:
          _emit(_state.copyWith(info: result.info));
          if (await updater.shouldAutoDownload() && updater.shouldRePrompt()) {
            await _startAutoDownload(result.info!);
          } else if (updater.shouldRePrompt()) {
            _emit(_state.copyWith(action: UpdateAction.promptManual));
          }
          break;
        case UpdateCheckStatus.upToDate:
          _emit(_state.copyWith(
            clearInfo: true,
            action: UpdateAction.none,
          ));
          break;
        case UpdateCheckStatus.skipped:
          _emit(_state.copyWith(
            info: result.info,
            action: UpdateAction.none,
          ));
          break;
        case UpdateCheckStatus.error:
          _emit(_state.copyWith(
            lastCheckError: result.error ?? 'Update check failed',
          ));
          break;
      }
    } catch (e, st) {
      developer.log('runCheck failed: $e', name: 'UpdateController', error: st);
      _emit(_state.copyWith(lastCheckError: e.toString()));
    } finally {
      _checkInFlight = false;
    }
  }

  void seedInfo(UpdateInfo info) {
    _emit(_state.copyWith(info: info));
  }

  Future<void> acceptUpdate() async {
    final info = _state.info;
    if (info == null) return;
    await settings.markPromptShown();
    await _startAutoDownload(info);
  }

  Future<void> deferUpdate() async {
    await updater.cancelActiveDownload();
    await settings.markPromptShown();
    _emit(_state.copyWith(
      action: UpdateAction.none,
      downloading: false,
      downloadProgress: 0,
    ));
  }

  Future<void> skipCurrentVersion() async {
    final info = _state.info;
    if (info == null) return;
    await updater.cancelActiveDownload();
    await settings.skipVersion(info.version.toString());
    await settings.markPromptShown();
    _emit(_state.copyWith(
      action: UpdateAction.none,
      downloading: false,
      downloadProgress: 0,
    ));
  }

  Future<void> cancelDownload() async {
    await updater.cancelActiveDownload();
    await settings.markPromptShown();
    _emit(_state.copyWith(
      action: UpdateAction.none,
      downloading: false,
      downloadProgress: 0,
      clearDownloadedPath: true,
    ));
  }

  void dismissPrompt() {
    _emit(_state.copyWith(action: UpdateAction.none));
  }

  Future<void> _startAutoDownload(UpdateInfo info) async {
    await settings.markPromptShown();
    _emit(_state.copyWith(
      action: UpdateAction.autoDownloading,
      downloading: true,
      downloadProgress: 0,
      clearDownloadedPath: true,
    ));
    final handle = updater.download(info);
    final progSub = handle.progress.listen((p) {
      _emit(_state.copyWith(downloadProgress: p));
    });
    final path = await handle.done;
    await progSub.cancel();
    if (path == null) {
      _emit(_state.copyWith(
        downloading: false,
        action: UpdateAction.none,
      ));
      return;
    }
    await settings.queueWhatsNew(
      version: info.version.toString(),
      body: info.releaseNotes,
    );
    _emit(_state.copyWith(downloading: false, downloadedPath: path));
    final ok = await updater.install(path);
    if (!ok) {
      _emit(_state.copyWith(
        lastCheckError: 'Could not launch installer',
        action: UpdateAction.none,
      ));
    }
  }

  @override
  void dispose() {
    updater.dispose();
    super.dispose();
  }
}
