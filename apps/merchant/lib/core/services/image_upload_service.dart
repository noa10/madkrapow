import 'dart:math';

import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Service for picking and uploading images to Supabase Storage.
/// Follows the same pattern as the web admin (images bucket, menu-items folder).
class ImageUploadService {
  ImageUploadService({SupabaseClient? supabase})
      : _supabase = supabase ?? Supabase.instance.client;

  final SupabaseClient _supabase;
  final ImagePicker _picker = ImagePicker();

  static const String _bucketName = 'images';
  static const String _folderPath = 'menu-items';

  /// Pick an image from the device's photo gallery.
  Future<XFile?> pickImageFromGallery() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1200,
      maxHeight: 1200,
    );
    return picked;
  }

  /// Take a photo using the device's camera.
  Future<XFile?> pickImageFromCamera() async {
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 1200,
      maxHeight: 1200,
    );
    return picked;
  }

  /// Upload an image file to Supabase Storage and return its public URL.
  ///
  /// Throws [StorageException] if the upload fails.
  Future<String> uploadMenuItemImage(XFile file) async {
    final fileExt = file.name.split('.').last;
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = Random().nextInt(999999).toString().padLeft(6, '0');
    final fileName = '${timestamp}_$random.$fileExt';
    final filePath = '$_folderPath/$fileName';

    final bytes = await file.readAsBytes();

    await _supabase.storage.from(_bucketName).uploadBinary(
      filePath,
      bytes,
      fileOptions: const FileOptions(upsert: false),
    );

    final publicUrl = _supabase.storage.from(_bucketName).getPublicUrl(filePath);
    return publicUrl;
  }
}
