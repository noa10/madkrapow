import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../../config/routes.dart';
import '../../../../core/widgets/async_value_widget.dart';
import '../../../auth/providers/admin_auth_providers.dart';
import '../../data/promo_repository.dart';
import '../../providers/promo_providers.dart';

class PromoListScreen extends ConsumerStatefulWidget {
  const PromoListScreen({super.key});

  @override
  ConsumerState<PromoListScreen> createState() => _PromoListScreenState();
}

class _PromoListScreenState extends ConsumerState<PromoListScreen> {
  String _searchQuery = '';
  String _scopeFilter = 'all';

  @override
  Widget build(BuildContext context) {
    // Keep real-time watcher alive while screen is visible
    ref.watch(promoRealtimeWatcherProvider);
    final promosAsync = ref.watch(promosProvider);
    final canManage = ref.watch(canManageStaffProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Promotions'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(promosProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filters
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search promos...',
                      prefixIcon: Icon(Icons.search, size: 20),
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      isDense: true,
                    ),
                    onChanged: (value) => setState(() => _searchQuery = value),
                  ),
                ),
                const SizedBox(width: 8),
                DropdownButton<String>(
                  value: _scopeFilter,
                  isDense: true,
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('All')),
                    DropdownMenuItem(value: 'order', child: Text('Order')),
                    DropdownMenuItem(value: 'delivery', child: Text('Delivery')),
                  ],
                  onChanged: (value) {
                    if (value != null) setState(() => _scopeFilter = value);
                  },
                ),
              ],
            ),
          ),
          // List
          Expanded(
            child: AsyncValueWidget<List<PromoCode>>(
              value: promosAsync,
              data: (promos) {
                final filtered = promos.where((promo) {
                  final matchesSearch = _searchQuery.isEmpty ||
                      promo.code.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                      (promo.description?.toLowerCase().contains(_searchQuery.toLowerCase()) ?? false);
                  final matchesScope = _scopeFilter == 'all' || promo.scope == _scopeFilter;
                  return matchesSearch && matchesScope;
                }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.local_offer_outlined, size: 64, color: Colors.grey[400]),
                        const SizedBox(height: 16),
                        Text(
                          promos.isEmpty ? 'No promotions yet' : 'No promos match your filters',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final promo = filtered[index];
                    return _PromoListTile(
                      promo: promo,
                      canManage: canManage,
                      onTap: () => _onPromoTap(context, promo),
                      onDelete: () => _confirmDelete(context, promo),
                      onToggle: () => _toggleActive(promo),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              onPressed: () => context.push(AppRoutes.promoNew),
              icon: const Icon(Icons.add),
              label: const Text('New Promo'),
            )
          : null,
    );
  }

  void _onPromoTap(BuildContext context, PromoCode promo) {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit),
              title: const Text('Edit'),
              onTap: () {
                Navigator.pop(context);
                context.push(AppRoutes.promoEdit.replaceAll(':id', promo.id));
              },
            ),
            ListTile(
              leading: Icon(
                promo.isActive ? Icons.toggle_on : Icons.toggle_off,
                color: promo.isActive ? Colors.green : Colors.grey,
              ),
              title: Text(promo.isActive ? 'Deactivate' : 'Activate'),
              onTap: () {
                Navigator.pop(context);
                _toggleActive(promo);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete, color: Colors.red),
              title: const Text('Delete', style: TextStyle(color: Colors.red)),
              onTap: () {
                Navigator.pop(context);
                _confirmDelete(context, promo);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleActive(PromoCode promo) async {
    final notifier = ref.read(togglePromoProvider.notifier);
    await notifier.toggle(promo.id, promo.isActive);
    if (!mounted) return;
    final state = ref.read(togglePromoProvider);
    if (state.hasError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to toggle: ${state.error}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _confirmDelete(BuildContext context, PromoCode promo) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Promo?'),
        content: Text('Are you sure you want to delete ${promo.code}? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    final notifier = ref.read(deletePromoProvider.notifier);
    await notifier.deletePromo(promo.id);

    if (!context.mounted) return;

    final state = ref.read(deletePromoProvider);
    if (state.hasError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to delete: ${state.error}'),
          backgroundColor: Colors.red,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Promo deleted')),
      );
    }
  }
}

class _PromoListTile extends StatelessWidget {
  final PromoCode promo;
  final bool canManage;
  final VoidCallback onTap;
  final VoidCallback onDelete;
  final VoidCallback onToggle;

  const _PromoListTile({
    required this.promo,
    required this.canManage,
    required this.onTap,
    required this.onDelete,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = _statusColor(promo.statusLabel);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: statusColor.withValues(alpha: 0.1),
          child: Icon(
            promo.scope == 'delivery' ? Icons.local_shipping : Icons.tag,
            color: statusColor,
            size: 20,
          ),
        ),
        title: Text(
          promo.code,
          style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (promo.description != null && promo.description!.isNotEmpty)
              Text(promo.description!, maxLines: 1, overflow: TextOverflow.ellipsis),
            Row(
              children: [
                _BadgeText(_scopeLabel(promo.scope)),
                const SizedBox(width: 4),
                _BadgeText(promo.applicationType == 'auto' ? 'Auto' : 'Code'),
                const SizedBox(width: 4),
                _BadgeText(_discountLabel(promo)),
              ],
            ),
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                promo.statusLabel,
                style: theme.textTheme.labelSmall?.copyWith(color: statusColor),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${promo.currentUses}${promo.maxUses != null ? '/${promo.maxUses}' : '/∞'}',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'Active':
        return Colors.green;
      case 'Inactive':
        return Colors.grey;
      case 'Depleted':
        return Colors.orange;
      case 'Expired':
        return Colors.red;
      case 'Scheduled':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  String _scopeLabel(String scope) => scope == 'order' ? 'Order' : 'Delivery';

  String _discountLabel(PromoCode promo) {
    if (promo.discountType == 'percentage') {
      return '${promo.discountValue}%';
    }
    final currencyFormat = NumberFormat.currency(symbol: 'RM ', decimalDigits: 2);
    return currencyFormat.format(promo.discountValue / 100);
  }
}

class _BadgeText extends StatelessWidget {
  final String text;

  const _BadgeText(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Theme.of(context).colorScheme.outline,
          ),
    );
  }
}
