// Operating hours model — mirrors the JSONB structure in store_settings.operating_hours.
//
// Example:
// { "mon": {"open": "11:00", "close": "22:00"}, "tue": {...}, ... }

typedef DayHours = ({String open, String close});
typedef OperatingHours = Map<String, DayHours>;

const _dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/// Parses operating hours from a Map (Supabase JSONB).
OperatingHours parseOperatingHours(Map<String, dynamic> json) {
  return json.map((day, value) {
    final map = value as Map<String, dynamic>;
    return MapEntry(day, (open: map['open'] as String, close: map['close'] as String));
  });
}

/// Returns the day key for the given [dateTime] (e.g. "mon", "tue").
String _dayKey(DateTime dateTime) {
  return _dayKeys[dateTime.weekday - 1]; // weekday is 1=Mon..7=Sun
}

/// Checks if the store is currently open based on [operatingHours].
bool isStoreOpen(OperatingHours operatingHours, [DateTime? now]) {
  now ??= DateTime.now();
  final dayKey = _dayKey(now);
  final hours = operatingHours[dayKey];
  if (hours == null) return false;

  final currentMinutes = now.hour * 60 + now.minute;
  final openMinutes = _parseTimeToMinutes(hours.open);
  final closeMinutes = _parseTimeToMinutes(hours.close);

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

/// Returns a human-readable string for when the store next opens.
/// Returns null if the store is currently open.
String? formatNextOpenTime(OperatingHours operatingHours, [DateTime? now]) {
  now ??= DateTime.now();
  if (isStoreOpen(operatingHours, now)) return null;

  final todayKey = _dayKey(now);
  final todayHours = operatingHours[todayKey];
  if (todayHours != null) {
    final openMinutes = _parseTimeToMinutes(todayHours.open);
    final currentMinutes = now.hour * 60 + now.minute;
    if (currentMinutes < openMinutes) {
      return 'Opens today at ${todayHours.open}';
    }
  }

  // Check upcoming days
  for (int i = 1; i <= 7; i++) {
    final futureDate = now.add(Duration(days: i));
    final futureKey = _dayKey(futureDate);
    final futureHours = operatingHours[futureKey];
    if (futureHours != null) {
      final dayLabel = i == 1 ? 'tomorrow' : _dayFullName(futureKey);
      return 'Opens $dayLabel at ${futureHours.open}';
    }
  }

  return 'Currently closed';
}

int _parseTimeToMinutes(String time) {
  final parts = time.split(':');
  return int.parse(parts[0]) * 60 + int.parse(parts[1]);
}

String _dayFullName(String key) {
  return const {
    'mon': 'Monday',
    'tue': 'Tuesday',
    'wed': 'Wednesday',
    'thu': 'Thursday',
    'fri': 'Friday',
    'sat': 'Saturday',
    'sun': 'Sunday',
  }[key]!;
}
