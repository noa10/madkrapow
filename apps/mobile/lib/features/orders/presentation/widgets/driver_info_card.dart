import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/utils/time_formatter.dart';

/// Displays driver information with photo, name, phone (tap-to-call), plate,
/// a relative timestamp of the last location update, and a Lalamove track button.
class DriverInfoCard extends StatelessWidget {
  const DriverInfoCard({
    super.key,
    this.driverName,
    this.driverPhone,
    this.driverPlate,
    this.driverPhotoUrl,
    this.driverLocationUpdatedAt,
    this.shareLink,
    this.lalamoveOrderId,
  });

  final String? driverName;
  final String? driverPhone;
  final String? driverPlate;
  final String? driverPhotoUrl;
  final DateTime? driverLocationUpdatedAt;

  /// Lalamove share-link (preferred) for live tracking.
  final String? shareLink;

  /// Fallback lalamove order id to build a tracking URL.
  final String? lalamoveOrderId;

  bool get _hasAnyDriverInfo =>
      driverName != null ||
      driverPhone != null ||
      driverPlate != null ||
      driverPhotoUrl != null;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Driver',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            if (!_hasAnyDriverInfo)
              Row(
                children: [
                  Icon(
                    Icons.person_off_outlined,
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.4),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Driver not yet assigned',
                    style: TextStyle(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              )
            else
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Driver photo / avatar
                  _buildAvatar(),
                  const SizedBox(width: 12),
                  // Driver details
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (driverName != null)
                          Text(
                            driverName!,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        const SizedBox(height: 6),
                        if (driverPhone != null)
                          _tappableInfoRow(
                            context,
                            Icons.phone_outlined,
                            driverPhone!,
                            onTap: () => _callPhone(driverPhone!),
                          ),
                        if (driverPlate != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: _plateBadge(context, driverPlate!),
                          ),
                        if (driverLocationUpdatedAt != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              'Last updated: ${formatRelativeTime(driverLocationUpdatedAt)}',
                              style: TextStyle(
                                fontSize: 12,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5),
                              ),
                            ),
                          ),
                        _buildTrackButton(context),
                      ],
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar() {
    if (driverPhotoUrl != null) {
      return ClipOval(
        child: CachedNetworkImage(
          imageUrl: driverPhotoUrl!,
          width: 56,
          height: 56,
          fit: BoxFit.cover,
          placeholder: (context, url) => CircleAvatar(
            radius: 28,
            backgroundColor: Colors.grey[300],
            child: const Icon(Icons.person, color: Colors.white),
          ),
          errorWidget: (context, url, error) => CircleAvatar(
            radius: 28,
            backgroundColor: Colors.grey[300],
            child: const Icon(Icons.person, color: Colors.white),
          ),
        ),
      );
    }

    return CircleAvatar(
      radius: 28,
      backgroundColor: Colors.grey[300],
      child: Icon(
        Icons.person,
        color: Colors.grey[600],
      ),
    );
  }

  Widget _tappableInfoRow(
    BuildContext context,
    IconData icon,
    String text, {
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Icon(
              icon,
              size: 18,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Text(
              text,
              style: TextStyle(
                color: theme.colorScheme.primary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _plateBadge(BuildContext context, String plate) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.orange.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.directions_car_outlined,
            size: 14,
            color: Colors.orange[700],
          ),
          const SizedBox(width: 6),
          Text(
            plate,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Colors.orange[800],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrackButton(BuildContext context) {
    final url = shareLink ??
        (lalamoveOrderId != null
            ? 'https://www.lalamove.com/en-my/track/MY/$lalamoveOrderId'
            : null);
    if (url == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: InkWell(
        onTap: () => _launchUrl(url),
        borderRadius: BorderRadius.circular(4),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.orange.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.open_in_new,
                size: 14,
                color: Colors.orange[800],
              ),
              const SizedBox(width: 6),
              Text(
                'Track Delivery on Lalamove',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.orange[800],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _callPhone(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
