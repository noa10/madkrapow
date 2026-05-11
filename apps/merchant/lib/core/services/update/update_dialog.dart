import 'package:flutter/material.dart';

import 'update_info.dart';

Future<String?> showUpdateDialog(
  BuildContext context, {
  required UpdateInfo info,
  required String currentVersion,
}) {
  return showDialog<String>(
    context: context,
    builder: (ctx) => UpdateDialog(
      info: info,
      currentVersion: currentVersion,
    ),
  );
}

class UpdateDialog extends StatelessWidget {
  const UpdateDialog({
    super.key,
    required this.info,
    required this.currentVersion,
  });

  final UpdateInfo info;
  final String currentVersion;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final notes = info.releaseNotes.trim();

    return AlertDialog(
      title: Text('Update to v${info.version}'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'You\'re on v$currentVersion.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Download size: ${info.prettySize}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'What\'s new',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              if (notes.isEmpty)
                Text(
                  'No release notes provided.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    fontStyle: FontStyle.italic,
                  ),
                )
              else
                Text(notes, style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, 'skip'),
          child: const Text('Skip this version'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, 'later'),
          child: const Text('Later'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, 'update'),
          child: const Text('Update now'),
        ),
      ],
    );
  }
}
