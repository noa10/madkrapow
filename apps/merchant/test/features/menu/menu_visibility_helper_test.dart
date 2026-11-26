import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_visibility.dart';

void main() {
  test('treats missing and null archived_at as active', () {
    expect(isActiveMenuRow({'id': 'a'}), isTrue);
    expect(isActiveMenuRow({'id': 'a', 'archived_at': null}), isTrue);
    expect(
      isActiveMenuRow({'id': 'a', 'archived_at': '2026-01-01T00:00:00Z'}),
      isFalse,
    );
  });

  test('hides the historical category', () {
    expect(
      isVisibleCategory({'id': 'de5a0000-0000-4000-8000-000000000000'}),
      isFalse,
    );
    expect(isVisibleCategory({'id': 'other'}), isTrue);
  });

  test('hides items in the historical category', () {
    expect(
      isVisibleMenuItem({
        'id': 'item',
        'category_id': 'de5a0000-0000-4000-8000-000000000000',
      }),
      isFalse,
    );
    expect(isVisibleMenuItem({'id': 'item', 'category_id': 'other'}), isTrue);
  });

  test('treats a group minimum as required even when the link is optional', () {
    expect(
      isEffectivelyRequiredBinding(isRequired: true, minSelections: 0),
      isTrue,
    );
    expect(
      isEffectivelyRequiredBinding(isRequired: false, minSelections: 1),
      isTrue,
    );
    expect(
      isEffectivelyRequiredBinding(isRequired: false, minSelections: 0),
      isFalse,
    );
  });

  test('hides bindings whose modifier group is archived or missing', () {
    expect(
      isVisibleBinding({
        'modifier_groups': {'id': 'g'},
      }),
      isTrue,
    );
    expect(
      isVisibleBinding({
        'modifier_groups': {'id': 'g', 'archived_at': '2026-01-01T00:00:00Z'},
      }),
      isFalse,
    );
    expect(isVisibleBinding({'modifier_groups': null}), isFalse);
  });

  test('recognises the missing archived_at column error', () {
    expect(isMissingColumnCode('42703'), isTrue);
    expect(isMissingColumnCode('23502'), isFalse);
    expect(isMissingColumnCode(null), isFalse);
  });

  test('reads the GrabFood price override embedded on a menu item', () {
    expect(
      grabItemPriceCents({
        'channel_products': [
          {'channel': 'grabfood', 'price_cents': 1250},
        ],
      }),
      1250,
    );
    expect(
      grabItemPriceCents({
        'channel_products': [
          {'channel': 'foodpanda', 'price_cents': 1100},
        ],
      }),
      isNull,
    );
    expect(
      grabItemPriceCents({
        'channel_products': [
          {'channel': 'grabfood', 'price_cents': null},
        ],
      }),
      isNull,
    );
    expect(grabItemPriceCents(const {}), isNull);
  });

  test('confirms a delete only when the row is archived', () {
    ensureArchivedRow({
      'id': 'a',
      'archived_at': '2026-01-01T00:00:00Z',
    }, 'category');
    expect(
      () => ensureArchivedRow({'id': 'a', 'archived_at': null}, 'category'),
      throwsA(
        predicate(
          (error) => error.toString().contains(
            'did not confirm that the category was deleted',
          ),
        ),
      ),
    );
    expect(
      () => ensureArchivedRow(null, 'option group'),
      throwsA(
        predicate(
          (error) => error.toString().contains(
            'did not confirm that the option group was deleted',
          ),
        ),
      ),
    );
  });
}
