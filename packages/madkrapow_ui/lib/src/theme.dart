import 'package:flutter/material.dart';

import 'tokens/app_colors.dart';
import 'tokens/app_radii.dart';
import 'tokens/app_theme_extension.dart';
import 'tokens/app_typography.dart';

/// The single dark theme used by both Mad Krapow Flutter apps.
class AppTheme {
  AppTheme._();

  static ThemeData get darkTheme => _build();

  /// Kept as a compatibility alias for callers that still ask for a light
  /// theme. The product is dark-only, matching the web storefront.
  static ThemeData get lightTheme => darkTheme;

  static ThemeData _build() {
    const scheme = ColorScheme.dark(
      primary: AppColors.accent,
      onPrimary: AppColors.onAccent,
      primaryContainer: AppColors.accentSoft,
      onPrimaryContainer: AppColors.foreground,
      secondary: AppColors.ember,
      onSecondary: AppColors.onAccent,
      secondaryContainer: AppColors.emberSoft,
      onSecondaryContainer: AppColors.foreground,
      tertiary: AppColors.herb,
      onTertiary: AppColors.background,
      tertiaryContainer: AppColors.herbSoft,
      onTertiaryContainer: AppColors.herbText,
      error: AppColors.danger,
      onError: AppColors.onAccent,
      errorContainer: AppColors.dangerSoft,
      onErrorContainer: AppColors.dangerText,
      surface: AppColors.surface,
      onSurface: AppColors.foreground,
      onSurfaceVariant: AppColors.muted,
      surfaceContainerLowest: AppColors.surfaceSunk,
      surfaceContainerLow: AppColors.surface,
      surfaceContainer: AppColors.surface2,
      surfaceContainerHigh: AppColors.surface3,
      surfaceContainerHighest: AppColors.surface3,
      outline: AppColors.borderStrong,
      outlineVariant: AppColors.border,
      shadow: Color(0xFF000000),
      scrim: Color(0xCC000000),
      inverseSurface: AppColors.foreground,
      onInverseSurface: AppColors.background,
      inversePrimary: AppColors.accentHover,
      surfaceTint: Colors.transparent,
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.background,
      cardColor: AppColors.surface,
      dividerColor: AppColors.border,
      fontFamily: AppTypography.fontFamily,
      textTheme: AppTypography.textTheme,
      visualDensity: VisualDensity.standard,
      splashFactory: InkRipple.splashFactory,
      extensions: const <ThemeExtension<dynamic>>[BrandColors.fallback],
    );

    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.foreground,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: AppTypography.textTheme.titleLarge,
        iconTheme: const IconThemeData(color: AppColors.foreground),
        actionsIconTheme: const IconThemeData(color: AppColors.foreground),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: AppRadii.lgRadius),
        clipBehavior: Clip.antiAlias,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.onAccent,
          disabledBackgroundColor: AppColors.surface3,
          disabledForegroundColor: AppColors.muted,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: AppRadii.pillBorder,
          textStyle: AppTypography.textTheme.labelLarge,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.onAccent,
          disabledBackgroundColor: AppColors.surface3,
          disabledForegroundColor: AppColors.muted,
          elevation: 0,
          shadowColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: AppRadii.pillBorder,
          textStyle: AppTypography.textTheme.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.foreground,
          disabledForegroundColor: AppColors.muted,
          side: const BorderSide(color: AppColors.borderStrong),
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: AppRadii.pillBorder,
          textStyle: AppTypography.textTheme.labelLarge,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.accent,
          textStyle: AppTypography.textTheme.labelLarge,
          shape: AppRadii.pillBorder,
        ),
      ),
      iconTheme: const IconThemeData(color: AppColors.foreground),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        hintStyle: AppTypography.textTheme.bodyMedium?.copyWith(
          color: AppColors.muted,
        ),
        labelStyle: AppTypography.textTheme.bodyMedium?.copyWith(
          color: AppColors.muted,
        ),
        floatingLabelStyle: AppTypography.textTheme.bodySmall?.copyWith(
          color: AppColors.accent,
        ),
        prefixIconColor: AppColors.muted,
        suffixIconColor: AppColors.muted,
        errorStyle: AppTypography.textTheme.bodySmall?.copyWith(
          color: AppColors.dangerText,
        ),
        border: OutlineInputBorder(
          borderRadius: AppRadii.mdRadius,
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdRadius,
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdRadius,
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdRadius,
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdRadius,
          borderSide: const BorderSide(color: AppColors.danger, width: 1.5),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdRadius,
          borderSide: const BorderSide(color: AppColors.border),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 64,
        backgroundColor: AppColors.surfaceSunk,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: AppColors.accentSoft,
        indicatorShape: AppRadii.pillBorder,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppColors.accent);
          }
          return const IconThemeData(color: AppColors.muted);
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return AppTypography.textTheme.labelSmall?.copyWith(
            fontSize: 11,
            letterSpacing: 0.1,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? AppColors.accent : AppColors.muted,
          );
        }),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surfaceSunk,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.accent,
        unselectedItemColor: AppColors.muted,
        selectedLabelStyle: TextStyle(
          fontFamily: AppTypography.fontFamily,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: TextStyle(
          fontFamily: AppTypography.fontFamily,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        modalBackgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        modalBarrierColor: Color(0xB3000000),
        elevation: 0,
        modalElevation: 0,
        showDragHandle: false,
        dragHandleColor: AppColors.borderStrong,
        dragHandleSize: Size(44, 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppRadii.xl),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        barrierColor: const Color(0xB3000000),
        shape: RoundedRectangleBorder(borderRadius: AppRadii.xlRadius),
        titleTextStyle: AppTypography.textTheme.titleLarge,
        contentTextStyle: AppTypography.textTheme.bodyMedium?.copyWith(
          color: AppColors.muted,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surface2,
        contentTextStyle: AppTypography.textTheme.bodyMedium?.copyWith(
          color: AppColors.foreground,
        ),
        actionTextColor: AppColors.accent,
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: AppRadii.mdRadius),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface2,
        selectedColor: AppColors.accentSoft,
        disabledColor: AppColors.surface2,
        labelStyle: AppTypography.textTheme.labelMedium?.copyWith(
          color: AppColors.foreground,
        ),
        secondaryLabelStyle: AppTypography.textTheme.labelMedium?.copyWith(
          color: AppColors.accent,
        ),
        side: const BorderSide(color: AppColors.border),
        shape: const StadiumBorder(),
        showCheckmark: false,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.foreground,
        unselectedLabelColor: AppColors.muted,
        indicatorColor: AppColors.accent,
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: AppColors.border,
        labelStyle: AppTypography.textTheme.labelLarge,
        unselectedLabelStyle: AppTypography.textTheme.labelMedium,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppColors.onAccent;
          }
          return AppColors.muted;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppColors.accent;
          }
          return AppColors.surface3;
        }),
        trackOutlineColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.transparent;
          }
          return AppColors.borderStrong;
        }),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.accent,
        linearTrackColor: AppColors.surface3,
        circularTrackColor: AppColors.surface3,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: AppColors.muted,
        textColor: AppColors.foreground,
        titleTextStyle: AppTypography.textTheme.titleMedium,
        subtitleTextStyle: AppTypography.textTheme.bodySmall?.copyWith(
          color: AppColors.muted,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
        minVerticalPadding: 8,
        shape: RoundedRectangleBorder(borderRadius: AppRadii.mdRadius),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: AppRadii.smRadius,
          border: Border.all(color: AppColors.border),
        ),
        textStyle: AppTypography.textTheme.bodySmall?.copyWith(
          color: AppColors.foreground,
        ),
        waitDuration: const Duration(milliseconds: 400),
      ),
      textSelectionTheme: const TextSelectionThemeData(
        cursorColor: AppColors.accent,
        selectionColor: AppColors.accentSoft,
        selectionHandleColor: AppColors.accent,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.onAccent,
        elevation: 0,
        focusElevation: 0,
        hoverElevation: 0,
        highlightElevation: 0,
        shape: RoundedRectangleBorder(borderRadius: AppRadii.lgRadius),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppColors.surface2,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        textStyle: AppTypography.textTheme.bodyMedium,
        shape: RoundedRectangleBorder(borderRadius: AppRadii.mdRadius),
      ),
    );
  }
}
