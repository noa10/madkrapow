/// Staff roles for the merchant app.
enum StaffRole {
  admin,
  manager,
  cashier,
  kitchen,
}

/// Extension methods for permission checks and display names.
extension StaffRoleExtension on StaffRole {
  /// Human-readable display name for the role.
  String get displayName {
    return switch (this) {
      StaffRole.admin => 'Admin',
      StaffRole.manager => 'Manager',
      StaffRole.cashier => 'Cashier',
      StaffRole.kitchen => 'Kitchen Staff',
    };
  }

  /// Whether this role can manage staff (create, edit, deactivate employees).
  bool get canManageStaff =>
      this == StaffRole.admin || this == StaffRole.manager;

  /// Whether this role can access the menu management tab.
  bool get canAccessMenu =>
      this == StaffRole.admin || this == StaffRole.manager;

  /// Whether this role can access the analytics tab.
  bool get canAccessAnalytics => this == StaffRole.admin;

  /// Whether this role can access the orders tab.
  bool get canAccessOrders => true;

  /// Whether this role can update order status.
  bool get canUpdateOrderStatus => true;

  /// Whether this role can cancel orders.
  bool get canCancelOrders =>
      this == StaffRole.admin || this == StaffRole.manager || this == StaffRole.cashier;

  /// Whether this role can mark payment on orders.
  bool get canMarkPayment =>
      this == StaffRole.admin || this == StaffRole.manager || this == StaffRole.cashier;

  /// Whether this role can access the staff management screen.
  bool get canAccessStaff =>
      this == StaffRole.admin || this == StaffRole.manager;

  /// Available bottom navigation tab indices for this role.
  List<int> get availableTabIndices {
    return switch (this) {
      StaffRole.admin => [0, 1, 2, 3], // Orders, Menu, Analytics, More
      StaffRole.manager => [0, 1, 2, 3], // Orders, Menu, Staff, More
      StaffRole.cashier => [0, 1], // Orders, More
      StaffRole.kitchen => [0, 1], // Orders, More
    };
  }

  /// Available bottom navigation tab labels for this role.
  List<String> get availableTabLabels {
    return switch (this) {
      StaffRole.admin => ['Orders', 'Menu', 'Analytics', 'More'],
      StaffRole.manager => ['Orders', 'Menu', 'Staff', 'More'],
      StaffRole.cashier => ['Orders', 'More'],
      StaffRole.kitchen => ['Orders', 'More'],
    };
  }

  /// Parse a role string into a [StaffRole].
  static StaffRole? fromString(String? value) {
    if (value == null) return null;
    return StaffRole.values.cast<StaffRole?>().firstWhere(
          (role) => role!.name == value,
          orElse: () => null,
        );
  }
}
