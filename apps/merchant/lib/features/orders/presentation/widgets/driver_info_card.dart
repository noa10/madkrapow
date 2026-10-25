import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/utils/time_formatter.dart';

/// Card displaying driver information with avatar, phone, plate, last-seen time,
/// and a Lalamove track-delivery button.
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

  @override
  Widget build(BuildContext context) {
    final hasDriver = driverName != null && driverName!.isNotEmpty;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: hasDriver
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Driver avatar
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AppColors.surface3,
                    child: driverPhotoUrl != null && driverPhotoUrl!.isNotEmpty
                        ? ClipOval(
                            child: CachedNetworkImage(
                              imageUrl: driverPhotoUrl!,
                              width: 56,
                              height: 56,
                              fit: BoxFit.cover,
                              placeholder: (context, url) =>
                                  const Icon(Icons.person, size: 28),
                              errorWidget: (context, url, error) =>
                                  const Icon(Icons.person, size: 28),
                            ),
                          )
                        : const Icon(Icons.person, size: 28),
                  ),
                  const SizedBox(width: 12),
                  // Driver details
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          driverName!,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        if (driverPhone != null && driverPhone!.isNotEmpty)
                          _TapRow(
                            icon: Icons.phone,
                            text: driverPhone!,
                            onTap: () async {
                              final uri = Uri.parse('tel:$driverPhone');
                              if (await canLaunchUrl(uri)) {
                                await launchUrl(uri);
                              }
                            },
                          ),
                        if (driverPlate != null && driverPlate!.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.directions_car,
                                  size: 16,
                                  color: AppColors.muted,
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.infoSoft,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    driverPlate!,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.info,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (driverLocationUpdatedAt != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              'Last updated: ${formatRelativeTime(driverLocationUpdatedAt)}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.muted,
                              ),
                            ),
                          ),
                        _buildTrackButton(),
                      ],
                    ),
                  ),
                ],
              )
            : const Row(
                children: [
                  Icon(Icons.local_shipping_outlined, color: AppColors.muted),
                  SizedBox(width: 12),
                  Text(
                    'Driver not yet assigned',
                    style: TextStyle(
                      color: AppColors.muted,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildTrackButton() {
    final url =
        shareLink ??
        (lalamoveOrderId != null
            ? 'https://www.lalamove.com/en-my/track/MY/$lalamoveOrderId'
            : null);
    if (url == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: InkWell(
        onTap: () => _launchUrl(url),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.emberSoft,
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.open_in_new, size: 14, color: AppColors.emberText),
              SizedBox(width: 6),
              Text(
                'Track Delivery on Lalamove',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.emberText,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _TapRow extends StatelessWidget {
  const _TapRow({required this.icon, required this.text, this.onTap});

  final IconData icon;
  final String text;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.muted),
          const SizedBox(width: 6),
          Text(
            text,
            style: const TextStyle(fontSize: 14, color: AppColors.accent),
          ),
        ],
      ),
    );
  }
}
