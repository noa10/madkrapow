class AppConstants {
  AppConstants._();

  /// Store coordinates (Shah Alam, Malaysia)
  static const double storeLatitude = 3.1390;
  static const double storeLongitude = 101.6869;
  static const String storeAddress =
      '123 Thai Food Street, Shah Alam, Malaysia';
  static const String storeCity = 'Shah Alam';

  /// Deep link scheme for OAuth callbacks and Stripe redirects
  static const String deepLinkScheme = 'madkrapow';
  static const String authCallbackHost = 'auth-callback';
  static const String orderSuccessHost = 'order/success';

  /// Currency
  static const String currencySymbol = 'RM';
}
