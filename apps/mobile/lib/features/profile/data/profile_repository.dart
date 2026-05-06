import 'dart:typed_data';

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

  static const _avatarBucket = 'profile-photos';
  static const int _maxFileSize = 5 * 1024 * 1024;
  static const _allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  Future<CustomerProfile> fetchProfile() async {
    final user = _supabase.auth.currentUser!;

    var customerRes = await _supabase
        .from('customers')
        .select()
        .eq('auth_user_id', user.id)
        .maybeSingle();

    final googleAvatarUrl =
        user.userMetadata?['avatar_url'] ?? user.userMetadata?['picture'];

    customerRes ??= await _supabase.from('customers').insert({
      'auth_user_id': user.id,
      'name': user.userMetadata?['full_name'],
      'phone': user.phone,
      'avatar_url': googleAvatarUrl,
    }).select().single();

    final customer = CustomersRow.fromJson(customerRes);

    final results = await Future.wait([
      _supabase
          .from('customer_addresses')
          .select()
          .eq('customer_id', customer.id)
          .order('is_default', ascending: false),
      _supabase
          .from('customer_contacts')
          .select()
          .eq('customer_id', customer.id)
          .order('is_default', ascending: false),
    ]);

    final addresses = (results[0] as List)
        .map((json) => CustomerAddressesRow.fromJson(json))
        .toList();
    final contacts = (results[1] as List)
        .map((json) => CustomerContactsRow.fromJson(json))
        .toList();

    return CustomerProfile(customer: customer, addresses: addresses, contacts: contacts);
  }

  // ── Avatar ─────────────────────────────────────────────────────

  Future<String> uploadAvatar({
    required String filePath,
    required Uint8List fileBytes,
    required String contentType,
  }) async {
    if (!_allowedTypes.contains(contentType)) {
      throw Exception('Invalid file type. Only JPEG, PNG, and WebP are allowed.');
    }
    if (fileBytes.length > _maxFileSize) {
      throw Exception('File too large. Maximum size is 5MB.');
    }

    final userId = _supabase.auth.currentUser!.id;
    final fileExt = filePath.split('.').last;
    final storagePath = '$userId/${DateTime.now().millisecondsSinceEpoch}.$fileExt';

    await _supabase.storage.from(_avatarBucket).uploadBinary(
          storagePath,
          fileBytes,
          fileOptions: const FileOptions(upsert: true),
        );

    final publicUrl =
        _supabase.storage.from(_avatarBucket).getPublicUrl(storagePath);

    await _supabase.from('customers').update({
      'avatar_url': publicUrl,
    }).eq('auth_user_id', userId);

    final currentMetadata = Map<String, dynamic>.from(
      _supabase.auth.currentUser?.userMetadata ?? {},
    );
    await _supabase.auth.updateUser(
      UserAttributes(data: {...currentMetadata, 'avatar_url': publicUrl}),
    );

    return publicUrl;
  }

  Future<void> removeAvatar() async {
    final userId = _supabase.auth.currentUser!.id;

    final files = await _supabase.storage.from(_avatarBucket).list(
      path: userId,
    );
    if (files.isNotEmpty) {
      final filePaths = files.map((f) => '$userId/${f.name}').toList();
      await _supabase.storage.from(_avatarBucket).remove(filePaths);
    }

    await _supabase.from('customers').update({
      'avatar_url': null,
    }).eq('auth_user_id', userId);

    final currentMetadata = Map<String, dynamic>.from(
      _supabase.auth.currentUser?.userMetadata ?? {},
    );
    currentMetadata.remove('avatar_url');
    await _supabase.auth.updateUser(
      UserAttributes(data: currentMetadata),
    );
  }

  // ── Addresses ───────────────────────────────────────────────────

  Future<CustomerAddressesRow> addAddress(Map<String, dynamic> data) async {
    final res = await _supabase
        .from('customer_addresses')
        .insert(data)
        .select()
        .single();
    return CustomerAddressesRow.fromJson(res);
  }

  Future<void> updateAddress(String addressId, Map<String, dynamic> data) async {
    await _supabase
        .from('customer_addresses')
        .update(data)
        .eq('id', addressId);
  }

  Future<void> deleteAddress(String addressId) async {
    await _supabase
        .from('customer_addresses')
        .delete()
        .eq('id', addressId);
  }

  Future<void> setDefaultAddress(String customerId, String addressId) async {
    await _supabase.rpc('set_default_address', params: {
      'p_customer_id': customerId,
      'p_address_id': addressId,
    });
  }

  // ── Contacts ────────────────────────────────────────────────────

  Future<CustomerContactsRow> addContact(Map<String, dynamic> data) async {
    final res = await _supabase
        .from('customer_contacts')
        .insert(data)
        .select()
        .single();
    return CustomerContactsRow.fromJson(res);
  }

  Future<void> updateContact(String contactId, Map<String, dynamic> data) async {
    await _supabase
        .from('customer_contacts')
        .update(data)
        .eq('id', contactId);
  }

  Future<void> deleteContact(String contactId) async {
    await _supabase
        .from('customer_contacts')
        .delete()
        .eq('id', contactId);
  }

  Future<void> setDefaultContact(String customerId, String contactId) async {
    await _supabase.rpc('set_default_contact', params: {
      'p_customer_id': customerId,
      'p_contact_id': contactId,
    });
  }

  // ── Customer Profile ────────────────────────────────────────────

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

final addressesProvider = FutureProvider<List<CustomerAddressesRow>>((ref) async {
  final profile = await ref.watch(profileProvider.future);
  return profile.addresses;
});

final contactsProvider = FutureProvider<List<CustomerContactsRow>>((ref) async {
  final profile = await ref.watch(profileProvider.future);
  return profile.contacts;
});
