import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/widgets/async_value_widget.dart';
import '../../../../generated/tables/customer_addresses.dart';
import '../../data/profile_repository.dart';

class AddressManagementScreen extends ConsumerWidget {
  const AddressManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Saved Addresses')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddAddressDialog(context, ref),
        child: const Icon(Icons.add),
      ),
      body: AsyncValueWidget(
        value: profileAsync,
        data: (profile) {
          final addresses = profile.addresses;
          if (addresses.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.location_off_outlined,
                    size: 64,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.3),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No saved addresses',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tap + to add your first address',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withValues(alpha: 0.6),
                        ),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: addresses.length,
            itemBuilder: (context, index) {
              final address = addresses[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  leading: Icon(
                    address.isDefault
                        ? Icons.star
                        : Icons.location_on_outlined,
                    color: address.isDefault
                        ? Theme.of(context).colorScheme.primary
                        : null,
                  ),
                  title: Row(
                    children: [
                      Text(address.label ?? 'Address'),
                      if (address.isDefault) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Theme.of(context)
                                .colorScheme
                                .primary
                                .withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'Default',
                            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                  color: Theme.of(context).colorScheme.primary,
                                ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  subtitle: Text(
                    '${address.addressLine1}'
                    '${address.addressLine2 != null ? ', ${address.addressLine2}' : ''}'
                    ', ${address.city}, ${address.state} ${address.postalCode}',
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!address.isDefault)
                        IconButton(
                          icon: const Icon(Icons.star_border, size: 20),
                          onPressed: () async {
                            await ref
                                .read(profileRepositoryProvider)
                                .setDefaultAddress(
                                  profile.customer.id,
                                  address.id,
                                );
                            ref.invalidate(profileProvider);
                          },
                        ),
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 20),
                        onPressed: () => _showEditAddressDialog(context, ref, address),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        onPressed: () async {
                          final confirmed = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('Delete Address'),
                              content: const Text(
                                  'Are you sure you want to delete this address?'),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(ctx, false),
                                  child: const Text('Cancel'),
                                ),
                                FilledButton(
                                  onPressed: () => Navigator.pop(ctx, true),
                                  child: const Text('Delete'),
                                ),
                              ],
                            ),
                          );
                          if (confirmed == true) {
                            await ref
                                .read(profileRepositoryProvider)
                                .deleteAddress(address.id);
                            ref.invalidate(profileProvider);
                          }
                        },
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _showEditAddressDialog(BuildContext context, WidgetRef ref, CustomerAddressesRow address) {
    final labelController = TextEditingController(text: address.label ?? '');
    final address1Controller = TextEditingController(text: address.addressLine1);
    final address2Controller = TextEditingController(text: address.addressLine2 ?? '');
    final cityController = TextEditingController(text: address.city);
    final stateController = TextEditingController(text: address.state);
    final postalCodeController = TextEditingController(text: address.postalCode);
    final formKey = GlobalKey<FormState>();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Address'),
        content: SingleChildScrollView(
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: labelController,
                  decoration: const InputDecoration(
                    labelText: 'Label (e.g. Home, Office)',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: address1Controller,
                  decoration: const InputDecoration(labelText: 'Address Line 1'),
                  validator: (v) =>
                      v?.trim().isEmpty ?? true ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: address2Controller,
                  decoration: const InputDecoration(labelText: 'Address Line 2'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: postalCodeController,
                        decoration: const InputDecoration(labelText: 'Postal Code'),
                        validator: (v) =>
                            v?.trim().isEmpty ?? true ? 'Required' : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: cityController,
                        decoration: const InputDecoration(labelText: 'City'),
                        validator: (v) =>
                            v?.trim().isEmpty ?? true ? 'Required' : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: stateController,
                  decoration: const InputDecoration(labelText: 'State'),
                  validator: (v) =>
                      v?.trim().isEmpty ?? true ? 'Required' : null,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;

              await ref.read(profileRepositoryProvider).updateAddress(
                address.id,
                {
                  'label': labelController.text.trim().isNotEmpty
                      ? labelController.text.trim()
                      : null,
                  'address_line1': address1Controller.text.trim(),
                  'address_line2': address2Controller.text.trim().isNotEmpty
                      ? address2Controller.text.trim()
                      : null,
                  'city': cityController.text.trim(),
                  'state': stateController.text.trim(),
                  'postal_code': postalCodeController.text.trim(),
                },
              );

              ref.invalidate(profileProvider);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showAddAddressDialog(BuildContext context, WidgetRef ref) {
    final labelController = TextEditingController();
    final address1Controller = TextEditingController();
    final address2Controller = TextEditingController();
    final cityController = TextEditingController(text: 'Shah Alam');
    final stateController = TextEditingController(text: 'Selangor');
    final postalCodeController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Address'),
        content: SingleChildScrollView(
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: labelController,
                  decoration: const InputDecoration(
                    labelText: 'Label (e.g. Home, Office)',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: address1Controller,
                  decoration: const InputDecoration(labelText: 'Address Line 1'),
                  validator: (v) =>
                      v?.trim().isEmpty ?? true ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: address2Controller,
                  decoration: const InputDecoration(labelText: 'Address Line 2'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: postalCodeController,
                        decoration: const InputDecoration(labelText: 'Postal Code'),
                        validator: (v) =>
                            v?.trim().isEmpty ?? true ? 'Required' : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: cityController,
                        decoration: const InputDecoration(labelText: 'City'),
                        validator: (v) =>
                            v?.trim().isEmpty ?? true ? 'Required' : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: stateController,
                  decoration: const InputDecoration(labelText: 'State'),
                  validator: (v) =>
                      v?.trim().isEmpty ?? true ? 'Required' : null,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              if (!formKey.currentState!.validate()) return;
              final profile = ref.read(profileProvider).value;
              if (profile == null) return;

              await ref.read(profileRepositoryProvider).addAddress({
                'customer_id': profile.customer.id,
                'label': labelController.text.trim().isNotEmpty
                    ? labelController.text.trim()
                    : null,
                'address_line1': address1Controller.text.trim(),
                'address_line2': address2Controller.text.trim().isNotEmpty
                    ? address2Controller.text.trim()
                    : null,
                'city': cityController.text.trim(),
                'state': stateController.text.trim(),
                'postal_code': postalCodeController.text.trim(),
                'country': 'Malaysia',
                'is_default': profile.addresses.isEmpty,
              });

              ref.invalidate(profileProvider);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}
