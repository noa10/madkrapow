import 'package:flutter/material.dart';

import '../tokens/app_assets.dart';
import '../tokens/app_colors.dart';

/// The bundled Mad Krapow mark, with a fire-icon fallback if the asset ever
/// fails to decode.
class AppLogo extends StatelessWidget {
  const AppLogo({
    super.key,
    this.height = 48,
    this.width,
    this.fit = BoxFit.contain,
  });

  final double height;
  final double? width;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      AppAssets.logo,
      height: height,
      width: width,
      fit: fit,
      semanticLabel: 'Mad Krapow',
      errorBuilder: (context, error, stackTrace) {
        return Icon(
          Icons.local_fire_department,
          size: height,
          color: AppColors.emberText,
        );
      },
    );
  }
}
