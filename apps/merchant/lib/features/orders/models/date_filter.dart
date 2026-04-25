import 'package:intl/intl.dart';

/// Represents a single-day date filter used in the History tab.
class DateFilter {
  /// Creates a filter for a specific date. Defaults to today if not provided.
  DateFilter({DateTime? date}) : selectedDate = _dateOnly(date ?? DateTime.now());

  /// The selected calendar day (time component stripped).
  final DateTime selectedDate;

  /// Midnight at the start of the selected day.
  DateTime get dayStart => selectedDate;

  /// 23:59:59 at the end of the selected day.
  DateTime get dayEnd => DateTime(
        selectedDate.year,
        selectedDate.month,
        selectedDate.day,
        23,
        59,
        59,
      );

  /// Human-readable label for the selected day.
  String get displayLabel {
    final now = DateTime.now();
    final today = _dateOnly(now);

    if (selectedDate == today) {
      return 'Today';
    }

    final yesterday = today.subtract(const Duration(days: 1));
    if (selectedDate == yesterday) {
      return 'Yesterday';
    }

    return DateFormat('EEEE, dd MMM yyyy').format(selectedDate);
  }

  /// Label used in the Total Sales summary card.
  String get summaryLabel {
    final now = DateTime.now();
    final today = _dateOnly(now);
    if (selectedDate == today) {
      return 'Total Sales Today';
    }
    return 'Total Sales (${DateFormat('dd MMM').format(selectedDate)})';
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DateFilter &&
          runtimeType == other.runtimeType &&
          selectedDate == other.selectedDate;

  @override
  int get hashCode => selectedDate.hashCode;

  static DateTime _dateOnly(DateTime dt) =>
      DateTime(dt.year, dt.month, dt.day);
}
