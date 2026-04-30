/// Formats a [DateTime] as a human-readable relative string.
///
/// Returns strings like "Just now", "2s ago", "5 min ago", "1h ago", etc.
/// Returns an empty string if [date] is null.
String formatRelativeTime(DateTime? date) {
  if (date == null) return '';

  final now = DateTime.now();
  final diff = now.difference(date);

  if (diff.isNegative) {
    return 'Just now';
  }

  if (diff.inSeconds < 10) {
    return 'Just now';
  }
  if (diff.inSeconds < 60) {
    return '${diff.inSeconds}s ago';
  }
  if (diff.inMinutes < 60) {
    return '${diff.inMinutes} min ago';
  }
  if (diff.inHours < 24) {
    return '${diff.inHours}h ago';
  }
  if (diff.inDays < 7) {
    return '${diff.inDays}d ago';
  }
  if (diff.inDays < 30) {
    return '${(diff.inDays / 7).floor()}w ago';
  }

  return '${(diff.inDays / 30).floor()}mo ago';
}
