import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Brand-only tokens that do not map cleanly onto Material's [ColorScheme].
@immutable
class BrandColors extends ThemeExtension<BrandColors> {
  const BrandColors({
    required this.surface2,
    required this.surface3,
    required this.surfaceSunk,
    required this.border,
    required this.borderStrong,
    required this.accentSoft,
    required this.ember,
    required this.emberText,
    required this.emberSoft,
    required this.sesame,
    required this.sesameSoft,
    required this.herb,
    required this.herbText,
    required this.herbSoft,
    required this.danger,
    required this.dangerSoft,
    required this.dangerText,
    required this.ctaGradient,
  });

  final Color surface2;
  final Color surface3;
  final Color surfaceSunk;
  final Color border;
  final Color borderStrong;
  final Color accentSoft;
  final Color ember;
  final Color emberText;
  final Color emberSoft;
  final Color sesame;
  final Color sesameSoft;
  final Color herb;
  final Color herbText;
  final Color herbSoft;
  final Color danger;
  final Color dangerSoft;
  final Color dangerText;
  final LinearGradient ctaGradient;

  static const BrandColors fallback = BrandColors(
    surface2: AppColors.surface2,
    surface3: AppColors.surface3,
    surfaceSunk: AppColors.surfaceSunk,
    border: AppColors.border,
    borderStrong: AppColors.borderStrong,
    accentSoft: AppColors.accentSoft,
    ember: AppColors.ember,
    emberText: AppColors.emberText,
    emberSoft: AppColors.emberSoft,
    sesame: AppColors.sesame,
    sesameSoft: AppColors.sesameSoft,
    herb: AppColors.herb,
    herbText: AppColors.herbText,
    herbSoft: AppColors.herbSoft,
    danger: AppColors.danger,
    dangerSoft: AppColors.dangerSoft,
    dangerText: AppColors.dangerText,
    ctaGradient: LinearGradient(
      colors: [AppColors.ctaGradientStart, AppColors.ctaGradientEnd],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
  );

  static BrandColors of(BuildContext context) {
    return Theme.of(context).extension<BrandColors>() ?? fallback;
  }

  @override
  BrandColors copyWith({
    Color? surface2,
    Color? surface3,
    Color? surfaceSunk,
    Color? border,
    Color? borderStrong,
    Color? accentSoft,
    Color? ember,
    Color? emberText,
    Color? emberSoft,
    Color? sesame,
    Color? sesameSoft,
    Color? herb,
    Color? herbText,
    Color? herbSoft,
    Color? danger,
    Color? dangerSoft,
    Color? dangerText,
    LinearGradient? ctaGradient,
  }) {
    return BrandColors(
      surface2: surface2 ?? this.surface2,
      surface3: surface3 ?? this.surface3,
      surfaceSunk: surfaceSunk ?? this.surfaceSunk,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      accentSoft: accentSoft ?? this.accentSoft,
      ember: ember ?? this.ember,
      emberText: emberText ?? this.emberText,
      emberSoft: emberSoft ?? this.emberSoft,
      sesame: sesame ?? this.sesame,
      sesameSoft: sesameSoft ?? this.sesameSoft,
      herb: herb ?? this.herb,
      herbText: herbText ?? this.herbText,
      herbSoft: herbSoft ?? this.herbSoft,
      danger: danger ?? this.danger,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      dangerText: dangerText ?? this.dangerText,
      ctaGradient: ctaGradient ?? this.ctaGradient,
    );
  }

  @override
  BrandColors lerp(ThemeExtension<BrandColors>? other, double t) {
    if (other is! BrandColors) return this;
    return BrandColors(
      surface2: Color.lerp(surface2, other.surface2, t)!,
      surface3: Color.lerp(surface3, other.surface3, t)!,
      surfaceSunk: Color.lerp(surfaceSunk, other.surfaceSunk, t)!,
      border: Color.lerp(border, other.border, t)!,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t)!,
      accentSoft: Color.lerp(accentSoft, other.accentSoft, t)!,
      ember: Color.lerp(ember, other.ember, t)!,
      emberText: Color.lerp(emberText, other.emberText, t)!,
      emberSoft: Color.lerp(emberSoft, other.emberSoft, t)!,
      sesame: Color.lerp(sesame, other.sesame, t)!,
      sesameSoft: Color.lerp(sesameSoft, other.sesameSoft, t)!,
      herb: Color.lerp(herb, other.herb, t)!,
      herbText: Color.lerp(herbText, other.herbText, t)!,
      herbSoft: Color.lerp(herbSoft, other.herbSoft, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      dangerSoft: Color.lerp(dangerSoft, other.dangerSoft, t)!,
      dangerText: Color.lerp(dangerText, other.dangerText, t)!,
      ctaGradient: LinearGradient.lerp(ctaGradient, other.ctaGradient, t)!,
    );
  }
}
