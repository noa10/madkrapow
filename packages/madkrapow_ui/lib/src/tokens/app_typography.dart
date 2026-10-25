import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Plus Jakarta Sans type scale, tuned to the storefront's compact web scale.
class AppTypography {
  AppTypography._();

  static const String fontFamily = 'PlusJakartaSans';

  static TextTheme get textTheme {
    final base = Typography.material2021(
      platform: TargetPlatform.android,
    ).white;
    return base
        .apply(
          fontFamily: fontFamily,
          bodyColor: AppColors.foreground,
          displayColor: AppColors.foreground,
        )
        .copyWith(
          displayLarge: _style(
            36,
            FontWeight.w800,
            height: 1.12,
            letterSpacing: -0.8,
          ),
          displayMedium: _style(
            30,
            FontWeight.w800,
            height: 1.14,
            letterSpacing: -0.6,
          ),
          displaySmall: _style(
            26,
            FontWeight.w800,
            height: 1.16,
            letterSpacing: -0.4,
          ),
          headlineLarge: _style(
            26,
            FontWeight.w800,
            height: 1.18,
            letterSpacing: -0.4,
          ),
          headlineMedium: _style(
            22,
            FontWeight.w700,
            height: 1.2,
            letterSpacing: -0.2,
          ),
          headlineSmall: _style(20, FontWeight.w700, height: 1.22),
          titleLarge: _style(18, FontWeight.w700, height: 1.25),
          titleMedium: _style(16, FontWeight.w600, height: 1.3),
          titleSmall: _style(14, FontWeight.w600, height: 1.3),
          bodyLarge: _style(15, FontWeight.w400, height: 1.5),
          bodyMedium: _style(13, FontWeight.w400, height: 1.45),
          bodySmall: _style(12, FontWeight.w400, height: 1.4),
          labelLarge: _style(
            14,
            FontWeight.w700,
            height: 1.2,
            letterSpacing: 0.1,
          ),
          labelMedium: _style(
            12,
            FontWeight.w600,
            height: 1.2,
            letterSpacing: 0.2,
          ),
          labelSmall: _style(
            11,
            FontWeight.w700,
            height: 1.2,
            letterSpacing: 1.1,
          ),
        );
  }

  static TextStyle _style(
    double size,
    FontWeight weight, {
    double? height,
    double? letterSpacing,
  }) {
    return TextStyle(
      fontFamily: fontFamily,
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: letterSpacing,
      color: AppColors.foreground,
    );
  }
}
