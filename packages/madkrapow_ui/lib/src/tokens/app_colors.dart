import 'package:flutter/material.dart';

/// Fiery Wok palette.
///
/// The canonical values live in `apps/web/src/app/globals.css` (OKLCH). These
/// are the sRGB equivalents used by Flutter's 8-bit [Color].
class AppColors {
  AppColors._();

  // Surfaces
  static const background = Color(0xFF0D0D0F);
  static const surface = Color(0xFF18181B);
  static const surface2 = Color(0xFF232328);
  static const surface3 = Color(0xFF37373E);
  static const surfaceSunk = Color(0xFF0A0A0C);

  // Text
  static const foreground = Color(0xFFF4F4F5);
  static const muted = Color(0xFFA1A1AA);

  // Hairlines
  static const border = Color(0x17FFFFFF); // white 9%
  static const borderStrong = Color(0x29FFFFFF); // white 16%

  // Brand action
  static const accent = Color(0xFFE11D48);
  static const accentHover = Color(0xFFC81A40);
  static const accentSoft = Color(0x29E11D48);
  static const onAccent = Color(0xFFFFFFFF);

  // Support palette
  static const ember = Color(0xFFEA580C);
  static const emberText = Color(0xFFF66018);
  static const emberSoft = Color(0x24F66018);
  static const sesame = Color(0xFFFBBF24);
  static const sesameSoft = Color(0x24FBBF24);
  static const herb = Color(0xFF10B981);
  static const herbText = Color(0xFF34D399);
  static const herbSoft = Color(0x2110B981);

  // Destructive / feedback
  static const danger = Color(0xFFEF4444);
  static const dangerText = Color(0xFFF87171);
  static const dangerSoft = Color(0x26EF4444);
  static const info = Color(0xFF38BDF8);
  static const infoSoft = Color(0x2638BDF8);
  static const warning = Color(0xFFFBBF24);
  static const warningSoft = Color(0x26FBBF24);
  static const success = Color(0xFF34D399);
  static const successSoft = Color(0x2634D399);

  // CTA gradient — the web's accessible stops, not the raw token pair.
  static const ctaGradientStart = Color(0xFFD91B41);
  static const ctaGradientEnd = Color(0xFFC2410C);
}

/// A semantic status colour set for order/status chips.
@immutable
class AppStatusTone {
  const AppStatusTone({
    required this.foreground,
    required this.background,
    required this.border,
  });

  final Color foreground;
  final Color background;
  final Color border;
}

/// Central status palette shared by the customer and merchant apps.
///
/// These intentionally keep distinct semantic hues (pending amber, paid sky,
/// accepted violet, preparing ember, ready herb, picked-up indigo, delivered
/// teal, cancelled danger). Crimson remains reserved for primary actions.
class AppStatusColors {
  AppStatusColors._();

  static const _neutral = AppStatusTone(
    foreground: AppColors.muted,
    background: Color(0x26A1A1AA),
    border: Color(0x66A1A1AA),
  );

  static const Map<String, AppStatusTone> _tones = {
    'pending': AppStatusTone(
      foreground: AppColors.sesame,
      background: AppColors.sesameSoft,
      border: Color(0x66FBBF24),
    ),
    'paid': AppStatusTone(
      foreground: AppColors.info,
      background: AppColors.infoSoft,
      border: Color(0x6638BDF8),
    ),
    'accepted': AppStatusTone(
      foreground: Color(0xFFA78BFA),
      background: Color(0x26A78BFA),
      border: Color(0x66A78BFA),
    ),
    'preparing': AppStatusTone(
      foreground: Color(0xFFFB923C),
      background: Color(0x26F97316),
      border: Color(0x66F97316),
    ),
    'ready': AppStatusTone(
      foreground: AppColors.herbText,
      background: AppColors.successSoft,
      border: Color(0x6634D399),
    ),
    'picked_up': AppStatusTone(
      foreground: Color(0xFF818CF8),
      background: Color(0x26818CF8),
      border: Color(0x66818CF8),
    ),
    'delivering': AppStatusTone(
      foreground: Color(0xFF818CF8),
      background: Color(0x26818CF8),
      border: Color(0x66818CF8),
    ),
    'delivered': AppStatusTone(
      foreground: Color(0xFF2DD4BF),
      background: Color(0x262DD4BF),
      border: Color(0x662DD4BF),
    ),
    'completed': AppStatusTone(
      foreground: Color(0xFF2DD4BF),
      background: Color(0x262DD4BF),
      border: Color(0x662DD4BF),
    ),
    'cancelled': AppStatusTone(
      foreground: AppColors.dangerText,
      background: AppColors.dangerSoft,
      border: Color(0x66EF4444),
    ),
    'canceled': AppStatusTone(
      foreground: AppColors.dangerText,
      background: AppColors.dangerSoft,
      border: Color(0x66EF4444),
    ),
    'active': AppStatusTone(
      foreground: AppColors.herbText,
      background: AppColors.successSoft,
      border: Color(0x6634D399),
    ),
    'inactive': _neutral,
    'scheduled': AppStatusTone(
      foreground: AppColors.info,
      background: AppColors.infoSoft,
      border: Color(0x6638BDF8),
    ),
    'depleted': AppStatusTone(
      foreground: AppColors.sesame,
      background: AppColors.sesameSoft,
      border: Color(0x66FBBF24),
    ),
    'expired': AppStatusTone(
      foreground: AppColors.dangerText,
      background: AppColors.dangerSoft,
      border: Color(0x66EF4444),
    ),
  };

  static const Map<String, String> _labels = {
    'pending': 'Pending',
    'paid': 'Paid',
    'accepted': 'Accepted',
    'preparing': 'Preparing',
    'ready': 'Ready',
    'picked_up': 'Picked up',
    'delivering': 'Delivering',
    'delivered': 'Delivered',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'canceled': 'Canceled',
    'active': 'Active',
    'inactive': 'Inactive',
    'scheduled': 'Scheduled',
    'depleted': 'Depleted',
    'expired': 'Expired',
  };

  static AppStatusTone of(String status) {
    return _tones[status.trim().toLowerCase()] ?? _neutral;
  }

  static String labelOf(String status, {String? fallback}) {
    return _labels[status.trim().toLowerCase()] ?? fallback ?? status;
  }
}
