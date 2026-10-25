import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../profile/data/store_settings_repository.dart';

/// App-bar brand mark. Uses the live store logo when one is configured and
/// falls back to the bundled mark while branding loads or if it fails.
class BrandLogo extends ConsumerWidget {
  const BrandLogo({super.key, this.height = 34});

  final double height;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(storeBrandingProvider).valueOrNull;
    final logoUrl = branding?.logoUrl;

    if (logoUrl == null || logoUrl.isEmpty) {
      return AppLogo(height: height);
    }

    return Semantics(
      image: true,
      label: 'Mad Krapow',
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 140),
        child: CachedNetworkImage(
          imageUrl: logoUrl,
          height: height,
          fit: BoxFit.contain,
          alignment: Alignment.centerLeft,
          placeholder: (context, url) => AppLogo(height: height),
          errorWidget: (context, url, error) => AppLogo(height: height),
        ),
      ),
    );
  }
}
