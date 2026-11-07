import 'dart:async';

import 'package:flutter/foundation.dart';

/// Registration was rejected by policy or validation; a timed retry cannot
/// fix it. The next sign-in or app resume tries again.
class PermanentRegistrationException implements Exception {
  const PermanentRegistrationException(this.code);

  final String code;
}

/// Owns exactly one refresh subscription for the current staff session.
/// Registrations are serialized so an old account cannot overwrite a newer one.
class TokenRegistrationManager {
  TokenRegistrationManager({
    required Stream<String> tokenRefreshes,
    required String? Function() currentUserId,
    required Future<String?> Function() getToken,
    required Future<void> Function(String userId, String token) register,
    this.retryDelay = const Duration(seconds: 30),
  }) : _tokenRefreshes = tokenRefreshes,
       _currentUserId = currentUserId,
       _getToken = getToken,
       _register = register;

  final Stream<String> _tokenRefreshes;
  final String? Function() _currentUserId;
  final Future<String?> Function() _getToken;
  final Future<void> Function(String userId, String token) _register;
  final Duration retryDelay;

  StreamSubscription<String>? _subscription;
  Timer? _retryTimer;
  Future<void> _work = Future.value();
  String? _userId;
  int _generation = 0;
  bool _disposed = false;

  bool _isCurrent(String userId, int generation) =>
      !_disposed &&
      _generation == generation &&
      _userId == userId &&
      _currentUserId() == userId;

  void updateUser(String? userId) {
    if (_disposed || userId == _userId) return;
    _generation++;
    final generation = _generation;
    _userId = userId;
    _retryTimer?.cancel();
    _retryTimer = null;
    unawaited(_subscription?.cancel());
    _subscription = null;
    if (userId == null) return;

    _subscription = _tokenRefreshes.listen(
      (token) => _enqueue(userId, generation, token),
      onError: (Object _) {
        debugPrint('FCM token refresh failed; registration will be retried.');
        _scheduleRetry(userId, generation);
      },
    );
    _enqueue(userId, generation);
  }

  /// Used on resume as well as by the timer after a failed attempt.
  void retry() {
    final userId = _userId;
    if (userId != null) _enqueue(userId, _generation);
  }

  void _enqueue(String userId, int generation, [String? refreshedToken]) {
    _work = _work.then((_) async {
      if (!_isCurrent(userId, generation)) return;
      try {
        final token = refreshedToken ?? await _getToken();
        if (!_isCurrent(userId, generation)) return;
        if (token == null || token.isEmpty) {
          throw StateError('FCM did not provide a token');
        }
        await _register(userId, token);
        if (_isCurrent(userId, generation)) {
          _retryTimer?.cancel();
          _retryTimer = null;
        }
      } on PermanentRegistrationException catch (error) {
        if (_isCurrent(userId, generation)) {
          debugPrint(
            'FCM registration was rejected (${error.code}); it will retry on '
            'the next sign-in or resume.',
          );
        }
      } catch (_) {
        if (_isCurrent(userId, generation)) {
          debugPrint('FCM token registration failed; will retry.');
          _scheduleRetry(userId, generation);
        }
      }
    });
  }

  void _scheduleRetry(String userId, int generation) {
    if (!_isCurrent(userId, generation) || _retryTimer != null) return;
    _retryTimer = Timer(retryDelay, () {
      _retryTimer = null;
      if (_isCurrent(userId, generation)) _enqueue(userId, generation);
    });
  }

  /// Stop the listener first and wait for any in-flight registration before
  /// deleting the token while the old authenticated session is still valid.
  Future<void> stop() async {
    updateUser(null);
    await _work;
  }

  Future<void> dispose() async {
    if (_disposed) return;
    await stop();
    _disposed = true;
  }
}
