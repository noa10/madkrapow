import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:madkrapow_merchant/features/notifications/data/device_identity.dart';

void main() {
  late Directory storage;

  setUp(() async {
    storage = await Directory.systemTemp.createTemp(
      'merchant-device-identity-',
    );
    Hive.init(storage.path);
  });

  tearDown(() async {
    await Hive.close();
    await storage.delete(recursive: true);
  });

  test(
    'reuses a valid persisted identity across repository instances',
    () async {
      const saved = 'existing-installation-device-id';
      final box = await Hive.openBox('fcm');
      await box.put('device_id', saved);

      expect(await DeviceIdentity().id, saved);
      expect(await DeviceIdentity().id, saved);
      expect(box.get('device_id'), saved);
    },
  );

  test(
    'concurrent readers share one random identity persisted across restart',
    () async {
      final identity = DeviceIdentity();
      final first = identity.id;
      final simultaneous = identity.id;
      expect(identical(first, simultaneous), isTrue);
      final created = await first;
      expect(created, matches(RegExp(r'^[A-Za-z0-9_-]{22}$')));
      expect(await simultaneous, created);

      await Hive.close();
      Hive.init(storage.path);

      expect(await DeviceIdentity().id, created);
      expect((await Hive.openBox('fcm')).get('device_id'), created);
    },
  );

  test('replaces a malformed older identity before registering it', () async {
    final box = await Hive.openBox('fcm');
    await box.put('device_id', 'too-short');

    final replacement = await DeviceIdentity().id;

    expect(replacement, matches(RegExp(r'^[A-Za-z0-9_-]{22}$')));
    expect(replacement, isNot('too-short'));
    expect(box.get('device_id'), replacement);
  });

  test('retries after an unreadable stored identity is repaired', () async {
    final box = await Hive.openBox('fcm');
    await box.put('device_id', 42);
    final identity = DeviceIdentity();
    await expectLater(identity.id, throwsA(isA<TypeError>()));
    await box.delete('device_id');

    final recovered = await identity.id;
    expect(recovered, matches(RegExp(r'^[A-Za-z0-9_-]{22}$')));
    expect((await Hive.openBox('fcm')).get('device_id'), recovered);
  });
}
