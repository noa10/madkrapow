import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../../generated/tables/customer_addresses.dart';
import '../../../generated/tables/customer_contacts.dart';
import '../../../generated/tables/customers.dart';

class CustomerProfile {
  const CustomerProfile({
    required this.customer,
    this.addresses = const [],
    this.contacts = const [],
  });

  final CustomersRow customer;
  final List<CustomerAddressesRow> addresses;
  final List<CustomerContactsRow> contacts;
}

class ProfileRepository {
  ProfileRepository(this._supabase);
  final SupabaseClient _supabase;

  /// Get or create the customer profile for the current user.
  Future<CustomerProfile> fetchProfile() async {
    final user = _supabase.auth.currentUser!;

    // Get or create customer
    var customerRes = await _supabase
        .from('customers')
        .select()
        .eq('auth_user_id', user.id)
        .maybeSingle();

    customerRes ??= await _supabase.from('customers').insert({
      'auth_user_id': user.id,
      'name': user.userMetadata?['full_name'],
      'phone': user.phone,
    }).select().single();

    final customer = CustomersRow.fromJson(customerRes);

    // Fetch addresses
    final addressesRes = await _supabase
        .from('customer_addresses')
        .select()
        .eq('customer_id', customer.id)
        .order('is_default', ascending: false);

    final addresses =
        addressesRes.map((json) => CustomerAddressesRow.fromJson(json)).toList();

    // Fetch contacts
    final contactsRes = await _supabase
        .from('customer_contacts')
        .select()
        .eq('customer_id', customer.id)
        .order('is_default', ascending: false);

    final contacts =
        contactsRes.map((json) => CustomerContactsRow.fromJson(json)).toList();

    return CustomerProfile(customer: customer, addresses: addresses, contacts: contacts);
  }

  // ── Addresses ──────────────────────────────────────────────────

  /// Add a new address.
  Future<CustomerAddressesRow> addAddress(Map<String, dynamic> data) async {
    final res = await _supabase
        .from('customer_addresses')
        .insert(data)
        .select()
        .single();
    return CustomerAddressesRow.fromJson(res);
  }

  /// Update an existing address.
  Future<void> updateAddress(String addressId, Map<String, dynamic> data) async {
    await _supabase
        .from('customer_addresses')
        .update(data)
        .eq('id', addressId);
  }

  /// Delete an address.
  Future<void> deleteAddress(String addressId) async {
    await _supabase
        .from('customer_addresses')
        .delete()
        .eq('id', addressId);
  }

  /// Set an address as the default for the customer.
  Future<void> setDefaultAddress(String customerId, String addressId) async {
    await _supabase
        .from('customer_addresses')
        .update({'is_default': false})
        .eq('customer_id', customerId);
    await _supabase
        .from('customer_addresses')
        .update({'is_default': true})
        .eq('id', addressId);
  }

  // ── Contacts ───────────────────────────────────────────────────

  /// Add a new contact.
  Future<CustomerContactsRow> addContact(Map<String, dynamic> data) async {
    final res = await _supabase
        .from('customer_contacts')
        .insert(data)
        .select()
        .single();
    return CustomerContactsRow.fromJson(res);
  }

  /// Update an existing contact.
  Future<void> updateContact(String contactId, Map<String, dynamic> data) async {
    await _supabase
        .from('customer_contacts')
        .update(data)
        .eq('id', contactId);
  }

  /// Delete a contact.
  Future<void> deleteContact(String contactId) async {
    await _supabase
        .from('customer_contacts')
        .delete()
        .eq('id', contactId);
  }

  /// Set a contact as the default for the customer.
  Future<void> setDefaultContact(String customerId, String contactId) async {
    // Unset current default
    await _supabase
        .from('customer_contacts')
        .update({'is_default': false})
        .eq('customer_id', customerId);
    // Set new default
    await _supabase
        .from('customer_contacts')
        .update({'is_default': true})
        .eq('id', contactId);
  }

  // ── Customer Profile ───────────────────────────────────────────

  /// Update customer profile.
  Future<void> updateCustomer(String customerId, Map<String, dynamic> data) async {
    await _supabase.from('customers').update(data).eq('id', customerId);
  }
}

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.watch(supabaseProvider));
});

final profileProvider = FutureProvider<CustomerProfile>((ref) async {
  final repo = ref.watch(profileRepositoryProvider);
  return repo.fetchProfile();
});
