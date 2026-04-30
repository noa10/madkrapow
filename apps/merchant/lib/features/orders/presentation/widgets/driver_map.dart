import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// Map widget showing driver location, destination, and a connecting polyline.
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

  @override
  Widget build(BuildContext context) {
    final driverLatLng =
        driverLatitude != null && driverLongitude != null
            ? LatLng(driverLatitude!, driverLongitude!)
            : null;

    final destLatLng =
        destinationLatitude != null && destinationLongitude != null
            ? LatLng(destinationLatitude!, destinationLongitude!)
            : null;

    final hasDriver = driverLatLng != null;
    final hasDest = destLatLng != null;

    if (!hasDriver && !hasDest) {
      return _PlaceholderMap(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.map_outlined, size: 40, color: Colors.grey.shade400),
            const SizedBox(height: 8),
            Text(
              'Map will appear when driver is assigned',
              style: TextStyle(color: Colors.grey.shade500),
            ),
          ],
        ),
      );
    }

    // Compute center as midpoint, fallback to whichever point exists.
    final center = (hasDriver && hasDest)
        ? LatLng(
            (driverLatLng.latitude + destLatLng.latitude) / 2,
            (driverLatLng.longitude + destLatLng.longitude) / 2,
          )
        : (driverLatLng ?? destLatLng!);

    final markers = <Marker>[];
    if (hasDriver) {
      markers.add(
        Marker(
          point: driverLatLng,
          width: 40,
          height: 40,
          child: const Icon(
            Icons.local_shipping,
            color: Colors.blue,
            size: 32,
          ),
        ),
      );
    }
    if (hasDest) {
      markers.add(
        Marker(
          point: destLatLng,
          width: 40,
          height: 40,
          child: const Icon(
            Icons.location_on,
            color: Colors.red,
            size: 32,
          ),
        ),
      );
    }

    final polylines = <Polyline>[];
    if (hasDriver && hasDest) {
      polylines.add(
        Polyline(
          points: [driverLatLng, destLatLng],
          strokeWidth: 3,
          color: Colors.blue.withValues(alpha: 0.7),
        ),
      );
    }

    return SizedBox(
      height: 240,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: FlutterMap(
          options: MapOptions(
            initialCenter: center,
            initialZoom: (hasDriver && hasDest) ? 14.0 : 16.0,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.madkrapow.merchant',
            ),
            if (polylines.isNotEmpty)
              PolylineLayer(polylines: polylines),
            MarkerLayer(markers: markers),
          ],
        ),
      ),
    );
  }
}

class _PlaceholderMap extends StatelessWidget {
  const _PlaceholderMap({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 200,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: child,
      ),
    );
  }
}
