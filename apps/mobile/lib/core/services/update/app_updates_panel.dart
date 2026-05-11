import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'github_updater.dart';
import 'update_controller.dart';
import 'update_dialog.dart';
import 'update_providers.dart';

/// Self-contained Settings panel for app updates.
class AppUpdatesPanel extends ConsumerStatefulWidget {
  const AppUpdatesPanel({super.key, this.asCard = true});

  final bool asCard;

  @override
  ConsumerState<AppUpdatesPanel> createState() => _AppUpdatesPanelState();
}

class _AppUpdatesPanelState extends ConsumerState<AppUpdatesPanel> {
  bool _manualChecking = false;
  String? _manualStatus;

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(updateSettingsProvider);
    final pkg = ref.watch(packageInfoProvider);
    final controller = ref.watch(updateControllerProvider);
    final state = controller.state;

    final wifi = settings.autoUpdateOnWifi;
    final mobile = settings.autoUpdateOnMobile;

    final body = Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'App Updates',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            'Download new versions directly from GitHub — no Play Store required.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.6),
                ),
          ),
          const SizedBox(height: 16),
          _versionRow(context, pkg, settings.lastCheck),
          const Divider(height: 32),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Auto-update on Wi-Fi'),
            subtitle: const Text('Download and prompt when on Wi-Fi'),
            value: wifi,
            onChanged: (v) async {
              await ref.read(updateSettingsProvider).setAutoUpdateOnWifi(v);
              if (mounted) setState(() {});
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Auto-update on mobile data'),
            subtitle: const Text('Uses your cellular data allowance'),
            value: mobile,
            onChanged: (v) async {
              await ref.read(updateSettingsProvider).setAutoUpdateOnMobile(v);
              if (mounted) setState(() {});
            },
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _manualChecking ? null : _checkNow,
              icon: _manualChecking
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.refresh),
              label: Text(
                _manualChecking ? 'Checking…' : 'Check for updates now',
              ),
            ),
          ),
          if (_manualStatus != null) ...[
            const SizedBox(height: 12),
            Text(
              _manualStatus!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.7),
                  ),
            ),
          ],
          if (state.lastCheckError != null) ...[
            const SizedBox(height: 8),
            Text(
              state.lastCheckError!,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 13,
              ),
            ),
          ],
          if (settings.skippedVersion != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Skipped version: v${settings.skippedVersion}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    await ref
                        .read(updateSettingsProvider)
                        .clearSkippedVersion();
                    if (mounted) setState(() {});
                  },
                  child: const Text('Clear'),
                ),
              ],
            ),
          ],
          if (state.downloading) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    value: state.downloadProgress <= 0
                        ? null
                        : state.downloadProgress / 100,
                  ),
                ),
                const SizedBox(width: 10),
                Text('Downloading v${state.info?.version ?? ''} — '
                    '${state.downloadProgress}%'),
              ],
            ),
          ],
        ],
      ),
    );

    return widget.asCard ? Card(child: body) : body;
  }

  Widget _versionRow(
    BuildContext context,
    PackageInfo pkg,
    DateTime? lastCheck,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.info_outline, size: 18),
            const SizedBox(width: 8),
            Text('Current version',
                style: Theme.of(context).textTheme.bodyMedium),
            const Spacer(),
            Text(
              'v${pkg.version} (${pkg.buildNumber})',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            const Icon(Icons.schedule, size: 18),
            const SizedBox(width: 8),
            Text('Last checked',
                style: Theme.of(context).textTheme.bodyMedium),
            const Spacer(),
            Text(
              lastCheck == null ? 'Never' : _relativeTime(lastCheck),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _checkNow() async {
    setState(() {
      _manualChecking = true;
      _manualStatus = null;
    });

    final updater = ref.read(githubUpdaterProvider);
    final pkg = ref.read(packageInfoProvider);

    try {
      final result = await updater.check(force: true);
      if (!mounted) return;
      switch (result.status) {
        case UpdateCheckStatus.upToDate:
          setState(() => _manualStatus = 'You\'re on the latest version.');
          break;
        case UpdateCheckStatus.skipped:
          setState(() => _manualStatus =
              'v${result.info?.version} is available but you chose to skip it.');
          break;
        case UpdateCheckStatus.error:
          setState(() => _manualStatus =
              result.error ?? 'Could not reach GitHub. Try again later.');
          break;
        case UpdateCheckStatus.updateAvailable:
          setState(() => _manualStatus = 'v${result.info!.version} available.');
          final choice = await showUpdateDialog(
            context,
            info: result.info!,
            currentVersion: pkg.version,
          );
          if (!mounted) return;
          final controller = ref.read(updateControllerProvider);
          // Refresh controller state so it knows about the candidate info.
          await controller.runCheck();
          if (choice == 'update') {
            await controller.acceptUpdate();
          } else if (choice == 'later') {
            await controller.deferUpdate();
          } else if (choice == 'skip') {
            await controller.skipCurrentVersion();
          } else {
            controller.dismissPrompt();
          }
          break;
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _manualStatus = 'Check failed: $e');
    } finally {
      if (mounted) setState(() => _manualChecking = false);
    }
  }

  String _relativeTime(DateTime when) {
    final diff = DateTime.now().difference(when);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${when.year}-${when.month.toString().padLeft(2, '0')}-${when.day.toString().padLeft(2, '0')}';
  }
}

/// Wraps a subtree with a listener that pops the manual-update dialog when
/// a background check flags an update for prompting.
class UpdatePromptMount extends ConsumerStatefulWidget {
  const UpdatePromptMount({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<UpdatePromptMount> createState() => _UpdatePromptMountState();
}

class _UpdatePromptMountState extends ConsumerState<UpdatePromptMount> {
  bool _dialogOpen = false;

  @override
  Widget build(BuildContext context) {
    ref.listen(updateControllerProvider, (prev, next) {
      final state = next.state;
      if (state.action == UpdateAction.promptManual &&
          state.info != null &&
          !_dialogOpen) {
        _dialogOpen = true;
        unawaited(_showPrompt());
      }
    });
    return widget.child;
  }

  Future<void> _showPrompt() async {
    final controller = ref.read(updateControllerProvider);
    final pkg = ref.read(packageInfoProvider);
    final info = controller.state.info;
    if (info == null) {
      _dialogOpen = false;
      return;
    }
    final choice = await showUpdateDialog(
      context,
      info: info,
      currentVersion: pkg.version,
    );
    if (!mounted) {
      _dialogOpen = false;
      return;
    }
    if (choice == 'update') {
      await controller.acceptUpdate();
    } else if (choice == 'later') {
      await controller.deferUpdate();
    } else if (choice == 'skip') {
      await controller.skipCurrentVersion();
    } else {
      controller.dismissPrompt();
    }
    _dialogOpen = false;
  }
}
