import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../generated/tables/store_settings.dart';
import '../../../../generated/tables/hubbopos_sync_runs.dart';
import '../../providers/settings_providers.dart';
import '../../data/settings_repository.dart';

/// Settings screen matching the web admin at apps/web/src/app/admin/settings/page.tsx.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(hubboPosStatusProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(hubboPosStatusProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── General Settings ──
            _GeneralSettingsCard(),
            const SizedBox(height: 16),

            // ── HubboPOS Integration ──
            statusAsync.when(
              data: (status) => _HubboPosSection(status: status),
              loading: () => const Card(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
              error: (err, _) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(
                        err.toString(),
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: () =>
                            ref.invalidate(hubboPosStatusProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// General Settings placeholder card.
class _GeneralSettingsCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'General Settings',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Settings configuration coming soon.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// HubboPOS Integration card with status, details, errors, recent sync, and actions.
class _HubboPosSection extends ConsumerWidget {
  const _HubboPosSection({required this.status});

  final HubboPosStatus status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actionAsync = ref.watch(hubboPosActionProvider);
    final settings = status.settings;
    final isEnabled = settings.hubboPosEnabled;
    final healthStatus = settings.hubboPosHealthStatus;
    final circuitState = settings.hubboPosCircuitState;
    final queuePending = status.queuePending;
    final recentSync = status.recentSync;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Title ──
            Text(
              'HubboPOS Integration',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'POS synchronization and connection management',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 16),

            // ── Status Row ──
            _StatusRow(
              isEnabled: isEnabled,
              healthStatus: healthStatus,
              circuitState: circuitState,
              queuePending: queuePending,
            ),
            const SizedBox(height: 16),

            // ── Connection Details (only if enabled) ──
            if (isEnabled) ...[
              _ConnectionDetailsGrid(settings: settings),
              const SizedBox(height: 16),
            ],

            // ── Last Error (only if error exists) ──
            if (settings.hubboPosLastError != null &&
                settings.hubboPosLastError!.isNotEmpty)
              _LastErrorBanner(
                errorMessage: settings.hubboPosLastError!,
                errorAt: settings.hubboPosLastErrorAt,
              ),

            // ── Most Recent Sync ──
            if (recentSync != null) ...[
              if (settings.hubboPosLastError != null &&
                  settings.hubboPosLastError!.isNotEmpty)
                const SizedBox(height: 16),
              _RecentSyncSection(sync: recentSync),
              const SizedBox(height: 16),
            ],

            // ── Action Buttons ──
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: actionAsync.isLoading
                      ? null
                      : () => ref.read(hubboPosActionProvider.notifier).testConnection(),
                  icon: actionAsync.isLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh, size: 18),
                  label: const Text('Test Connection'),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  onPressed: actionAsync.isLoading
                      ? null
                      : () => ref.read(hubboPosActionProvider.notifier).syncNow(),
                  icon: actionAsync.isLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.sync, size: 18),
                  label: const Text('Full Sync Now'),
                ),
              ],
            ),

            // ── Action Error ──
            if (actionAsync.hasError) ...[
              const SizedBox(height: 8),
              Text(
                actionAsync.error.toString(),
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontSize: 13,
                ),
              ),
            ],

            const SizedBox(height: 12),

            // ── View API Logs ──
            OutlinedButton(
              onPressed: () {
                // Placeholder: API logs viewer not yet implemented
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('API Logs coming soon')),
                );
              },
              child: const Text('View API Logs'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal row of status badges: Enabled/Disabled, Health, Circuit, Queue.
class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.isEnabled,
    required this.healthStatus,
    required this.circuitState,
    required this.queuePending,
  });

  final bool isEnabled;
  final String healthStatus;
  final String circuitState;
  final int queuePending;

  Color _healthColor(String status) {
    return switch (status) {
      'healthy' => const Color(0xFF6EE7B7),   // emerald-500
      'degraded' => const Color(0xFFFBBF24),   // amber-500
      'unhealthy' => const Color(0xFFEF4444),  // red-500
      _ => const Color(0xFF9CA3AF),            // gray-400
    };
  }

  Color _healthBackground(String status) {
    return switch (status) {
      'healthy' => const Color(0xFF6EE7B7).withValues(alpha: 0.15),
      'degraded' => const Color(0xFFFBBF24).withValues(alpha: 0.15),
      'unhealthy' => const Color(0xFFEF4444).withValues(alpha: 0.15),
      _ => const Color(0xFF9CA3AF).withValues(alpha: 0.15),
    };
  }

  Color _circuitColor(String state) {
    return switch (state) {
      'closed' => const Color(0xFF6EE7B7),
      'half_open' => const Color(0xFFFBBF24),
      _ => const Color(0xFFEF4444),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 8,
      children: [
        // Enabled / Disabled
        _StatusBadge(
          label: 'Status',
          value: isEnabled ? 'Enabled' : 'Disabled',
          valueColor: Colors.white,
          valueBackground: isEnabled
              ? const Color(0xFF6EE7B7)
              : const Color(0xFF6B7280),
        ),
        // Health
        _StatusBadge(
          label: 'Health',
          value: healthStatus,
          valueColor: _healthColor(healthStatus),
          valueBackground: _healthBackground(healthStatus),
        ),
        // Circuit
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.warning_amber_rounded,
                size: 16, color: _circuitColor(circuitState)),
            const SizedBox(width: 4),
            Text(
              'Circuit',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              circuitState.replaceAll('_', ' '),
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: _circuitColor(circuitState),
              ),
            ),
          ],
        ),
        // Queue pending
        _StatusBadge(
          label: 'Queue',
          value: '$queuePending',
          valueColor: Colors.white,
          valueBackground: queuePending > 0
              ? const Color(0xFFEF4444)
              : const Color(0xFF6B7280),
        ),
      ],
    );
  }
}

/// A small labeled badge row.
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.value,
    required this.valueColor,
    required this.valueBackground,
  });

  final String label;
  final String value;
  final Color valueColor;
  final Color valueBackground;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(width: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: valueBackground,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: valueColor,
            ),
          ),
        ),
      ],
    );
  }
}

/// Grid of connection details: Merchant ID, Location ID, Last Sync, etc.
class _ConnectionDetailsGrid extends StatelessWidget {
  const _ConnectionDetailsGrid({required this.settings});

  final StoreSettingsRow settings;

  String _formatDateTime(DateTime? dt) {
    if (dt == null) return 'Never';
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _DetailItem(
                  label: 'Merchant ID',
                  value: settings.hubboPosMerchantId ?? 'Not configured',
                  mono: true,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DetailItem(
                  label: 'Location ID',
                  value: settings.hubboPosLocationId ?? 'Not set',
                  mono: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _DetailItem(
                  label: 'Last Sync',
                  value: _formatDateTime(settings.hubboPosLastSyncAt),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DetailItem(
                  label: 'Last Catalog Sync',
                  value: _formatDateTime(settings.hubboPosLastCatalogSyncAt),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _DetailItem(
                  label: 'Sync Interval',
                  value: '${settings.hubboPosSyncIntervalMinutes} minutes',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DetailItem(
                  label: 'Read-Only Mode',
                  value: settings.hubboPosReadOnlyMode ? 'Active' : 'Inactive',
                  valueColor: settings.hubboPosReadOnlyMode
                      ? const Color(0xFFFBBF24)
                      : null,
                  valueBackground: settings.hubboPosReadOnlyMode
                      ? const Color(0xFFFBBF24).withValues(alpha: 0.15)
                      : const Color(0xFF6B7280).withValues(alpha: 0.15),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A single detail label/value pair.
class _DetailItem extends StatelessWidget {
  const _DetailItem({
    required this.label,
    required this.value,
    this.mono = false,
    this.valueColor,
    this.valueBackground,
  });

  final String label;
  final String value;
  final bool mono;
  final Color? valueColor;
  final Color? valueBackground;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 2),
        if (valueBackground != null && valueColor != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: valueBackground,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: valueColor,
              ),
            ),
          )
        else
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontFamily: mono ? 'monospace' : null,
            ),
          ),
      ],
    );
  }
}

/// Red-tinted error banner for the last HubboPOS error.
class _LastErrorBanner extends StatelessWidget {
  const _LastErrorBanner({
    required this.errorMessage,
    this.errorAt,
  });

  final String errorMessage;
  final DateTime? errorAt;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withValues(alpha: 0.08),
        border: Border.all(
          color: const Color(0xFFEF4444).withValues(alpha: 0.2),
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.cancel, size: 16, color: Color(0xFFEF4444)),
              const SizedBox(width: 6),
              Text(
                'Last Error',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            errorMessage,
            style: TextStyle(
              fontSize: 13,
              color: Theme.of(context).colorScheme.error.withValues(alpha: 0.8),
            ),
          ),
          if (errorAt != null) ...[
            const SizedBox(height: 4),
            Text(
              '${errorAt!.year}-${errorAt!.month.toString().padLeft(2, '0')}-${errorAt!.day.toString().padLeft(2, '0')} '
              '${errorAt!.hour.toString().padLeft(2, '0')}:${errorAt!.minute.toString().padLeft(2, '0')}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Most recent sync run details section.
class _RecentSyncSection extends StatelessWidget {
  const _RecentSyncSection({required this.sync});

  final HubboposSyncRunsRow sync;

  @override
  Widget build(BuildContext context) {
    final isCompleted = sync.status == 'completed';
    final statusColor = isCompleted
        ? const Color(0xFF6EE7B7)
        : const Color(0xFFEF4444);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.schedule, size: 16,
                  color: Color(0xFF9CA3AF)),
              const SizedBox(width: 6),
              Text(
                'Most Recent Sync',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  sync.status,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Stats grid
          Row(
            children: [
              Expanded(
                child: _DetailItem(
                  label: 'Catalog Synced',
                  value: sync.catalogSynced ? 'Yes' : 'No',
                ),
              ),
              Expanded(
                child: _DetailItem(
                  label: 'Orders Pulled',
                  value: '${sync.ordersPulled}',
                ),
              ),
              Expanded(
                child: _DetailItem(
                  label: 'Queue Flushed',
                  value: '${sync.queueFlushed}',
                ),
              ),
            ],
          ),

          // Error message from sync run
          if (sync.errorMessage != null &&
              sync.errorMessage!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              sync.errorMessage!,
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ],
        ],
      ),
    );
  }
}