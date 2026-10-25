import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

class MenuLoadingState extends StatelessWidget {
  const MenuLoadingState({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 48, 16, 48),
      child: Column(
        children: [
          const SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          const SizedBox(height: 14),
          Text(
            'Loading the menu…',
            style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}

class MenuErrorState extends StatelessWidget {
  const MenuErrorState({super.key, required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 32, 16, 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: AppCard(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.surface2,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.cloud_off_outlined,
                    size: 24,
                    color: AppColors.muted,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  "We couldn't load the menu",
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Check your connection and try again.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.muted,
                  ),
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: onRetry,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                  ),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MenuNoResultsState extends StatelessWidget {
  const MenuNoResultsState({
    super.key,
    required this.query,
    required this.onClear,
  });

  final String query;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: AppEmptyState(
        icon: Icons.search_off,
        title: 'No items match “${query.trim()}”',
        message: 'Try another word — like a dish, an ingredient or a protein.',
        action: OutlinedButton(
          onPressed: onClear,
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
          child: const Text('Clear search'),
        ),
      ),
    );
  }
}

class MenuUnavailableState extends StatelessWidget {
  const MenuUnavailableState({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 16),
      child: AppEmptyState(
        icon: Icons.restaurant_menu,
        title: 'No menu items available at the moment.',
      ),
    );
  }
}
