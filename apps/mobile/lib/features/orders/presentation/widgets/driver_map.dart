import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// Displays a live tracking map with driver and destination markers,
/// connected by a polyline. Falls back to a placeholder when coordinates
/// are not yet available.
class DriverMap extends StatelessWidget {
  const DriverMap({
    super.key,
    this.driverLatitude,
    this.driverLongitude,
    this.destinationLatitude,
    this.destinationLongitude,
  });

  final double? driverLatitude;
  final double? driverLongitude;
  final double? destinationLatitude;
  final double? destinationLongitude;

  bool get _hasAllCoordinates =>
      driverLatitude != null &&
      driverLongitude != null &&
      destinationLatitude != null &&
      destinationLongitude != null;

  @override
  Widget build(BuildContext context) {
    if (!_hasAllCoordinates) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Row(
            children: [
              Icon(
                Icons.map_outlined,
                size: 32,
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: 0.3),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  'Driver location not available yet',
                  style: TextStyle(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.5),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final driverLatLng = LatLng(driverLatitude!, driverLongitude!);
    final destinationLatLng =
        LatLng(destinationLatitude!, destinationLongitude!);

    // Midpoint between driver and destination for initial center
    final center = LatLng(
      (driverLatLng.latitude + destinationLatLng.latitude) / 2,
      (driverLatLng.longitude + destinationLatLng.longitude) / 2,
    );

    return Card(
      clipBehavior: Clip.antiAlias,
      child: SizedBox(
        height: 260,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: center,
            initialZoom: 14,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.madkrapow.mobile',
            ),
            PolylineLayer(
              polylines: [
                Polyline(
                  points: [driverLatLng, destinationLatLng],
                  color: Colors.orange,
                  strokeWidth: 4,
                ),
              ],
            ),
            MarkerLayer(
              markers: [
                // Driver marker
                Marker(
                  point: driverLatLng,
                  width: 40,
                  height: 40,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.blue,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.local_shipping,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                ),
                // Destination marker
                Marker(
                  point: destinationLatLng,
                  width: 40,
                  height: 40,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.red,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.location_pin,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
