/// Exception thrown when an API call returns 401 Unauthorized.
/// Used to trigger a redirect to the sign-in screen with a clear message.
class AuthRequiredException implements Exception {
  const AuthRequiredException(this.message);

  final String message;

  @override
  String toString() => message;
}
