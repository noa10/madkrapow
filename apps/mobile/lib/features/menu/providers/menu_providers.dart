import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/operating_hours.dart';
import '../data/menu_repository.dart';

/// Whether the store is currently open.
/// Returns null while loading.
final storeOpenProvider = Provider<bool?>((ref) {
  final settingsAsync = ref.watch(storeSettingsProvider);
  return settingsAsync.when(
    data: (settings) {
      try {
        final hours = parseOperatingHours(
          Map<String, dynamic>.from(settings.operatingHours),
        );
        return isStoreOpen(hours);
      } catch (_) {
        return true;
      }
    },
    loading: () => null,
    error: (error, stack) => null,
  );
});
