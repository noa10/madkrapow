import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app.dart';
import 'update_providers.dart';

class WhatsNewScreen extends ConsumerWidget {
  const WhatsNewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(updateSettingsProvider);
    final body = settings.whatsNewBody ?? '';
    final version = settings.whatsNewVersion ?? '';
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text('What\'s new in v$version'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () async {
            await settings.clearWhatsNew();
            if (context.mounted) Navigator.of(context).pop();
          },
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 6,
              ),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                'v$version installed',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.primary,
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (body.trim().isEmpty)
              Text(
                'Thanks for updating! No release notes were provided for this version.',
                style: theme.textTheme.bodyLarge,
              )
            else
              Text(body, style: theme.textTheme.bodyLarge),
            const SizedBox(height: 32),
            Center(
              child: FilledButton(
                onPressed: () async {
                  await settings.clearWhatsNew();
                  if (context.mounted) Navigator.of(context).pop();
                },
                child: const Text('Got it'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> maybeShowWhatsNew(WidgetRef ref) async {
  final settings = ref.read(updateSettingsProvider);
  if (!settings.whatsNewPending) return;
  final navigator = rootNavigatorKey.currentState;
  if (navigator == null) return;
  await navigator.push(
    MaterialPageRoute(
      builder: (_) => const WhatsNewScreen(),
      fullscreenDialog: true,
    ),
  );
}
