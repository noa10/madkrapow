import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../features/menu/providers/menu_providers.dart';
import '../../../../features/menu/data/menu_repository.dart';
import '../../../../generated/database.dart';
import '../../data/promo_repository.dart';
import '../../providers/promo_providers.dart';

class PromoFormScreen extends ConsumerStatefulWidget {
  const PromoFormScreen({super.key, this.promo});

  final PromoCode? promo;

  @override
  ConsumerState<PromoFormScreen> createState() => _PromoFormScreenState();
}

class _PromoFormScreenState extends ConsumerState<PromoFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _codeController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _discountValueController;
  late final TextEditingController _minOrderAmountController;
  late final TextEditingController _maxDiscountController;
  late final TextEditingController _maxUsesController;
  late String _scope;
  late String _applicationType;
  late String _discountType;
  late bool _isActive;
  DateTime? _validFrom;
  DateTime? _validUntil;
  Set<String> _targetMenuItemIds = {};
  bool _showTargetItems = false;

  bool get _isEditing => widget.promo != null;
  bool get _showItemSelector => _scope == 'order' && _applicationType == 'auto';

  @override
  void initState() {
    super.initState();
    final promo = widget.promo;
    _codeController = TextEditingController(text: promo?.code ?? '');
    _descriptionController =
        TextEditingController(text: promo?.description ?? '');
    _scope = promo?.scope ?? 'order';
    _applicationType = promo?.applicationType ?? 'code';
    _discountType = promo?.discountType ?? 'percentage';
    _showTargetItems = _showItemSelector;

    if (promo != null) {
      if (promo.discountType == 'percentage') {
        _discountValueController =
            TextEditingController(text: promo.discountValue.toString());
      } else {
        _discountValueController = TextEditingController(
          text: (promo.discountValue / 100).toStringAsFixed(2),
        );
      }
    } else {
      _discountValueController = TextEditingController();
    }

    _minOrderAmountController = TextEditingController(
      text: promo?.minOrderAmountCents != null
          ? (promo!.minOrderAmountCents! / 100).toStringAsFixed(2)
          : '',
    );
    _maxDiscountController = TextEditingController(
      text: promo?.maxDiscountCents?.toString() ?? '',
    );
    _maxUsesController = TextEditingController(
      text: promo?.maxUses?.toString() ?? '',
    );
    _validFrom = promo?.validFrom;
    _validUntil = promo?.validUntil;
    _isActive = promo?.isActive ?? true;
  }

  Future<void> _loadExistingTargets() async {
    if (!_isEditing || widget.promo == null) return;
    final repo = ref.read(promoRepositoryProvider);
    final targets = await repo.fetchPromoTargetItems(widget.promo!.id);
    if (mounted) {
      setState(() {
        _targetMenuItemIds = targets.toSet();
      });
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_isEditing && _targetMenuItemIds.isEmpty) {
      _loadExistingTargets();
    }
  }

  @override
  void dispose() {
    _codeController.dispose();
    _descriptionController.dispose();
    _discountValueController.dispose();
    _minOrderAmountController.dispose();
    _maxDiscountController.dispose();
    _maxUsesController.dispose();
    super.dispose();
  }

  int? _parseDiscountValue() {
    final text = _discountValueController.text.trim();
    if (text.isEmpty) return null;
    final value = double.tryParse(text);
    if (value == null) return null;
    if (_discountType == 'percentage') {
      return value.toInt();
    } else {
      return (value * 100).round();
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final code = _codeController.text.trim().toUpperCase();
    final description = _descriptionController.text.trim().isEmpty
        ? null
        : _descriptionController.text.trim();
    final discountValue = _parseDiscountValue();
    if (discountValue == null) return;

    final minOrderText = _minOrderAmountController.text.trim();
    final int? minOrderAmountCents = minOrderText.isEmpty
        ? null
        : (double.tryParse(minOrderText)! * 100).round();

    final maxDiscountText = _maxDiscountController.text.trim();
    final int? maxDiscountCents = maxDiscountText.isEmpty
        ? null
        : int.tryParse(maxDiscountText);

    final maxUsesText = _maxUsesController.text.trim();
    final int? maxUses =
        maxUsesText.isEmpty ? null : int.tryParse(maxUsesText);

    if (_isEditing) {
      final notifier = ref.read(updatePromoProvider.notifier);
      await notifier.updatePromo(
        widget.promo!.id,
        code: code,
        description: description,
        scope: _scope,
        applicationType: _applicationType,
        discountType: _discountType,
        discountValue: discountValue,
        minOrderAmountCents: minOrderAmountCents,
        maxDiscountCents: maxDiscountCents,
        maxUses: maxUses,
        validFrom: _validFrom,
        validUntil: _validUntil,
        isActive: _isActive,
        targetMenuItemIds: _showItemSelector
            ? _targetMenuItemIds.toList()
            : null,
      );

      if (!mounted) return;
      final state = ref.read(updatePromoProvider);
      if (state.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update: ${state.error}'),
            backgroundColor: Colors.red,
          ),
        );
      } else {
        if (context.mounted) context.pop();
      }
    } else {
      final notifier = ref.read(createPromoProvider.notifier);
      await notifier.createPromo(
        code: code,
        description: description,
        scope: _scope,
        applicationType: _applicationType,
        discountType: _discountType,
        discountValue: discountValue,
        minOrderAmountCents: minOrderAmountCents,
        maxDiscountCents: maxDiscountCents,
        maxUses: maxUses,
        validFrom: _validFrom,
        validUntil: _validUntil,
        isActive: _isActive,
        targetMenuItemIds: _showItemSelector
            ? _targetMenuItemIds.toList()
            : null,
      );

      if (!mounted) return;
      final state = ref.read(createPromoProvider);
      if (state.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create: ${state.error}'),
            backgroundColor: Colors.red,
          ),
        );
      } else {
        if (context.mounted) context.pop();
      }
    }
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final initialDate = isFrom
        ? (_validFrom ?? DateTime.now())
        : (_validUntil ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() {
        if (isFrom) {
          _validFrom = picked;
        } else {
          _validUntil = picked;
        }
      });
    }
  }

  String _formatDate(DateTime? date) {
    if (date == null) return 'Not set';
    return DateFormat('yyyy-MM-dd').format(date);
  }

  Widget _buildTargetItemsSelector(List<CategoryWithItems> categories) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Target Menu Items',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            TextButton(
              onPressed: () {
                final allItemIds = categories
                    .expand((c) => c.items.whereType<MenuItemsRow>())
                    .map((i) => i.id)
                    .toSet();
                setState(() {
                  _targetMenuItemIds = allItemIds.cast<String>();
                });
              },
              child: const Text('Select all'),
            ),
            TextButton(
              onPressed: () {
                setState(() {
                  _targetMenuItemIds.clear();
                });
              },
              child: const Text('Clear'),
            ),
          ],
        ),
        const Text(
          'Select items this promo applies to',
          style: TextStyle(fontSize: 12, color: Colors.grey),
        ),
        const SizedBox(height: 8),
        for (final category in categories) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(
              category.category.name,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
                color: Colors.teal,
              ),
            ),
          ),
          ...category.items.map((item) {
            final isSelected = _targetMenuItemIds.contains(item.id);
            return CheckboxListTile(
              dense: true,
              contentPadding: const EdgeInsets.only(left: 8),
              title: Text(item.name),
              subtitle: Text(
                'RM ${(item.priceCents / 100).toStringAsFixed(2)}',
              ),
              value: isSelected,
              onChanged: (value) {
                setState(() {
                  if (value == true) {
                    _targetMenuItemIds.add(item.id);
                  } else {
                    _targetMenuItemIds.remove(item.id);
                  }
                });
              },
            );
          }),
        ],
        const SizedBox(height: 8),
        Text(
          '${_targetMenuItemIds.length} item(s) selected',
          style: const TextStyle(fontSize: 12, color: Colors.grey),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = _isEditing
        ? ref.watch(updatePromoProvider).isLoading
        : ref.watch(createPromoProvider).isLoading;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Promotion' : 'New Promotion'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _codeController,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Promo Code *',
                  prefixIcon: Icon(Icons.discount_outlined),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Promo code is required';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  prefixIcon: Icon(Icons.description_outlined),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _scope,
                decoration: const InputDecoration(
                  labelText: 'Scope *',
                  prefixIcon: Icon(Icons.shopping_bag_outlined),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'order',
                    child: Text('Whole Order Discount'),
                  ),
                  DropdownMenuItem(
                    value: 'delivery',
                    child: Text('Delivery Discount'),
                  ),
                ],
                onChanged: (value) {
                  if (value != null) {
                    setState(() {
                      _scope = value;
                      _showTargetItems = _showItemSelector;
                    });
                  }
                },
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _applicationType,
                decoration: const InputDecoration(
                  labelText: 'Application Type *',
                  prefixIcon: Icon(Icons.smart_button_outlined),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'code',
                    child: Text('Promo Code (customer enters)'),
                  ),
                  DropdownMenuItem(
                    value: 'auto',
                    child: Text('Auto-applied (automatic)'),
                  ),
                ],
                onChanged: (value) {
                  if (value != null) {
                    setState(() {
                      _applicationType = value;
                      _showTargetItems = _showItemSelector;
                    });
                  }
                },
              ),
              if (_showTargetItems) ...[
                const SizedBox(height: 16),
                ref.watch(categoriesWithItemsProvider).when(
                      data: (categories) =>
                          _buildTargetItemsSelector(categories),
                      loading: () => const Center(
                        child: Padding(
                          padding: EdgeInsets.all(32),
                          child: CircularProgressIndicator(),
                        ),
                      ),
                      error: (e, _) => Text('Error loading menu: $e'),
                    ),
              ],
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _discountType,
                decoration: const InputDecoration(
                  labelText: 'Discount Type *',
                  prefixIcon: Icon(Icons.percent),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'percentage',
                    child: Text('Percentage (%)'),
                  ),
                  DropdownMenuItem(
                    value: 'fixed',
                    child: Text('Fixed Amount (RM)'),
                  ),
                ],
                onChanged: (value) {
                  if (value != null) {
                    setState(() {
                      _discountType = value;
                      _discountValueController.clear();
                    });
                  }
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _discountValueController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: _discountType == 'percentage'
                      ? 'Discount Value * (%)'
                      : 'Discount Value * (RM)',
                  prefixIcon: const Icon(Icons.attach_money),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Discount value is required';
                  }
                  final parsed = double.tryParse(value.trim());
                  if (parsed == null || parsed < 0) {
                    return 'Enter a valid number';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _minOrderAmountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Min Order Amount (RM)',
                  prefixIcon: Icon(Icons.shopping_cart_outlined),
                ),
                validator: (value) {
                  if (value != null && value.trim().isNotEmpty) {
                    final parsed = double.tryParse(value.trim());
                    if (parsed == null || parsed < 0) {
                      return 'Enter a valid amount';
                    }
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _maxDiscountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Max Discount (cents)',
                  prefixIcon: Icon(Icons.money_off_outlined),
                  helperText:
                      'Maximum discount in cents (e.g., 5000 = RM50.00)',
                ),
                validator: (value) {
                  if (value != null && value.trim().isNotEmpty) {
                    final parsed = int.tryParse(value.trim());
                    if (parsed == null || parsed < 0) {
                      return 'Enter a valid number';
                    }
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _maxUsesController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Max Uses (blank = unlimited)',
                  prefixIcon: Icon(Icons.repeat),
                ),
                validator: (value) {
                  if (value != null && value.trim().isNotEmpty) {
                    final parsed = int.tryParse(value.trim());
                    if (parsed == null || parsed < 0) {
                      return 'Enter a valid number';
                    }
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Valid From'),
                subtitle: Text(_formatDate(_validFrom)),
                leading: const Icon(Icons.calendar_today),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _pickDate(isFrom: true),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Valid Until'),
                subtitle: Text(_formatDate(_validUntil)),
                leading: const Icon(Icons.calendar_today),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _pickDate(isFrom: false),
              ),
              if (_validFrom != null || _validUntil != null)
                TextButton(
                  onPressed: () {
                    setState(() {
                      _validFrom = null;
                      _validUntil = null;
                    });
                  },
                  child: const Text('Clear dates'),
                ),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                subtitle: Text(
                  _isActive ? 'Promotion is active' : 'Promotion is inactive',
                ),
                secondary: Icon(
                  _isActive ? Icons.toggle_on : Icons.toggle_off,
                  color: _isActive ? Colors.green : Colors.grey,
                ),
                value: _isActive,
                onChanged: (value) {
                  setState(() => _isActive = value);
                },
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: isLoading ? null : _submit,
                child: isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(_isEditing ? 'Update' : 'Create'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}