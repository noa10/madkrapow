import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../config/routes.dart';
import '../../../../core/providers/supabase_provider.dart';
import '../../../../core/utils/auth_exceptions.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../generated/tables/customer_addresses.dart';
import '../../../../generated/tables/customer_contacts.dart';
import '../../../profile/data/profile_repository.dart';
import '../../../cart/providers/cart_provider.dart';
import '../../../menu/providers/promo_preview_provider.dart';
import '../../data/checkout_models.dart';
import '../../providers/checkout_providers.dart';
import '../widgets/promo_code_input.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  // Manual contact form controllers
  final _manualNameController = TextEditingController();
  final _manualPhoneController = TextEditingController();

  // Manual address form controllers
  final _manualAddressLine1Controller = TextEditingController();
  final _manualAddressLine2Controller = TextEditingController();
  final _manualPostalCodeController = TextEditingController();
  final _manualCityController = TextEditingController(text: 'Shah Alam');
  final _manualStateController = TextEditingController(text: 'Selangor');

  bool _isLoading = false;
  String? _errorText;
  bool _saveContactToProfile = false;
  bool _saveAddressToProfile = false;
  bool _isResendingVerification = false;
  bool _verificationResent = false;

  Timer? _quoteDebounce;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    // Delay initialization to let providers settle
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeFromProfile();
    });
  }

  void _initializeFromProfile() {
    if (_initialized) return;
    final profile = ref.read(profileProvider).value;
    if (profile == null) return;

    _initialized = true;

    // Initialize contact
    final defaultContact = profile.contacts.isNotEmpty
        ? profile.contacts.firstWhere(
            (c) => c.isDefault,
            orElse: () => profile.contacts.first,
          )
        : null;
    ref
        .read(checkoutProvider.notifier)
        .initializeContact(
          defaultContact,
          profile.customer.name,
          profile.customer.phone,
        );

    // Initialize address
    final defaultAddress = profile.addresses.isNotEmpty
        ? profile.addresses.firstWhere(
            (a) => a.isDefault,
            orElse: () => profile.addresses.first,
          )
        : null;
    ref.read(checkoutProvider.notifier).initializeAddress(defaultAddress);

    // Pre-fill manual form controllers
    if (defaultContact != null) {
      _manualNameController.text = defaultContact.name;
      _manualPhoneController.text = defaultContact.phone;
    } else {
      _manualNameController.text = profile.customer.name ?? '';
      _manualPhoneController.text = profile.customer.phone ?? '';
    }

    if (defaultAddress != null) {
      _manualAddressLine1Controller.text = defaultAddress.addressLine1;
      _manualAddressLine2Controller.text = defaultAddress.addressLine2 ?? '';
      _manualPostalCodeController.text = defaultAddress.postalCode;
      _manualCityController.text = defaultAddress.city;
      _manualStateController.text = defaultAddress.state;
    }

    // Fetch auto-promos after initialization
    final subtotal = ref.read(cartProvider.notifier).subtotalCents;
    _fetchAutoPromos(subtotalCents: subtotal, deliveryFeeCents: 0);

    // Refresh menu-level promo discounts for cart items
    _refreshPromoDiscounts();
  }

  @override
  void dispose() {
    _quoteDebounce?.cancel();
    _manualNameController.dispose();
    _manualPhoneController.dispose();
    _manualAddressLine1Controller.dispose();
    _manualAddressLine2Controller.dispose();
    _manualPostalCodeController.dispose();
    _manualCityController.dispose();
    _manualStateController.dispose();
    super.dispose();
  }

  Future<void> _fetchDeliveryQuote() async {
    final checkout = ref.read(checkoutProvider);
    final address = checkout.deliveryAddress;
    if (address == null) return;
    if (checkout.deliveryType != DeliveryType.delivery) return;

    try {
      await ref.read(checkoutProvider.notifier).fetchDeliveryQuote(address);
    } on AuthRequiredException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), duration: const Duration(seconds: 4)),
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

  Future<void> _fetchAutoPromos({required int subtotalCents, required int deliveryFeeCents}) async {
    if (subtotalCents <= 0) return;
    try {
      await ref.read(checkoutProvider.notifier).fetchAndApplyAutoPromos(
        subtotalCents: subtotalCents,
        deliveryFeeCents: deliveryFeeCents,
      );
    } catch (e) {
      // Silently fail — auto-promos are non-critical
    }
  }

  void _refreshPromoDiscounts() {
    // Refresh menu-level promo discounts for cart items (fire-and-forget)
    refreshCartPromoDiscounts(ref);
  }

  Future<void> _handlePromoApply(String code, int subtotalCents, int deliveryFeeCents) async {
    await ref.read(checkoutProvider.notifier).validateAndApplyPromo(
      code: code,
      subtotalCents: subtotalCents,
      deliveryFeeCents: deliveryFeeCents,
    );
  }

  void _handleRemovePromo(String code) {
    ref.read(checkoutProvider.notifier).removePromo(code);
  }

  void _onManualAddressChanged() {
    _quoteDebounce?.cancel();
    _quoteDebounce = Timer(const Duration(milliseconds: 800), () {
      final checkout = ref.read(checkoutProvider);
      if (checkout.useManualAddress && checkout.deliveryType == DeliveryType.delivery) {
        final address = DeliveryAddress(
          addressLine1: _manualAddressLine1Controller.text.trim(),
          addressLine2: _manualAddressLine2Controller.text.trim().isEmpty
              ? null
              : _manualAddressLine2Controller.text.trim(),
          postalCode: _manualPostalCodeController.text.trim(),
          city: _manualCityController.text.trim(),
          state: _manualStateController.text.trim(),
        );
        ref.read(checkoutProvider.notifier).setDeliveryAddress(address);
        _fetchDeliveryQuote();
      }
    });
  }

  Future<void> _handleCheckout() async {
    if (!_validateForm()) return;

    setState(() {
      _isLoading = true;
      _errorText = null;
    });

    try {
      final checkout = ref.read(checkoutProvider);
      final profile = ref.read(profileProvider).value;
      final cart = ref.read(cartProvider);
      final repo = ref.read(checkoutRepositoryProvider);

      // If saving manual contact to profile
      if (checkout.useManualContact && _saveContactToProfile && profile != null) {
        await ref.read(profileRepositoryProvider).addContact({
          'customer_id': profile.customer.id,
          'name': _manualNameController.text.trim(),
          'phone': _manualPhoneController.text.trim(),
          'is_default': profile.contacts.isEmpty,
        });
        ref.invalidate(profileProvider);
      }

      // If saving manual address to profile
      if (checkout.useManualAddress && _saveAddressToProfile && profile != null) {
        await ref.read(profileRepositoryProvider).addAddress({
          'customer_id': profile.customer.id,
          'label': null,
          'address_line1': _manualAddressLine1Controller.text.trim(),
          'address_line2': _manualAddressLine2Controller.text.trim().isEmpty
              ? null
              : _manualAddressLine2Controller.text.trim(),
          'city': _manualCityController.text.trim(),
          'state': _manualStateController.text.trim(),
          'postal_code': _manualPostalCodeController.text.trim(),
          'country': 'Malaysia',
          'is_default': profile.addresses.isEmpty,
        });
        ref.invalidate(profileProvider);
      }

      // Build delivery address for checkout
      final contactInfo = checkout.contactInfo ??
          DeliveryAddress(
            fullName: _manualNameController.text.trim(),
            phone: _manualPhoneController.text.trim(),
          );

      final deliveryAddress = checkout.deliveryType == DeliveryType.delivery
          ? DeliveryAddress(
              fullName: contactInfo.fullName,
              phone: contactInfo.phone,
              address: checkout.deliveryAddress?.address,
              addressLine1: checkout.deliveryAddress?.addressLine1 ?? _manualAddressLine1Controller.text.trim(),
              addressLine2: checkout.deliveryAddress?.addressLine2 ?? (_manualAddressLine2Controller.text.trim().isEmpty
                  ? null
                  : _manualAddressLine2Controller.text.trim()),
              postalCode: checkout.deliveryAddress?.postalCode ?? _manualPostalCodeController.text.trim(),
              city: checkout.deliveryAddress?.city ?? _manualCityController.text.trim(),
              state: checkout.deliveryAddress?.state ?? _manualStateController.text.trim(),
              latitude: checkout.deliveryAddress?.latitude,
              longitude: checkout.deliveryAddress?.longitude,
            )
          : null;

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
        deliveryAddress: deliveryAddress ?? contactInfo,
        deliveryFee: deliveryFee,
        deliveryType: checkout.deliveryType,
        fulfillmentType: checkout.fulfillmentType,
        quotationId: checkout.quotationId,
        serviceType: checkout.serviceType,
        stopIds: checkout.stopIds,
        priceBreakdown: checkout.priceBreakdown,
        appliedPromos: checkout.appliedPromos,
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
          SnackBar(content: Text(e.message), duration: const Duration(seconds: 4)),
        );
        context.go(
          '${AppRoutes.signIn}?from=${Uri.encodeComponent(AppRoutes.checkout)}',
        );
      }
    } catch (e) {
      final msg = e.toString().replaceAll('Exception: ', '');
      if (mounted && msg.contains('EMAIL_NOT_VERIFIED')) {
        setState(() => _errorText = 'Please verify your email to continue with checkout.');
      } else if (mounted) {
        setState(() => _errorText = msg);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  bool _validateForm() {
    final checkout = ref.read(checkoutProvider);
    if (checkout.useManualContact) {
      if (_manualNameController.text.trim().isEmpty) {
        setState(() => _errorText = 'Name is required');
        return false;
      }
      if (_manualPhoneController.text.trim().isEmpty) {
        setState(() => _errorText = 'Phone number is required');
        return false;
      }
    }
    if (checkout.deliveryType == DeliveryType.delivery) {
      if (checkout.useManualAddress) {
        if (_manualAddressLine1Controller.text.trim().isEmpty) {
          setState(() => _errorText = 'Delivery address is required');
          return false;
        }
      } else if (checkout.selectedAddressId == null) {
        setState(() => _errorText = 'Please select or enter a delivery address');
        return false;
      }
    }
    return true;
  }

  Future<void> _handleResendVerification() async {
    final user = ref.read(currentUserProvider);
    if (user == null || user.email == null) return;

    setState(() {
      _isResendingVerification = true;
      _verificationResent = false;
    });

    try {
      await Supabase.instance.client.auth.resend(
        type: OtpType.signup,
        email: user.email!,
        emailRedirectTo: 'madkrapow://${AppRoutes.authCallback}',
      );
      if (mounted) setState(() => _verificationResent = true);
    } on AuthException catch (e) {
      if (mounted) {
        setState(() => _errorText = e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _errorText = 'Failed to resend verification email.');
      }
    } finally {
      if (mounted) setState(() => _isResendingVerification = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isVerified = ref.watch(isEmailVerifiedProvider);
    final user = ref.watch(currentUserProvider);

    // Defense-in-depth: if user is authenticated but unverified, show prompt
    if (user != null && !isVerified) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.mark_email_read_outlined,
                    size: 64,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Verify your email to checkout',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'We sent a verification link to ${user.email ?? 'your email'}. '
                    'Please check your inbox and confirm your email address.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 24),
                  if (_verificationResent) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.green.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.check_circle, color: Colors.green[700], size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Verification email sent!',
                            style: TextStyle(color: Colors.green[700]),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_errorText != null) ...[
                    Text(_errorText!, style: const TextStyle(color: Colors.red)),
                    const SizedBox(height: 16),
                  ],
                  FilledButton.icon(
                    onPressed: _isResendingVerification ? null : _handleResendVerification,
                    icon: _isResendingVerification
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh),
                    label: const Text('Resend verification email'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () {
                      // Re-check verification status
                      ref.invalidate(authStateProvider);
                    },
                    child: const Text('I\'ve verified my email'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => context.go(AppRoutes.cart),
                    child: const Text('Back to Cart'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final checkout = ref.watch(checkoutProvider);
    final profileAsync = ref.watch(profileProvider);
    final cart = ref.watch(cartProvider);
    final subtotal = ref.read(cartProvider.notifier).subtotalCents;
    final deliveryFee = checkout.deliveryQuote?.feeCents ?? 0;
    final discountTotal = checkout.discountTotalCents;
    final total = subtotal + deliveryFee - discountTotal;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go(AppRoutes.home),
        ),
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load profile: $e')),
        data: (profile) => SingleChildScrollView(
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
                  if (type == DeliveryType.delivery && checkout.deliveryAddress != null) {
                    _fetchDeliveryQuote();
                  }
                },
              ),
              const SizedBox(height: 24),

              // Contact Info Section
              _SectionTitle('Contact Info'),
              const SizedBox(height: 8),
              _ContactSection(
                profile: profile,
                checkout: checkout,
                nameController: _manualNameController,
                phoneController: _manualPhoneController,
                saveToProfile: _saveContactToProfile,
                onToggleSave: (v) => setState(() => _saveContactToProfile = v),
                onContactSelected: (contact) {
                  ref.read(checkoutProvider.notifier).selectContact(contact?.id);
                  ref.read(checkoutProvider.notifier).setContactInfo(
                        DeliveryAddress.fromCustomerContact(contact!),
                      );
                },
                onToggleManual: (v) {
                  ref.read(checkoutProvider.notifier).toggleManualContact(v);
                  if (v && profile.customer.name != null) {
                    _manualNameController.text = profile.customer.name!;
                  }
                  if (v && profile.customer.phone != null) {
                    _manualPhoneController.text = profile.customer.phone!;
                  }
                },
                onAddressChanged: null,
              ),
              const SizedBox(height: 24),

              // Delivery Address Section (Delivery only)
              if (checkout.deliveryType == DeliveryType.delivery) ...[
                _SectionTitle('Delivery Address'),
                const SizedBox(height: 8),
                _AddressSection(
                  profile: profile,
                  checkout: checkout,
                  addressLine1Controller: _manualAddressLine1Controller,
                  addressLine2Controller: _manualAddressLine2Controller,
                  postalCodeController: _manualPostalCodeController,
                  cityController: _manualCityController,
                  stateController: _manualStateController,
                  saveToProfile: _saveAddressToProfile,
                  onToggleSave: (v) => setState(() => _saveAddressToProfile = v),
                  onAddressSelected: (address) {
                    ref.read(checkoutProvider.notifier).selectAddress(
                          address?.id,
                          address: address,
                        );
                    _fetchDeliveryQuote();
                  },
                  onToggleManual: (v) {
                    ref.read(checkoutProvider.notifier).toggleManualAddress(v);
                    if (!v && profile.addresses.isNotEmpty) {
                      final defaultAddr = profile.addresses.firstWhere(
                        (a) => a.isDefault,
                        orElse: () => profile.addresses.first,
                      );
                      ref.read(checkoutProvider.notifier).selectAddress(
                            defaultAddr.id,
                            address: defaultAddr,
                          );
                      _fetchDeliveryQuote();
                    }
                  },
                  onAddressChanged: _onManualAddressChanged,
                ),
                const SizedBox(height: 12),
                // Manual quote button
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: checkout.useManualAddress ? _fetchDeliveryQuote : null,
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

              // Promo code section
              _SectionTitle('Promo Code'),
              const SizedBox(height: 8),
              PromoCodeInput(
                subtotalCents: subtotal,
                deliveryFeeCents: deliveryFee,
                appliedPromos: checkout.appliedPromos,
                onApply: _handlePromoApply,
                onRemove: _handleRemovePromo,
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
                      if (item.discountPerUnitCents > 0) ...[
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              formatPrice(item.lineTotalCents),
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Theme.of(context).colorScheme.primary,
                              ),
                            ),
                            Text(
                              formatPrice(item.originalLineTotalCents),
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                          ],
                        ),
                      ] else
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
              if (ref.read(cartProvider.notifier).originalSubtotalCents > subtotal) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Expanded(child: Text('Menu Promo Savings')),
                    Text(
                      '-${formatPrice(ref.read(cartProvider.notifier).originalSubtotalCents - subtotal)}',
                      style: TextStyle(color: Theme.of(context).colorScheme.primary),
                    ),
                  ],
                ),
              ],
              if (checkout.deliveryType == DeliveryType.delivery) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Expanded(child: Text('Delivery Fee')),
                    Text(
                      deliveryFee > 0
                          ? formatPrice(deliveryFee)
                          : checkout.deliveryQuote != null
                              ? formatPrice(deliveryFee)
                              : 'Calculating...',
                    ),
                  ],
                ),
              ],
              if (discountTotal > 0) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Expanded(child: Text('Promo Discount')),
                    Text(
                      '-${formatPrice(discountTotal)}',
                      style: TextStyle(color: Theme.of(context).colorScheme.primary),
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
      ),
    );
  }
}

// ── Contact Section Widget ──────────────────────────────────────────────

class _ContactSection extends StatefulWidget {
  const _ContactSection({
    required this.profile,
    required this.checkout,
    required this.nameController,
    required this.phoneController,
    required this.saveToProfile,
    required this.onToggleSave,
    required this.onContactSelected,
    required this.onToggleManual,
    required this.onAddressChanged,
  });

  final CustomerProfile profile;
  final CheckoutState checkout;
  final TextEditingController nameController;
  final TextEditingController phoneController;
  final bool saveToProfile;
  final ValueChanged<bool> onToggleSave;
  final void Function(CustomerContactsRow?) onContactSelected;
  final ValueChanged<bool> onToggleManual;
  final VoidCallback? onAddressChanged;

  @override
  State<_ContactSection> createState() => _ContactSectionState();
}

class _ContactSectionState extends State<_ContactSection> {
  @override
  Widget build(BuildContext context) {
    final contacts = widget.profile.contacts;
    final isManual = widget.checkout.useManualContact;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Saved contacts list
        if (contacts.isNotEmpty) ...[
          for (final contact in contacts)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _ContactCard(
                contact: contact,
                isSelected: !isManual && widget.checkout.selectedContactId == contact.id,
                onTap: () => widget.onContactSelected(contact),
              ),
            ),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  'or',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                ),
              ),
              const Expanded(child: Divider()),
            ],
          ),
        ],
        // Manual entry toggle
        TextButton.icon(
          onPressed: () => widget.onToggleManual(!isManual),
          icon: Icon(
            isManual ? Icons.expand_less : Icons.edit_outlined,
            size: 18,
          ),
          label: Text(isManual ? 'Hide Manual Entry' : 'Enter Contact Manually'),
        ),
        // Manual entry form
        if (isManual) ...[
          const SizedBox(height: 8),
          TextField(
            controller: widget.nameController,
            decoration: const InputDecoration(
              labelText: 'Full Name',
              prefixIcon: Icon(Icons.person_outline),
            ),
            onChanged: (_) => widget.onAddressChanged?.call(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: widget.phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone Number',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
            onChanged: (_) => widget.onAddressChanged?.call(),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Checkbox(
                value: widget.saveToProfile,
                onChanged: (v) => widget.onToggleSave(v ?? false),
              ),
              const Text('Save to my profile for next time'),
            ],
          ),
        ],
        // Manage contacts link
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextButton.icon(
            onPressed: () => context.push(AppRoutes.contacts),
            icon: const Icon(Icons.manage_accounts, size: 18),
            label: const Text('Manage Contacts'),
          ),
        ),
      ],
    );
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({
    required this.contact,
    required this.isSelected,
    required this.onTap,
  });

  final CustomerContactsRow contact;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isSelected
              ? theme.colorScheme.primary
              : theme.colorScheme.outlineVariant,
          width: isSelected ? 2 : 1,
        ),
      ),
      color: isSelected
          ? theme.colorScheme.primaryContainer.withValues(alpha: 0.3)
          : null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(
                isSelected ? Icons.check_circle : Icons.radio_button_unchecked,
                color: isSelected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      contact.name,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    Text(
                      contact.phone,
                      style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              if (contact.isDefault)
                Chip(
                  label: const Text('Default'),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Address Section Widget ──────────────────────────────────────────────

class _AddressSection extends StatefulWidget {
  const _AddressSection({
    required this.profile,
    required this.checkout,
    required this.addressLine1Controller,
    required this.addressLine2Controller,
    required this.postalCodeController,
    required this.cityController,
    required this.stateController,
    required this.saveToProfile,
    required this.onToggleSave,
    required this.onAddressSelected,
    required this.onToggleManual,
    required this.onAddressChanged,
  });

  final CustomerProfile profile;
  final CheckoutState checkout;
  final TextEditingController addressLine1Controller;
  final TextEditingController addressLine2Controller;
  final TextEditingController postalCodeController;
  final TextEditingController cityController;
  final TextEditingController stateController;
  final bool saveToProfile;
  final ValueChanged<bool> onToggleSave;
  final void Function(CustomerAddressesRow?) onAddressSelected;
  final ValueChanged<bool> onToggleManual;
  final VoidCallback onAddressChanged;

  @override
  State<_AddressSection> createState() => _AddressSectionState();
}

class _AddressSectionState extends State<_AddressSection> {
  @override
  Widget build(BuildContext context) {
    final addresses = widget.profile.addresses;
    final isManual = widget.checkout.useManualAddress;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Saved addresses list
        if (addresses.isNotEmpty) ...[
          for (final address in addresses)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AddressCard(
                address: address,
                isSelected: !isManual && widget.checkout.selectedAddressId == address.id,
                onTap: () => widget.onAddressSelected(address),
              ),
            ),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  'or',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                      ),
                ),
              ),
              const Expanded(child: Divider()),
            ],
          ),
        ],
        // Manual entry toggle
        TextButton.icon(
          onPressed: () => widget.onToggleManual(!isManual),
          icon: Icon(
            isManual ? Icons.expand_less : Icons.edit_outlined,
            size: 18,
          ),
          label: Text(isManual ? 'Hide Manual Entry' : 'Enter Address Manually'),
        ),
        // Manual entry form
        if (isManual) ...[
          const SizedBox(height: 8),
          TextField(
            controller: widget.addressLine1Controller,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Address Line 1',
              prefixIcon: Icon(Icons.location_on_outlined),
            ),
            onChanged: (_) => widget.onAddressChanged(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: widget.addressLine2Controller,
            decoration: const InputDecoration(labelText: 'Address Line 2 (optional)'),
            onChanged: (_) => widget.onAddressChanged(),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: widget.postalCodeController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Postal Code'),
                  onChanged: (_) => widget.onAddressChanged(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: widget.cityController,
                  decoration: const InputDecoration(labelText: 'City'),
                  onChanged: (_) => widget.onAddressChanged(),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: widget.stateController,
            decoration: const InputDecoration(labelText: 'State'),
            onChanged: (_) => widget.onAddressChanged(),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Checkbox(
                value: widget.saveToProfile,
                onChanged: (v) => widget.onToggleSave(v ?? false),
              ),
              const Text('Save to my profile for next time'),
            ],
          ),
        ],
        // Manage addresses link
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextButton.icon(
            onPressed: () => context.push(AppRoutes.addresses),
            icon: const Icon(Icons.manage_search, size: 18),
            label: const Text('Manage Addresses'),
          ),
        ),
      ],
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({
    required this.address,
    required this.isSelected,
    required this.onTap,
  });

  final CustomerAddressesRow address;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayAddress = [
      address.addressLine1,
      if (address.addressLine2 != null && address.addressLine2!.isNotEmpty)
        address.addressLine2,
      '${address.city}, ${address.state} ${address.postalCode}',
    ].join('\n');

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isSelected
              ? theme.colorScheme.primary
              : theme.colorScheme.outlineVariant,
          width: isSelected ? 2 : 1,
        ),
      ),
      color: isSelected
          ? theme.colorScheme.primaryContainer.withValues(alpha: 0.3)
          : null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(
                isSelected ? Icons.check_circle : Icons.radio_button_unchecked,
                color: isSelected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          address.label ?? 'Address',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      displayAddress,
                      style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              if (address.isDefault)
                Chip(
                  label: const Text('Default'),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Section Title ────────────────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
    );
  }
}

// ── Delivery Type Selector ───────────────────────────────────────────────

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

// ── Fulfillment Selector ─────────────────────────────────────────────────

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
