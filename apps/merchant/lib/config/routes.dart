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
  static const kitchen = '/kitchen';

  // Menu sub-routes
  static const menuItemNew = '/menu/items/new';
  static const menuItemDetail = '/menu/items/:id';
  static const categoryNew = '/menu/categories/new';
  static const categoryDetail = '/menu/categories/:id';
  static const modifiers = '/menu/modifiers';

  // Staff sub-routes (nested under /more in GoRouter)
  static const staffList = '/more/staff';
  static const staffNew = '/more/staff/new';
  static const staffEdit = '/more/staff/:id/edit';

  // Promo sub-routes
  static const promoList = '/more/promos';
  static const promoNew = '/more/promos/new';
  static const promoEdit = '/more/promos/:id/edit';

  // Sales Reports
  static const salesReports = '/more/reports';

  // Settings
  static const settings = '/settings';
}
