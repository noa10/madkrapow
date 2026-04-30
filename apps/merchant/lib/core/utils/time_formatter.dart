/// Formats a [DateTime] into a human-readable relative string.
///
/// Returns strings like "Just now", "2s ago", "5 min ago", "1h ago",
/// "2d ago", etc. Returns an empty string if [date] is null.
String formatRelativeTime(DateTime? date) {
  if (date == null) return '';

  final now = DateTime.now();
  final diff = now.difference(date);

  if (diff.inSeconds < 5) {
    return 'Just now';
  } else if (diff.inSeconds < 60) {
    return '${diff.inSeconds}s ago';
  } else if (diff.inMinutes < 60) {
    return '${diff.inMinutes} min ago';
  } else if (diff.inHours < 24) {
    return '${diff.inHours}h ago';
  } else if (diff.inDays < 30) {
    return '${diff.inDays}d ago';
  } else {
    return '${(diff.inDays / 30).floor()}mo ago';
  }
}
