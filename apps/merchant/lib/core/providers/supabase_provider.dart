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
///
/// Listens to Riverpod's [authStateProvider] instead of the raw Supabase stream
/// so that GoRouter's redirect callback always reads up-to-date provider state.
class AuthStateListenable extends ChangeNotifier {
  AuthStateListenable();
}

/// Provides the AuthStateListenable for GoRouter refreshListenable.
final authStateListenableProvider = Provider<AuthStateListenable>((ref) {
  final listenable = AuthStateListenable();
  ref.listen<AsyncValue<AuthState>>(authStateProvider, (_, __) {
    listenable.notifyListeners();
  });
  return listenable;
});
