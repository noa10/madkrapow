import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../core/widgets/async_value_widget.dart';
import '../../../../core/widgets/error_banner.dart';
import '../../../../generated/database.dart';
import '../../providers/menu_providers.dart';
import '../widgets/modifier_bindings_editor.dart';

class ModifierManagementScreen extends ConsumerStatefulWidget {
  const ModifierManagementScreen({super.key});

  @override
  ConsumerState<ModifierManagementScreen> createState() =>
      _ModifierManagementScreenState();
}

class _ModifierManagementScreenState
    extends ConsumerState<ModifierManagementScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Modifiers'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Groups'),
            Tab(text: 'Modifiers'),
            Tab(text: 'Bindings'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [_ModifierGroupsTab(), _ModifiersTab(), _BindingsTab()],
      ),
    );
  }
}

// ─── Groups Tab ───

class _ModifierGroupsTab extends ConsumerStatefulWidget {
  const _ModifierGroupsTab();

  @override
  ConsumerState<_ModifierGroupsTab> createState() => _ModifierGroupsTabState();
}

class _ModifierGroupsTabState extends ConsumerState<_ModifierGroupsTab> {
  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(modifierGroupsProvider);

    return AsyncValueWidget(
      value: groupsAsync,
      data: (groups) {
        if (groups.isEmpty) {
          return AppEmptyState(
            icon: Icons.extension,
            title: 'No modifier groups yet',
            action: FilledButton.icon(
              onPressed: () => _showGroupForm(context),
              icon: const Icon(Icons.add),
              label: const Text('Add Group'),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(12),
          itemCount: groups.length,
          itemBuilder: (context, index) {
            final group = groups[index];
            return _ModifierGroupCard(
              group: group,
              onEdit: () => _showGroupForm(context, group: group),
              onDelete: () => _confirmDeleteGroup(context, group),
            );
          },
        );
      },
    );
  }

  void _showGroupForm(BuildContext context, {ModifierGroupsRow? group}) {
    showDialog(
      context: context,
      builder: (ctx) => _ModifierGroupFormDialog(group: group),
    );
  }

  Future<void> _confirmDeleteGroup(
    BuildContext context,
    ModifierGroupsRow group,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Group'),
        content: Text(
          'Delete "${group.name}"? This will also remove all modifiers in this group.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final repo = ref.read(menuRepositoryProvider);
        await repo.deleteModifierGroup(group.id);
        if (context.mounted) {
          ref.invalidate(modifierGroupsProvider);
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to delete group: $e'),
              backgroundColor: AppColors.danger,
            ),
          );
        }
      }
    }
  }
}

class _ModifierGroupCard extends StatelessWidget {
  const _ModifierGroupCard({
    required this.group,
    required this.onEdit,
    required this.onDelete,
  });

  final ModifierGroupsRow group;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isRadio = group.maxSelections == 1;
    final isRequired = group.minSelections > 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (group.description != null &&
                          group.description!.isNotEmpty)
                        Text(
                          group.description!,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.muted,
                          ),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: isRadio ? AppColors.infoSoft : AppColors.successSoft,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isRadio ? 'Radio' : 'Checkbox',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isRadio ? AppColors.info : AppColors.herbText,
                    ),
                  ),
                ),
                if (isRequired)
                  Container(
                    margin: const EdgeInsets.only(left: 6),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.sesameSoft,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Required',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.sesame,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Min: ${group.minSelections}  \u2022  Max: ${group.maxSelections}  \u2022  Sort: ${group.sortOrder}',
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
            const Divider(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit, size: 18),
                  label: const Text('Edit'),
                ),
                TextButton.icon(
                  onPressed: onDelete,
                  icon: const Icon(
                    Icons.delete,
                    size: 18,
                    color: AppColors.dangerText,
                  ),
                  label: const Text(
                    'Delete',
                    style: TextStyle(color: AppColors.dangerText),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ModifierGroupFormDialog extends ConsumerStatefulWidget {
  final ModifierGroupsRow? group;

  const _ModifierGroupFormDialog({this.group});

  @override
  ConsumerState<_ModifierGroupFormDialog> createState() =>
      _ModifierGroupFormDialogState();
}

class _ModifierGroupFormDialogState
    extends ConsumerState<_ModifierGroupFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late int _maxSelections;
  late int _sortOrder;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.group?.name ?? '');
    _maxSelections = widget.group?.maxSelections ?? 1;
    _sortOrder = widget.group?.sortOrder ?? 0;
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      final repo = ref.read(menuRepositoryProvider);
      if (widget.group != null) {
        final updated = widget.group!.copyWith(
          name: _nameController.text.trim(),
          maxSelections: _maxSelections,
          sortOrder: _sortOrder,
        );
        await repo.updateModifierGroup(updated);
      } else {
        final newGroup = ModifierGroupsRow(
          name: _nameController.text.trim(),
          maxSelections: _maxSelections,
          sortOrder: _sortOrder,
        );
        await repo.createModifierGroup(newGroup);
      }
      if (mounted) {
        ref.invalidate(modifierGroupsProvider);
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.group != null ? 'Edit Group' : 'New Group'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Name is required' : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: _maxSelections.toString(),
                    decoration: const InputDecoration(
                      labelText: 'Max Selections',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (v) =>
                        _maxSelections = int.tryParse(v) ?? _maxSelections,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    initialValue: _sortOrder.toString(),
                    decoration: const InputDecoration(
                      labelText: 'Sort Order',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (v) =>
                        _sortOrder = int.tryParse(v) ?? _sortOrder,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Save')),
      ],
    );
  }
}

// ─── Modifiers Tab ───

class _ModifiersTab extends ConsumerStatefulWidget {
  const _ModifiersTab();

  @override
  ConsumerState<_ModifiersTab> createState() => _ModifiersTabState();
}

class _ModifiersTabState extends ConsumerState<_ModifiersTab> {
  String? _selectedGroupId;

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(modifierGroupsProvider);

    return AsyncValueWidget(
      value: groupsAsync,
      data: (groups) {
        if (groups.isEmpty) {
          return const Center(
            child: Text('Create a modifier group first to add modifiers.'),
          );
        }

        _selectedGroupId ??= groups.first.id;

        final modifiersAsync = ref.watch(
          modifiersForGroupProvider(_selectedGroupId!),
        );

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12.0),
              child: DropdownButtonFormField<String>(
                initialValue: _selectedGroupId,
                decoration: const InputDecoration(
                  labelText: 'Modifier Group',
                  border: OutlineInputBorder(),
                ),
                isExpanded: true,
                items: groups
                    .map(
                      (g) => DropdownMenuItem(value: g.id, child: Text(g.name)),
                    )
                    .toList(),
                onChanged: (v) {
                  if (v != null) {
                    setState(() => _selectedGroupId = v);
                  }
                },
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(modifiersForGroupProvider(_selectedGroupId!));
                },
                child: modifiersAsync.when(
                  data: (modifiers) {
                    if (modifiers.isEmpty) {
                      return const Center(
                        child: Text('No modifiers in this group'),
                      );
                    }
                    return ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      itemCount: modifiers.length,
                      itemBuilder: (context, index) {
                        final mod = modifiers[index];
                        return _ModifierCard(
                          modifier: mod,
                          onEdit: () =>
                              _showModifierForm(context, modifier: mod),
                          onDelete: () => _confirmDeleteModifier(context, mod),
                        );
                      },
                    );
                  },
                  loading: () => LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: SizedBox(
                        height: constraints.maxHeight,
                        child: const Center(child: CircularProgressIndicator()),
                      ),
                    ),
                  ),
                  error: (err, _) => LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: SizedBox(
                        height: constraints.maxHeight,
                        child: ErrorBanner(
                          message: err.toString(),
                          onRetry: () => ref.invalidate(
                            modifiersForGroupProvider(_selectedGroupId!),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  void _showModifierForm(BuildContext context, {ModifiersRow? modifier}) {
    if (_selectedGroupId == null) return;
    showDialog(
      context: context,
      builder: (ctx) =>
          _ModifierFormDialog(modifier: modifier, groupId: _selectedGroupId!),
    );
  }

  Future<void> _confirmDeleteModifier(
    BuildContext context,
    ModifiersRow modifier,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Modifier'),
        content: Text('Delete "${modifier.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final repo = ref.read(menuRepositoryProvider);
        await repo.deleteModifier(modifier.id);
        if (context.mounted) {
          ref.invalidate(modifiersForGroupProvider(_selectedGroupId!));
          ref.invalidate(modifierGroupsProvider);
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to delete modifier: $e'),
              backgroundColor: AppColors.danger,
            ),
          );
        }
      }
    }
  }
}

class _ModifierCard extends StatelessWidget {
  const _ModifierCard({
    required this.modifier,
    required this.onEdit,
    required this.onDelete,
  });

  final ModifiersRow modifier;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Row(
          children: [
            Flexible(
              child: Text(modifier.name, overflow: TextOverflow.ellipsis),
            ),
            if (modifier.isDefault)
              Container(
                margin: const EdgeInsets.only(left: 8),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.accentSoft,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Default',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accent,
                  ),
                ),
              ),
            if (!modifier.isAvailable)
              Container(
                margin: const EdgeInsets.only(left: 8),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.surface3,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Unavailable',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.muted,
                  ),
                ),
              ),
          ],
        ),
        subtitle: Text(
          'Price delta: ${formatPriceNumber(modifier.priceDeltaCents)}  \u2022  Sort: ${modifier.sortOrder}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(icon: const Icon(Icons.edit), onPressed: onEdit),
            IconButton(
              icon: const Icon(Icons.delete, color: AppColors.dangerText),
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}

class _ModifierFormDialog extends ConsumerStatefulWidget {
  final ModifiersRow? modifier;
  final String groupId;

  const _ModifierFormDialog({this.modifier, required this.groupId});

  @override
  ConsumerState<_ModifierFormDialog> createState() =>
      _ModifierFormDialogState();
}

class _ModifierFormDialogState extends ConsumerState<_ModifierFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late int _priceDeltaCents;
  late int _sortOrder;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.modifier?.name ?? '');
    _priceDeltaCents = widget.modifier?.priceDeltaCents ?? 0;
    _sortOrder = widget.modifier?.sortOrder ?? 0;
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      final repo = ref.read(menuRepositoryProvider);
      if (widget.modifier != null) {
        final updated = widget.modifier!.copyWith(
          name: _nameController.text.trim(),
          priceDeltaCents: _priceDeltaCents,
          modifierGroupId: widget.groupId,
          sortOrder: _sortOrder,
        );
        await repo.updateModifier(updated);
      } else {
        final newMod = ModifiersRow(
          modifierGroupId: widget.groupId,
          name: _nameController.text.trim(),
          priceDeltaCents: _priceDeltaCents,
          sortOrder: _sortOrder,
        );
        await repo.createModifier(newMod);
      }
      if (mounted) {
        ref.invalidate(modifiersForGroupProvider(widget.groupId));
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.modifier != null ? 'Edit Modifier' : 'New Modifier'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Name is required' : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: _priceDeltaCents.toString(),
                    decoration: const InputDecoration(
                      labelText: 'Price Delta (cents)',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (v) =>
                        _priceDeltaCents = int.tryParse(v) ?? _priceDeltaCents,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    initialValue: _sortOrder.toString(),
                    decoration: const InputDecoration(
                      labelText: 'Sort Order',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (v) =>
                        _sortOrder = int.tryParse(v) ?? _sortOrder,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Save')),
      ],
    );
  }
}

// ─── Bindings Tab ───

class _BindingsTab extends ConsumerStatefulWidget {
  const _BindingsTab();

  @override
  ConsumerState<_BindingsTab> createState() => _BindingsTabState();
}

class _BindingsTabState extends ConsumerState<_BindingsTab> {
  String? _selectedItemId;

  @override
  Widget build(BuildContext context) {
    final itemsAsync = ref.watch(categoriesWithItemsProvider);

    return AsyncValueWidget(
      value: itemsAsync,
      data: (categoriesWithItems) {
        final items = categoriesWithItems.expand((c) => c.items).toList();

        if (items.isEmpty) {
          return const Center(child: Text('No menu items available'));
        }

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12.0),
              child: DropdownButtonFormField<String>(
                initialValue: _selectedItemId,
                decoration: const InputDecoration(
                  labelText: 'Select Menu Item',
                  border: OutlineInputBorder(),
                ),
                isExpanded: true,
                hint: const Text('Choose a menu item...'),
                items: [
                  const DropdownMenuItem(
                    value: null,
                    child: Text('Choose a menu item...'),
                  ),
                  ...items.map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text(item.name),
                    ),
                  ),
                ],
                onChanged: (v) => setState(() => _selectedItemId = v),
              ),
            ),
            if (_selectedItemId != null)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: ModifierBindingsEditor(
                    menuItemId: _selectedItemId!,
                    onSaved: () {},
                  ),
                ),
              ),
            if (_selectedItemId == null)
              const Expanded(
                child: Center(
                  child: Text(
                    'Select a menu item to manage its modifier groups',
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
