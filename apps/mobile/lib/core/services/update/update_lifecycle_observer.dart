import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'update_providers.dart';

/// Drives the updater on the widget lifecycle: runs one check shortly after
/// first frame and again every time the app returns from background.
class UpdateLifecycleObserver extends ConsumerStatefulWidget {
  const UpdateLifecycleObserver({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<UpdateLifecycleObserver> createState() =>
      _UpdateLifecycleObserverState();
}

class _UpdateLifecycleObserverState
    extends ConsumerState<UpdateLifecycleObserver> with WidgetsBindingObserver {
  bool _initialCheckScheduled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _initialCheckScheduled = true;
      Timer(const Duration(seconds: 3), () {
        if (!mounted) return;
        final updater = ref.read(githubUpdaterProvider);
        unawaited(updater.initDownloader());
        unawaited(updater.cleanupOldApks());
        unawaited(ref.read(updateControllerProvider).runCheck());
      });
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _initialCheckScheduled && mounted) {
      unawaited(ref.read(updateControllerProvider).runCheck());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
