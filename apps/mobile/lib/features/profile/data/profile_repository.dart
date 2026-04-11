import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../../generated/tables/customer_addresses.dart';
import '../../../generated/tables/customers.dart';

class CustomerProfile {
  const CustomerProfile({
    required this.customer,
    this.addresses = const [],
  });

  final CustomersRow customer;
  final List<CustomerAddressesRow> addresses;
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

    return CustomerProfile(customer: customer, addresses: addresses);
  }

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
