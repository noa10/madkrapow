abstract class AppRoutes {
  static const splash = '/splash';
  static const home = '/';
  static const itemDetail = '/item/:id';
  static const cart = '/cart';
  static const checkout = '/checkout';
  static const stripeCheckout = '/checkout/stripe';
  static const orderSuccess = '/order/success';
  static const orderDetail = '/orders/:id';
  static const orders = '/orders';
  static const more = '/more';
  static const contacts = '/more/contacts';
  static const addresses = '/more/addresses';
  static const signIn = '/auth/signin';
  static const signUp = '/auth/signup';
  static const resetPassword = '/auth/reset-password';
  static const updatePassword = '/auth/update-password';
  static const authCallback = '/auth/callback';
  static const emailVerification = '/auth/verify-email';
  static const appSettings = '/more/settings';
}
