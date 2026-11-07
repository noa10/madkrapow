import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../data/notification_preferences.dart';
import '../../providers/notification_providers.dart';

/// Per-device order-alert settings, reachable from the More tab by every staff
/// role.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen>
    with WidgetsBindingObserver {
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(notificationPermissionProvider);
    }
  }

  Future<void> _save(NotificationPreferences next) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final saved = await ref
          .read(notificationPreferencesControllerProvider.notifier)
          .update(next);
      if (!mounted) return;
      if (!saved) {
        _showMessage(
          'Could not save. This device may not be registered for alerts yet.',
        );
      }
    } catch (_) {
      if (mounted) _showMessage('Could not save notification settings.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _sendTest(NotificationPreferences preferences) async {
    final local = ref.read(localOrderNotificationsProvider);
    if (local == null) {
      _showMessage('Order notifications are unavailable in this build.');
      return;
    }
    final permission = await ref.read(notificationPermissionProvider.future);
    if (permission == NotificationPermissionState.denied) {
      _showMessage('Notifications are blocked in system settings.');
      return;
    }
    try {
      await local.showTest(preferences);
      if (mounted) _showMessage('Test alert sent.');
    } catch (_) {
      if (mounted) _showMessage('Could not show the test alert.');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final preferences = ref.watch(notificationPreferencesControllerProvider);
    final permission = ref.watch(notificationPermissionProvider);
    final local = ref.watch(localOrderNotificationsProvider);
    final ready = local != null;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (!ready) ...[
            const _WarningCard(
              icon: Icons.notifications_off_outlined,
              title: 'Order notifications are unavailable',
              body:
                  'Firebase or the local notification plugin did not start. '
                  'Check the app configuration.',
            ),
            const SizedBox(height: 16),
          ],
          permission.maybeWhen(
            data: (state) => switch (state) {
              NotificationPermissionState.denied => const _PermissionCard(
                title: 'Notifications are blocked',
                body:
                    'Allow notifications for Mad Krapow Merchant in system '
                    'settings to receive order alerts.',
                actionLabel: 'Open system settings',
                onPressed: openAppSettings,
              ),
              NotificationPermissionState.notDetermined => _PermissionCard(
                title: 'Allow notifications',
                body:
                    'Android has not been asked for notification permission '
                    'yet.',
                actionLabel: 'Allow notifications',
                onPressed: () async {
                  await FirebaseMessaging.instance.requestPermission();
                  ref.invalidate(notificationPermissionProvider);
                },
              ),
              _ => const SizedBox.shrink(),
            },
            orElse: () => const SizedBox.shrink(),
          ),
          if (permission.valueOrNull == NotificationPermissionState.denied ||
              permission.valueOrNull ==
                  NotificationPermissionState.notDetermined)
            const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Order alerts',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'These settings apply to this device.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('New order alerts'),
                    subtitle: const Text(
                      'Alert this device when a new order arrives.',
                    ),
                    value: preferences.orderAlerts,
                    onChanged: ready && !_saving
                        ? (value) =>
                              _save(preferences.copyWith(orderAlerts: value))
                        : null,
                  ),
                  const Divider(height: 1),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Repeat until viewed'),
                    subtitle: const Text(
                      'Alert again every 10 seconds for up to 15 minutes '
                      'until the newest unviewed order is opened on this '
                      'device.',
                    ),
                    value: preferences.repeatUntilViewed,
                    onChanged: ready && preferences.orderAlerts && !_saving
                        ? (value) => _save(
                            preferences.copyWith(repeatUntilViewed: value),
                          )
                        : null,
                  ),
                  const Divider(height: 1),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Sound'),
                    subtitle: const Text('Play the alert sound.'),
                    value: preferences.sound,
                    onChanged: ready && preferences.orderAlerts && !_saving
                        ? (value) => _save(preferences.copyWith(sound: value))
                        : null,
                  ),
                  if (!Platform.isIOS && preferences.sound)
                    RadioGroup<AlertSound>(
                      groupValue: preferences.alertSound,
                      onChanged: ready && preferences.orderAlerts && !_saving
                          ? (value) {
                              if (value == null) return;
                              _save(preferences.copyWith(alertSound: value));
                            }
                          : (_) {},
                      child: Column(
                        children: [
                          for (final choice in AlertSound.values)
                            RadioListTile<AlertSound>(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              title: Text(choice.label),
                              subtitle: Text(choice.description),
                              value: choice,
                            ),
                        ],
                      ),
                    ),
                  if (!Platform.isIOS)
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Vibration'),
                      subtitle: const Text('Vibrate when an order arrives.'),
                      value: preferences.vibration,
                      onChanged: ready && preferences.orderAlerts && !_saving
                          ? (value) =>
                                _save(preferences.copyWith(vibration: value))
                          : null,
                    ),
                  if (_saving)
                    const Padding(
                      padding: EdgeInsets.only(top: 8, bottom: 8),
                      child: LinearProgressIndicator(minHeight: 2),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Test this device',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Shows a local alert using the sound and vibration '
                    'settings above.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: ready && preferences.orderAlerts && !_saving
                        ? () => _sendTest(preferences)
                        : null,
                    icon: const Icon(Icons.notifications_active_outlined),
                    label: const Text('Send test alert'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            Platform.isIOS
                ? 'These settings apply to this device only. iOS system '
                      'settings can override sound. Repeats stop when you open '
                      'the order on this device or after 15 minutes.'
                : 'These settings apply to this device only. Android system '
                      'settings can override sound and vibration. Repeats stop '
                      'when you open the order on this device or after 15 '
                      'minutes.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _WarningCard extends StatelessWidget {
  const _WarningCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: theme.colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: theme.colorScheme.onErrorContainer),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onErrorContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    body,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onErrorContainer,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PermissionCard extends StatelessWidget {
  const _PermissionCard({
    required this.title,
    required this.body,
    required this.actionLabel,
    required this.onPressed,
  });

  final String title;
  final String body;
  final String actionLabel;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: theme.colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: theme.colorScheme.onSecondaryContainer,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              body,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSecondaryContainer,
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onPressed, child: Text(actionLabel)),
          ],
        ),
      ),
    );
  }
}
