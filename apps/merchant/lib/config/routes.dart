/// Route path constants for the merchant app.
class AppRoutes {
  AppRoutes._();

  static const signin = '/signin';

  // Tab root routes
  static const orders = '/orders';
  static const menu = '/menu';
  static const analytics = '/analytics';
  static const more = '/more';

  // Order sub-routes
  static const orderDetail = '/orders/:id';

  // Menu sub-routes
  static const menuItemNew = '/menu/items/new';
  static const menuItemDetail = '/menu/items/:id';
  static const categoryNew = '/menu/categories/new';
  static const categoryDetail = '/menu/categories/:id';
  static const modifiers = '/menu/modifiers';
}
