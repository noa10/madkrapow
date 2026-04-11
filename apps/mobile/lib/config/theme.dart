import 'package:flutter/material.dart';

class AppTheme {
  AppTheme._();

  // Brand colors — matching the web app's dark + fire theme
  static const _seedColor = Color(0xFFFF4500); // orange-red fire
  static const _darkBackground = Color(0xFF0A0A0A);
  static const _darkCard = Color(0xFF1A1A1A);
  static const _warmWhite = Color(0xFFD8D1C6);
  static const _goldStart = Color(0xFFF1D7AA);
  static const _goldEnd = Color(0xFFC59661);

  static ThemeData get lightTheme => _buildTheme(Brightness.light);
  static ThemeData get darkTheme => _buildTheme(Brightness.dark);

  static ThemeData _buildTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final colorScheme = ColorScheme.fromSeed(
      seedColor: _seedColor,
      brightness: brightness,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: isDark
          ? colorScheme.copyWith(
              surface: _darkBackground,
              onSurface: _warmWhite,
              surfaceContainerHighest: _darkCard,
            )
          : colorScheme,
      scaffoldBackgroundColor: isDark ? _darkBackground : null,
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? _darkBackground : null,
        foregroundColor: isDark ? _warmWhite : null,
        elevation: 0,
        scrolledUnderElevation: 1,
      ),
      cardTheme: CardThemeData(
        color: isDark ? _darkCard : null,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _seedColor,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: isDark ? _warmWhite : null,
          side: BorderSide(
            color: isDark ? _warmWhite.withValues(alpha: 0.3) : Colors.grey,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? _darkCard : Colors.grey.shade100,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _seedColor, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: isDark ? _darkCard : null,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
    );
  }

  /// Gold gradient for premium elements (buttons, headers)
  static LinearGradient get goldGradient => const LinearGradient(
        colors: [_goldStart, _goldEnd],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
}
