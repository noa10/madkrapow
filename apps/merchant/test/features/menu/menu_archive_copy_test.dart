import 'package:flutter_test/flutter_test.dart';
import 'package:madkrapow_merchant/features/menu/data/menu_archive_copy.dart';

void main() {
  test('archive copy explains active-menu removal and history retention', () {
    for (final copy in [
      archiveItemCopy,
      archiveCategoryCopy,
      archiveGroupCopy('Sides'),
      archiveOptionCopy('Extra egg'),
    ]) {
      expect(copy, contains('active menu'));
      expect(copy, contains('history'));
    }
    expect(archiveGroupCopy('Sides'), contains('assignment'));
  });
}
