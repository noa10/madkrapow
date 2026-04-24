import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/services/image_upload_service.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../generated/database.dart';
import '../../providers/menu_providers.dart';
import '../widgets/modifier_bindings_editor.dart';

class MenuItemFormScreen extends ConsumerStatefulWidget {
  final MenuItemsRow? item;
  final String? initialCategoryId;

  const MenuItemFormScreen({super.key, this.item, this.initialCategoryId});

  @override
  ConsumerState<MenuItemFormScreen> createState() => _MenuItemFormScreenState();
}

class _MenuItemFormScreenState extends ConsumerState<MenuItemFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late TextEditingController _descriptionController;
  late TextEditingController _priceController;
  late bool _isAvailable;
  late String _selectedCategoryId;
  late int _sortOrder;
  bool _isSubmitting = false;

  // Image state
  String? _currentImageUrl;
  XFile? _selectedImageFile;
  bool _isUploadingImage = false;
  final _imageUploadService = ImageUploadService();

  List<CategoriesRow> _categories = [];
  bool _isLoadingCategories = true;

  bool get _isEditing => widget.item != null;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.item?.name ?? '');
    _descriptionController =
        TextEditingController(text: widget.item?.description ?? '');
    _priceController = TextEditingController(
      text: widget.item != null
          ? formatPriceNumber(widget.item!.priceCents)
          : '',
    );
    _currentImageUrl = widget.item?.imageUrl;
    _isAvailable = widget.item?.isAvailable ?? true;
    _selectedCategoryId = widget.item?.categoryId ?? widget.initialCategoryId ?? '';
    _sortOrder = widget.item?.sortOrder ?? 0;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_categories.isEmpty && _isLoadingCategories) {
      _loadCategories();
    }
  }

  Future<void> _loadCategories() async {
    try {
      final repo = ref.read(menuRepositoryProvider);
      var categories = await repo.fetchCategories();
      // Filter out categories with empty IDs (defensive: generated code
      // defaults id to '' when Supabase omits the field).
      categories = categories.where((c) => c.id.isNotEmpty).toList();
      _categories = categories;
      // Debug: log category IDs to trace the Invalid UUID issue.
      for (final c in _categories) {
        debugPrint('DEBUG: category "${c.name}" id="${c.id}"');
      }
      if (_selectedCategoryId.isEmpty && _categories.isNotEmpty) {
        _selectedCategoryId = _categories.first.id;
        debugPrint('DEBUG: set _selectedCategoryId from first category: "$_selectedCategoryId"');
      }
      debugPrint('DEBUG: _selectedCategoryId after load: "$_selectedCategoryId"');
      if (mounted) {
        setState(() => _isLoadingCategories = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoadingCategories = false);
      }
    }
  }

  int? _parsePriceCents() {
    final text = _priceController.text.trim();
    if (text.isEmpty) return null;
    // Remove any non-numeric characters except decimal point
    final clean = text.replaceAll(RegExp(r'[^0-9.]'), '');
    if (clean.isEmpty) return null;
    final numeric = double.tryParse(clean);
    if (numeric == null) return null;
    return (numeric * 100).round();
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? picked;
      if (source == ImageSource.gallery) {
        picked = await _imageUploadService.pickImageFromGallery();
      } else {
        picked = await _imageUploadService.pickImageFromCamera();
      }

      if (picked != null && mounted) {
        setState(() {
          _selectedImageFile = picked;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to pick image: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<String?> _uploadImageIfNeeded() async {
    if (_selectedImageFile == null) {
      return _currentImageUrl;
    }

    setState(() => _isUploadingImage = true);

    try {
      final url = await _imageUploadService.uploadMenuItemImage(_selectedImageFile!);
      return url;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to upload image: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return null;
    } finally {
      if (mounted) {
        setState(() => _isUploadingImage = false);
      }
    }
  }

  void _removeImage() {
    setState(() {
      _selectedImageFile = null;
      _currentImageUrl = null;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedCategoryId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a category'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // Validate UUID format — Zod rejects anything that isn't a valid UUID.
    final uuidRegex = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    debugPrint('DEBUG: _selectedCategoryId before submit = "$_selectedCategoryId"');
    if (!uuidRegex.hasMatch(_selectedCategoryId)) {
      debugPrint('DEBUG: _selectedCategoryId failed UUID validation!');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Invalid category ID ("$_selectedCategoryId"). '
            'Please re-select a category and try again.',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final priceCents = _parsePriceCents();
    if (priceCents == null || priceCents <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter a valid price'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      // Upload image if a new one was selected
      final imageUrl = await _uploadImageIfNeeded();
      if (_selectedImageFile != null && imageUrl == null) {
        // Upload failed — stop here (error already shown)
        setState(() => _isSubmitting = false);
        return;
      }

      final repo = ref.read(menuRepositoryProvider);

      if (_isEditing) {
        await repo.replaceMenuItem(
          itemId: widget.item!.id,
          name: _nameController.text.trim(),
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          priceCents: priceCents,
          imageUrl: imageUrl,
          isAvailable: _isAvailable,
          categoryId: _selectedCategoryId,
          sortOrder: _sortOrder,
        );
      } else {
        final newItem = MenuItemsRow(
          categoryId: _selectedCategoryId,
          name: _nameController.text.trim(),
          priceCents: priceCents,
          description: _descriptionController.text.trim().isEmpty
              ? null
              : _descriptionController.text.trim(),
          imageUrl: imageUrl,
          isAvailable: _isAvailable,
          sortOrder: _sortOrder,
        );
        await repo.createMenuItem(newItem);
      }

      if (mounted) {
        ref.invalidate(categoriesWithItemsProvider);
        if (_isEditing) {
          ref.invalidate(menuItemDetailProvider(widget.item!.id));
        }
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save item: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Item'),
        content: const Text('Are you sure you want to delete this menu item?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        final repo = ref.read(menuRepositoryProvider);
        await repo.deleteMenuItem(widget.item!.id);
        if (mounted) {
          ref.invalidate(menuItemDetailProvider(widget.item!.id));
          ref.invalidate(categoriesWithItemsProvider);
          context.pop();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to delete item: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  Widget _buildImageSection() {
    final hasImage = _selectedImageFile != null ||
        (_currentImageUrl != null && _currentImageUrl!.isNotEmpty);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Image',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade300),
            borderRadius: BorderRadius.circular(12),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: _buildImageContent(hasImage),
          ),
        ),
        if (_isUploadingImage)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Row(
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                SizedBox(width: 8),
                Text('Uploading image...'),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildImageContent(bool hasImage) {
    if (_selectedImageFile != null) {
      // Show newly selected file preview
      return _buildImagePreview(
        imageProvider: FileImage(File(_selectedImageFile!.path)),
        onRemove: _removeImage,
      );
    }

    if (_currentImageUrl != null && _currentImageUrl!.isNotEmpty) {
      // Show existing image from URL
      return _buildImagePreview(
        imageProvider: NetworkImage(_currentImageUrl!),
        onRemove: _removeImage,
      );
    }

    // Show placeholder with pick buttons
    return _buildImagePlaceholder();
  }

  Widget _buildImagePreview({
    required ImageProvider imageProvider,
    required VoidCallback onRemove,
  }) {
    return Stack(
      children: [
        Image(
          image: imageProvider,
          width: double.infinity,
          height: 200,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) => Container(
            width: double.infinity,
            height: 200,
            color: Colors.grey.shade200,
            child: const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.broken_image, size: 48, color: Colors.grey),
                SizedBox(height: 8),
                Text('Failed to load image'),
              ],
            ),
          ),
        ),
        Positioned(
          top: 8,
          right: 8,
          child: Row(
            children: [
              _ImageActionButton(
                icon: Icons.edit,
                onTap: () => _showImageSourceSheet(),
              ),
              const SizedBox(width: 8),
              _ImageActionButton(
                icon: Icons.delete,
                onTap: onRemove,
                backgroundColor: Colors.red,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildImagePlaceholder() {
    return InkWell(
      onTap: _showImageSourceSheet,
      child: Container(
        width: double.infinity,
        height: 160,
        color: Colors.grey.shade50,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.add_photo_alternate_outlined,
              size: 48,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 12),
            Text(
              'Tap to add an image',
              style: TextStyle(
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Gallery or Camera',
              style: TextStyle(
                color: Colors.grey.shade400,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showImageSourceSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Pick from Gallery'),
              onTap: () {
                Navigator.of(context).pop();
                _pickImage(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take a Photo'),
              onTap: () {
                Navigator.of(context).pop();
                _pickImage(ImageSource.camera);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoadingCategories) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Loading...'),
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_categories.isEmpty) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('New Item'),
        ),
        body: const Center(
          child: Text('No categories available. Create a category first.'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Item' : 'New Item'),
        actions: _isEditing
            ? [
                IconButton(
                  icon: const Icon(Icons.delete, color: Colors.red),
                  tooltip: 'Delete Item',
                  onPressed: _confirmDelete,
                ),
              ]
            : null,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  border: OutlineInputBorder(),
                ),
                textCapitalization: TextCapitalization.words,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Name is required' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description (optional)',
                  border: OutlineInputBorder(),
                ),
                maxLines: 3,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _priceController,
                      decoration: const InputDecoration(
                        labelText: 'Price',
                        prefixText: 'RM ',
                        border: OutlineInputBorder(),
                      ),
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Price is required';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _buildImageSection(),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _selectedCategoryId.isNotEmpty ? _selectedCategoryId : null,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  border: OutlineInputBorder(),
                ),
                items: _categories
                    .map((c) => DropdownMenuItem(
                          value: c.id,
                          child: Text(c.name),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v != null) {
                    setState(() => _selectedCategoryId = v);
                  }
                },
                validator: (v) =>
                    (v == null || v.isEmpty) ? 'Category is required' : null,
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                title: const Text('Available'),
                value: _isAvailable,
                onChanged: (v) => setState(() => _isAvailable = v),
              ),
              if (_isEditing) ...[
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.extension,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Modifier Groups',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Assign modifier groups that customers can select when ordering this item.',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 12),
                ModifierBindingsEditor(
                  menuItemId: widget.item!.id,
                  onSaved: () {
                    ref.invalidate(
                      modifierBindingsForItemProvider(widget.item!.id),
                    );
                  },
                ),
                const SizedBox(height: 24),
              ],
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: (_isSubmitting || _isUploadingImage) ? null : _submit,
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.save),
                label: Text(_isSubmitting ? 'Saving...' : 'Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small circular action button overlay for image preview.
class _ImageActionButton extends StatelessWidget {
  const _ImageActionButton({
    required this.icon,
    required this.onTap,
    this.backgroundColor = Colors.black54,
  });

  final IconData icon;
  final VoidCallback onTap;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Icon(icon, color: Colors.white, size: 18),
        ),
      ),
    );
  }
}
