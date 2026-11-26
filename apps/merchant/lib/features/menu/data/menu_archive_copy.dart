const archiveItemCopy =
    'Remove this item from the active menu? Past orders keep their history.';

const archiveCategoryCopy =
    'Remove this category and its items from the active menu? '
    'Past orders keep their history.';

String archiveGroupCopy(String name) =>
    'Remove "$name" and its options from the active menu? '
    'Items assigned to this group lose that assignment. '
    'Past orders keep their history.';

String archiveOptionCopy(String name) =>
    'Remove "$name" from the active menu? Past orders keep their history.';
