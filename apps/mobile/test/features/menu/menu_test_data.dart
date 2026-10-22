import 'package:madkrapow_mobile/features/menu/data/menu_repository.dart';
import 'package:madkrapow_mobile/generated/tables/categories.dart';
import 'package:madkrapow_mobile/generated/tables/menu_items.dart';

CategoriesRow testCategory({
  required String id,
  required String name,
  String? description,
}) {
  return CategoriesRow.fromJson({
    'id': id,
    'name': name,
    'description': description,
    'sort_order': 0,
    'is_active': true,
  });
}

MenuItemsRow testMenuItem({
  required String id,
  required String categoryId,
  required String name,
  String? description,
  int priceCents = 1250,
  bool isAvailable = true,
  bool isSignature = false,
  int spiceLevel = 0,
  List<String> ingredients = const [],
  String? imageUrl,
}) {
  return MenuItemsRow.fromJson({
    'id': id,
    'category_id': categoryId,
    'name': name,
    'description': description,
    'price_cents': priceCents,
    'image_url': imageUrl,
    'is_available': isAvailable,
    'sort_order': 0,
    'is_signature': isSignature,
    'spice_level': spiceLevel,
    'ingredients': ingredients,
  });
}

MenuItemWithModifiers testItem({
  required MenuItemsRow item,
  bool hasModifiers = false,
}) {
  return MenuItemWithModifiers(item: item, hasModifiers: hasModifiers);
}

List<CategoryWithMenuItems> testHomeCategories() {
  final mains = testCategory(
    id: 'category-mains',
    name: 'Mains',
    description: 'Wok-fired plates served with jasmine rice.',
  );
  final drinks = testCategory(
    id: 'category-drinks',
    name: 'Drinks',
    description: 'Cold Thai classics, brewed fresh.',
  );
  final sides = testCategory(
    id: 'category-sides',
    name: 'Sides',
    description: 'Extra crunch on the side.',
  );

  final signatureKrapow = testItem(
    item: testMenuItem(
      id: 'signature-krapow',
      categoryId: mains.id,
      name: 'Phad Kra Phao',
      description:
          "Wok-fired holy basil, bird's eye chilli and a crisp-edged fried egg.",
      priceCents: 1450,
      isSignature: true,
      spiceLevel: 3,
      ingredients: const ['Holy basil', "Bird's eye chilli", 'Fried egg'],
    ),
    hasModifiers: true,
  );

  final signatureTea = testItem(
    item: testMenuItem(
      id: 'signature-tea',
      categoryId: drinks.id,
      name: 'Thai Iced Tea',
      description: 'Strong Thai tea with condensed milk, poured over ice.',
      priceCents: 650,
      isSignature: true,
    ),
  );

  final chickenKrapow = testItem(
    item: testMenuItem(
      id: 'chicken-krapow',
      categoryId: mains.id,
      name: 'Chicken Krapow Rice',
      description: 'Minced chicken, holy basil and jasmine rice.',
      priceCents: 1250,
      spiceLevel: 2,
    ),
    hasModifiers: true,
  );

  final crispyChicken = testItem(
    item: testMenuItem(
      id: 'crispy-chicken',
      categoryId: mains.id,
      name: 'Crispy Chicken Rice',
      priceCents: 1350,
      isAvailable: false,
      spiceLevel: 1,
    ),
  );

  final lemonTea = testItem(
    item: testMenuItem(
      id: 'lemon-tea',
      categoryId: drinks.id,
      name: 'Iced Lemon Tea',
      description: 'Fresh lime and brewed tea.',
      priceCents: 550,
    ),
  );

  final fries = testItem(
    item: testMenuItem(
      id: 'krapow-fries',
      categoryId: sides.id,
      name: 'Krapow Fries',
      description: 'Crispy fries tossed in krapow seasoning.',
      priceCents: 850,
    ),
    hasModifiers: true,
  );

  return [
    CategoryWithMenuItems(
      category: mains,
      menuItems: [signatureKrapow, chickenKrapow, crispyChicken],
    ),
    CategoryWithMenuItems(
      category: drinks,
      menuItems: [signatureTea, lemonTea],
    ),
    CategoryWithMenuItems(category: sides, menuItems: [fries]),
  ];
}

List<MenuItemWithModifiers> testHomeItems() {
  return [for (final category in testHomeCategories()) ...category.menuItems];
}
