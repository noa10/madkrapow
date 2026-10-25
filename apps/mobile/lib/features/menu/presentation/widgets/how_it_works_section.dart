import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import 'info_section_header.dart';

const _stepIconColor = Color(0xFFFFB3B6);

const _steps = <_Step>[
  _Step(
    icon: Icons.shopping_cart_outlined,
    number: '01',
    title: 'Pick your dish',
    description:
        'Browse the menu and add your favourite Phad Kra Phao to the cart.',
  ),
  _Step(
    icon: Icons.location_on_outlined,
    number: '02',
    title: 'Enter your address',
    description:
        'Provide your delivery address, or switch to self-pickup at the store.',
  ),
  _Step(
    icon: Icons.credit_card,
    number: '03',
    title: 'Review & pay',
    description:
        'Confirm your delivery fee and total, then check out securely.',
  ),
  _Step(
    icon: Icons.local_shipping_outlined,
    number: '04',
    title: 'Wait for delivery',
    description:
        'Your food is cooked fresh and delivered hot straight to your door.',
  ),
];

/// Four-step "How it works" section.
class HowItWorksSection extends StatelessWidget {
  const HowItWorksSection({super.key});

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
                eyebrow: 'Fast & frictionless',
                title: 'How it works',
                subtitle: 'Four steps from craving to doorstep.',
              ),
              const SizedBox(height: 18),
              LayoutBuilder(
                builder: (context, constraints) {
                  final columns = constraints.maxWidth >= 960
                      ? 4
                      : constraints.maxWidth >= 600
                      ? 2
                      : 1;
                  final cardWidth =
                      (constraints.maxWidth - 12 * (columns - 1)) / columns;

                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final step in _steps)
                        SizedBox(
                          width: cardWidth,
                          child: _StepCard(step: step, vertical: columns > 2),
                        ),
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

class _Step {
  const _Step({
    required this.icon,
    required this.number,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String number;
  final String title;
  final String description;
}

class _StepCard extends StatelessWidget {
  const _StepCard({required this.step, required this.vertical});

  final _Step step;
  final bool vertical;

  @override
  Widget build(BuildContext context) {
    final icon = Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Icon(step.icon, size: 18, color: _stepIconColor),
    );

    final content = _StepContent(step: step);

    return AppCard(
      padding: const EdgeInsets.all(16),
      child: vertical
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [icon, const SizedBox(height: 15), content],
            )
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                icon,
                const SizedBox(width: 14),
                Expanded(child: content),
              ],
            ),
    );
  }
}

class _StepContent extends StatelessWidget {
  const _StepContent({required this.step});

  final _Step step;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'STEP ${step.number}',
          style: theme.textTheme.labelSmall?.copyWith(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.0,
            color: AppColors.emberText,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          step.title,
          style: theme.textTheme.titleSmall?.copyWith(
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          step.description,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 13,
            height: 1.55,
            color: AppColors.muted,
          ),
        ),
      ],
    );
  }
}
