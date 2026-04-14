import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../../../core/utils/auth_exceptions.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../cart/providers/cart_provider.dart';
import '../../data/checkout_models.dart';
import '../../providers/checkout_providers.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _postalCodeController = TextEditingController();
  final _cityController = TextEditingController(text: 'Shah Alam');
  final _stateController = TextEditingController(text: 'Selangor');
  bool _isLoading = false;
  String? _errorText;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _postalCodeController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    super.dispose();
  }

  Future<void> _fetchDeliveryQuote() async {
    final checkout = ref.read(checkoutProvider);
    if (checkout.deliveryType != DeliveryType.delivery) return;
    if (_addressController.text.trim().isEmpty) return;

    try {
      await ref
          .read(checkoutProvider.notifier)
          .fetchDeliveryQuote(
            DeliveryAddress(
              fullName: _nameController.text.trim(),
              phone: _phoneController.text.trim(),
              address: _addressController.text.trim(),
              postalCode: _postalCodeController.text.trim(),
              city: _cityController.text.trim(),
              state: _stateController.text.trim(),
            ),
          );
    } on AuthRequiredException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            duration: const Duration(seconds: 4),
          ),
        );
        context.go(
          '${AppRoutes.signIn}?from=${Uri.encodeComponent(AppRoutes.checkout)}',
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Could not calculate delivery fee: ${e.toString().replaceAll('Exception: ', '')}',
            ),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  Future<void> _handleCheckout() async {
    if (!_validateForm()) return;

    setState(() {
      _isLoading = true;
      _errorText = null;
    });

    try {
      final cart = ref.read(cartProvider);
      final checkout = ref.read(checkoutProvider);
      final repo = ref.read(checkoutRepositoryProvider);

      // Build checkout items from cart
      final checkoutItems = cart.map(
        (item) => CheckoutItem(
          id: item.menuItemId,
          name: item.name,
          price: item.unitPrice,
          quantity: item.quantity,
          image: item.imageUrl,
          modifiers: item.selectedModifiers
              .map(
                (m) => CheckoutModifier(
                  id: m.id,
                  name: m.name,
                  priceDeltaCents: m.priceDeltaCents,
                ),
              )
              .toList(),
        ),
      );

      final deliveryFee = checkout.deliveryQuote?.feeCents ?? 0;

      final request = CheckoutRequest(
        items: checkoutItems.toList(),
        deliveryAddress: DeliveryAddress(
          fullName: _nameController.text.trim(),
          phone: _phoneController.text.trim(),
          address: checkout.deliveryType == DeliveryType.delivery
              ? _addressController.text.trim()
              : null,
          postalCode: checkout.deliveryType == DeliveryType.delivery
              ? _postalCodeController.text.trim()
              : null,
          city: checkout.deliveryType == DeliveryType.delivery
              ? _cityController.text.trim()
              : null,
          state: checkout.deliveryType == DeliveryType.delivery
              ? _stateController.text.trim()
              : null,
        ),
        deliveryFee: deliveryFee,
        deliveryType: checkout.deliveryType,
        fulfillmentType: checkout.fulfillmentType,
        quotationId: checkout.quotationId,
        serviceType: checkout.serviceType,
        stopIds: checkout.stopIds,
        priceBreakdown: checkout.priceBreakdown,
      );

      final result = await repo.createCheckout(request);

      // Navigate to Stripe WebView
      if (mounted) {
        context.go(
          '${AppRoutes.stripeCheckout}?checkout_url=${Uri.encodeComponent(result.checkoutUrl)}',
        );
      }
    } on AuthRequiredException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            duration: const Duration(seconds: 4),
          ),
        );
        context.go(
          '${AppRoutes.signIn}?from=${Uri.encodeComponent(AppRoutes.checkout)}',
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _errorText = e.toString().replaceAll('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  bool _validateForm() {
    final checkout = ref.read(checkoutProvider);
    if (_nameController.text.trim().isEmpty) {
      setState(() => _errorText = 'Name is required');
      return false;
    }
    if (_phoneController.text.trim().isEmpty) {
      setState(() => _errorText = 'Phone number is required');
      return false;
    }
    if (checkout.deliveryType == DeliveryType.delivery) {
      if (_addressController.text.trim().isEmpty) {
        setState(() => _errorText = 'Delivery address is required');
        return false;
      }
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final checkout = ref.watch(checkoutProvider);
    final cart = ref.watch(cartProvider);
    final subtotal = ref.read(cartProvider.notifier).subtotalCents;
    final deliveryFee = checkout.deliveryQuote?.feeCents ?? 0;
    final total = subtotal + deliveryFee;

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Delivery type selector
            _SectionTitle('Delivery Method'),
            const SizedBox(height: 8),
            _DeliveryTypeSelector(
              selected: checkout.deliveryType,
              onChanged: (type) {
                ref.read(checkoutProvider.notifier).setDeliveryType(type);
                if (type == DeliveryType.delivery) {
                  _fetchDeliveryQuote();
                }
              },
            ),
            const SizedBox(height: 24),

            // Contact info (always shown)
            _SectionTitle('Contact Info'),
            const SizedBox(height: 8),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Full Name',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone Number',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
            ),
            const SizedBox(height: 24),

            // Delivery address (only for delivery)
            if (checkout.deliveryType == DeliveryType.delivery) ...[
              _SectionTitle('Delivery Address'),
              const SizedBox(height: 8),
              TextField(
                controller: _addressController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Address',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _postalCodeController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Postal Code',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _cityController,
                      decoration: const InputDecoration(labelText: 'City'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _stateController,
                decoration: const InputDecoration(labelText: 'State'),
              ),
              const SizedBox(height: 12),
              // Get delivery quote button
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _fetchDeliveryQuote,
                  icon: const Icon(Icons.local_shipping_outlined, size: 18),
                  label: const Text('Calculate Delivery Fee'),
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Fulfillment type
            _SectionTitle('Fulfillment'),
            const SizedBox(height: 8),
            _FulfillmentSelector(
              selected: checkout.fulfillmentType,
              onChanged: (type) =>
                  ref.read(checkoutProvider.notifier).setFulfillmentType(type),
            ),
            const SizedBox(height: 24),

            // Order summary
            _SectionTitle('Order Summary'),
            const SizedBox(height: 8),
            ...cart.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${item.quantity}x ${item.name}',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                    Text(
                      formatPrice(item.lineTotalCents),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ),
            const Divider(height: 24),
            Row(
              children: [
                const Expanded(child: Text('Subtotal')),
                Text(formatPrice(subtotal)),
              ],
            ),
            if (checkout.deliveryType == DeliveryType.delivery) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  const Expanded(child: Text('Delivery Fee')),
                  Text(
                    deliveryFee > 0
                        ? formatPrice(deliveryFee)
                        : 'Calculating...',
                  ),
                ],
              ),
            ],
            const Divider(height: 24),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Total',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Text(
                  formatPrice(total),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),

            // Error text
            if (_errorText != null) ...[
              const SizedBox(height: 12),
              Text(
                _errorText!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontSize: 13,
                ),
              ),
            ],

            const SizedBox(height: 32),

            // Pay button
            FilledButton(
              onPressed: _isLoading ? null : _handleCheckout,
              style: FilledButton.styleFrom(
                minimumSize: const Size(double.infinity, 52),
              ),
              child: _isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text('Pay ${formatPrice(total)}'),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: Theme.of(
        context,
      ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
    );
  }
}

class _DeliveryTypeSelector extends StatelessWidget {
  const _DeliveryTypeSelector({
    required this.selected,
    required this.onChanged,
  });

  final DeliveryType selected;
  final ValueChanged<DeliveryType> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<DeliveryType>(
      segments: const [
        ButtonSegment(
          value: DeliveryType.delivery,
          label: Text('Delivery'),
          icon: Icon(Icons.delivery_dining),
        ),
        ButtonSegment(
          value: DeliveryType.selfPickup,
          label: Text('Self Pickup'),
          icon: Icon(Icons.store),
        ),
      ],
      selected: {selected},
      onSelectionChanged: (set) => onChanged(set.first),
    );
  }
}

class _FulfillmentSelector extends StatelessWidget {
  const _FulfillmentSelector({required this.selected, required this.onChanged});

  final FulfillmentType selected;
  final ValueChanged<FulfillmentType> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<FulfillmentType>(
      segments: const [
        ButtonSegment(
          value: FulfillmentType.asap,
          label: Text('ASAP'),
          icon: Icon(Icons.bolt),
        ),
        ButtonSegment(
          value: FulfillmentType.scheduled,
          label: Text('Scheduled'),
          icon: Icon(Icons.schedule),
        ),
      ],
      selected: {selected},
      onSelectionChanged: (set) => onChanged(set.first),
    );
  }
}
