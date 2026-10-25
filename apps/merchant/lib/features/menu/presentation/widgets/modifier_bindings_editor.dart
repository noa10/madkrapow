import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../../../../core/widgets/async_value_widget.dart';
import '../../../../../generated/database.dart';
import '../../providers/menu_providers.dart';

/// Reusable widget for editing modifier group bindings for a menu item.
/// Used both in the dedicated Bindings tab and inline in the item form.
class ModifierBindingsEditor extends ConsumerStatefulWidget {
  const ModifierBindingsEditor({
    super.key,
    required this.menuItemId,
    required this.onSaved,
    this.readOnly = false,
  });

  final String menuItemId;
  final VoidCallback onSaved;
  final bool readOnly;

  @override
  ConsumerState<ModifierBindingsEditor> createState() =>
      _ModifierBindingsEditorState();
}

class _BindingState {
  bool bound;
  bool required;

  _BindingState({this.bound = false, this.required = false});
}

class _ModifierBindingsEditorState
    extends ConsumerState<ModifierBindingsEditor> {
  Map<String, _BindingState> _bindings = {};
  bool _isSaving = false;
  bool _hasLoaded = false;

  @override
  Widget build(BuildContext context) {
    final groupsAsync = ref.watch(modifierGroupsProvider);
    final existingBindingsAsync = ref.watch(
      modifierBindingsForItemProvider(widget.menuItemId),
    );

    return AsyncValueWidget(
      value: groupsAsync,
      data: (groups) {
        if (groups.isEmpty) {
          return const _EmptyGroupsMessage();
        }

        return AsyncValueWidget(
          value: existingBindingsAsync,
          data: (existingBindings) {
            if (!_hasLoaded) {
              _bindings = _buildBindingsMap(groups, existingBindings);
              _hasLoaded = true;
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ...groups.map((group) => _buildGroupTile(group)),
                const SizedBox(height: 16),
                if (!widget.readOnly)
                  FilledButton.icon(
                    onPressed: _isSaving ? null : _save,
                    icon: _isSaving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.save),
                    label: Text(_isSaving ? 'Saving...' : 'Save Bindings'),
                  ),
              ],
            );
          },
        );
      },
    );
  }

  Map<String, _BindingState> _buildBindingsMap(
    List<ModifierGroupsRow> groups,
    List<MenuItemModifierGroupsRow> existing,
  ) {
    final map = <String, _BindingState>{};
    for (final group in groups) {
      final match = existing.firstWhere(
        (b) => b.modifierGroupId == group.id,
        orElse: () => MenuItemModifierGroupsRow(
          menuItemId: widget.menuItemId,
          modifierGroupId: group.id,
        ),
      );
      map[group.id] = _BindingState(
        bound: existing.any((b) => b.modifierGroupId == group.id),
        required: match.isRequired,
      );
    }
    return map;
  }

  Widget _buildGroupTile(ModifierGroupsRow group) {
    final binding = _bindings[group.id] ?? _BindingState();
    final isRadio = group.maxSelections == 1;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: binding.bound
          ? Theme.of(
              context,
            ).colorScheme.primaryContainer.withValues(alpha: 0.3)
          : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (!widget.readOnly)
                  Checkbox(
                    value: binding.bound,
                    onChanged: (v) {
                      if (v == null) return;
                      setState(() {
                        _bindings[group.id] = _BindingState(
                          bound: v,
                          required: v ? binding.required : false,
                        );
                      });
                    },
                  )
                else
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Icon(
                      binding.bound
                          ? Icons.check_box
                          : Icons.check_box_outline_blank,
                      color: binding.bound
                          ? Theme.of(context).colorScheme.primary
                          : AppColors.muted,
                    ),
                  ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      if (group.description != null &&
                          group.description!.isNotEmpty)
                        Text(
                          group.description!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.muted,
                          ),
                        ),
                    ],
                  ),
                ),
                _TypeBadge(isRadio: isRadio),
                if (binding.bound && binding.required) const _RequiredBadge(),
              ],
            ),
            if (binding.bound && !widget.readOnly)
              Padding(
                padding: const EdgeInsets.only(left: 48, top: 4),
                child: Row(
                  children: [
                    ChoiceChip(
                      label: const Text('Optional'),
                      selected: !binding.required,
                      onSelected: (v) {
                        if (v) {
                          setState(() {
                            _bindings[group.id] = _BindingState(
                              bound: true,
                              required: false,
                            );
                          });
                        }
                      },
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Required'),
                      selected: binding.required,
                      onSelected: (v) {
                        if (v) {
                          setState(() {
                            _bindings[group.id] = _BindingState(
                              bound: true,
                              required: true,
                            );
                          });
                        }
                      },
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _isSaving = true);

    try {
      final repo = ref.read(menuRepositoryProvider);
      final bindingsToSave = _bindings.entries
          .where((e) => e.value.bound)
          .map(
            (e) => {
              'modifier_group_id': e.key,
              'is_required': e.value.required,
            },
          )
          .toList();

      await repo.batchUpdateModifierBindings(
        menuItemId: widget.menuItemId,
        bindings: bindingsToSave,
      );

      if (mounted) {
        ref.invalidate(modifierBindingsForItemProvider(widget.menuItemId));
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Bindings saved')));
        widget.onSaved();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save bindings: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }
}

class _EmptyGroupsMessage extends StatelessWidget {
  const _EmptyGroupsMessage();

  @override
  Widget build(BuildContext context) {
    return const AppEmptyState(
      icon: Icons.extension_off,
      title: 'No modifier groups available',
      message: 'Create modifier groups first to bind them to items',
    );
  }
}

class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.isRadio});

  final bool isRadio;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: isRadio ? AppColors.infoSoft : AppColors.successSoft,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        isRadio ? 'Radio' : 'Checkbox',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: isRadio ? AppColors.info : AppColors.herbText,
        ),
      ),
    );
  }
}

class _RequiredBadge extends StatelessWidget {
  const _RequiredBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.sesameSoft,
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Text(
        'Required',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.sesame,
        ),
      ),
    );
  }
}
