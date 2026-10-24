import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import 'info_section_header.dart';

/// "Two ways to order" section. The GrabFood pill can become an external link
/// once the public app URL is configured in mobile env.
class HowToOrderSection extends StatelessWidget {
  const HowToOrderSection({super.key, this.onBrowseMenu, this.onGrabFoodTap});

  final VoidCallback? onBrowseMenu;
  final VoidCallback? onGrabFoodTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 40, 16, 40),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1152),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const InfoSectionHeader(
                eyebrow: 'Choose your channel',
                title: 'Two ways to order',
                subtitle:
                    'Choose GrabFood for instant checkout, or order direct '
                    'for Lalamove delivery.',
              ),
              const SizedBox(height: 18),
              LayoutBuilder(
                builder: (context, constraints) {
                  final grabFoodCard = _OrderChannelCard(
                    icon: Icons.bolt,
                    iconColor: AppColors.emberText,
                    iconBackground: AppColors.emberSoft,
                    title: 'Order on GrabFood',
                    description:
                        'Prefer the Grab app? Find Mad Krapow on GrabFood for '
                        'instant checkout and Grab-managed delivery.',
                    action: _GrabFoodAction(onTap: onGrabFoodTap),
                  );
                  final directCard = _OrderChannelCard(
                    icon: Icons.delivery_dining,
                    iconColor: AppColors.herbText,
                    iconBackground: AppColors.herbSoft,
                    title: 'Order direct',
                    description:
                        'Order here for Lalamove delivery, or choose '
                        'self-pickup. The Lalamove fee is calculated at '
                        'checkout, and the minimum order is RM 20.00.',
                    action: OutlinedButton.icon(
                      onPressed: onBrowseMenu,
                      icon: const Icon(Icons.restaurant_menu, size: 17),
                      label: const Text('Browse the menu'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44),
                        padding: const EdgeInsets.symmetric(horizontal: 18),
                        textStyle: Theme.of(
                          context,
                        ).textTheme.labelLarge?.copyWith(fontSize: 13),
                      ),
                    ),
                  );

                  if (constraints.maxWidth >= 600) {
                    return IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(child: grabFoodCard),
                          const SizedBox(width: 12),
                          Expanded(child: directCard),
                        ],
                      ),
                    );
                  }

                  return Column(
                    children: [
                      grabFoodCard,
                      const SizedBox(height: 12),
                      directCard,
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderChannelCard extends StatelessWidget {
  const _OrderChannelCard({
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    required this.title,
    required this.description,
    required this.action,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final String title;
  final String description;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: iconBackground,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: iconColor),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 13,
              height: 1.55,
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 12),
          action,
        ],
      ),
    );
  }
}

class _GrabFoodAction extends StatelessWidget {
  const _GrabFoodAction({this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = Text(
      'Available on the Grab app',
      style: theme.textTheme.labelSmall?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
        color: AppColors.foreground,
      ),
    );

    if (onTap == null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: AppRadii.pillRadius,
        ),
        child: label,
      );
    }

    return Material(
      color: AppColors.surface2,
      shape: const StadiumBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: label,
        ),
      ),
    );
  }
}
