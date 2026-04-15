import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fcm_repository.dart';
import '../../../core/providers/supabase_provider.dart';

/// Provides the FcmRepository instance.
final fcmRepositoryProvider = Provider<FcmRepository>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return FcmRepository(supabase);
});
