import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Provides the Supabase client instance via Riverpod.
final supabaseProvider = Provider<SupabaseClient>((ref) {
  return Supabase.instance.client;
});

/// Stream of auth state changes.
final authStateProvider = StreamProvider<AuthState>((ref) {
  return Supabase.instance.client.auth.onAuthStateChange;
});

/// Current authenticated user, or null.
final currentUserProvider = Provider<User?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.value?.session?.user;
});

/// Whether the user is currently authenticated.
final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(currentUserProvider) != null;
});

/// A Listenable that notifies when auth state changes.
/// Used by GoRouter.refreshListenable to re-evaluate redirects.
class AuthStateListenable extends ChangeNotifier {
  AuthStateListenable(Stream<AuthState> authStateStream) {
    _subscription = authStateStream.listen((_) {
      notifyListeners();
    });
  }

  late final StreamSubscription<AuthState> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

/// Provides the AuthStateListenable for GoRouter refreshListenable.
final authStateListenableProvider = Provider<AuthStateListenable>((ref) {
  final stream = Supabase.instance.client.auth.onAuthStateChange;
  return AuthStateListenable(stream);
});
