import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/pos_models.dart';
import '../../models/pos_tables.dart';

/// Share a table's QR as a print-ready PNG.
///
/// The web app downloads a canvas; the merchant app has no file browser, so
/// the platform share sheet is the equivalent "save or print" affordance.
Future<void> shareTableQrImage(
  TableWithToken table,
  String qrUrl, {
  Rect? sharePositionOrigin,
}) async {
  final bytes = await _renderTableQrCard(table, qrUrl);
  final file = await _writeTempFile(
    'table-${_slug(table.label)}-qr.png',
    bytes,
  );
  try {
    await Share.shareXFiles(
      [XFile(file.path)],
      text: 'Table ${table.label} QR code',
      sharePositionOrigin: sharePositionOrigin,
    );
  } finally {
    await _deleteTempFile(file);
  }
}

/// Share one printable sheet with a QR card per active table.
Future<void> shareTablesQrSheet(
  List<TableWithToken> tables,
  String baseUrl, {
  Rect? sharePositionOrigin,
}) async {
  if (tables.isEmpty) return;
  final bytes = await _renderQrSheet(tables, baseUrl);
  final file = await _writeTempFile('table-qr-sheet.png', bytes);
  try {
    await Share.shareXFiles(
      [XFile(file.path)],
      text: 'Mad Krapow — Table QR codes',
      sharePositionOrigin: sharePositionOrigin,
    );
  } finally {
    await _deleteTempFile(file);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const _ink = Color(0xFF111111);
const _mutedInk = Color(0xFF52525B);

Future<Uint8List> _renderTableQrCard(
  TableWithToken table,
  String qrUrl,
) async {
  const width = 1000.0;
  const height = 1300.0;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);

  canvas.drawRect(
    const Rect.fromLTWH(0, 0, width, height),
    Paint()..color = Colors.white,
  );
  canvas.drawRRect(
    RRect.fromRectAndRadius(
      const Rect.fromLTWH(40, 40, width - 80, height - 80),
      const Radius.circular(28),
    ),
    Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill,
  );
  canvas.drawRRect(
    RRect.fromRectAndRadius(
      const Rect.fromLTWH(40, 40, width - 80, height - 80),
      const Radius.circular(28),
    ),
    Paint()
      ..color = const Color(0xFFD4D4D8)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2,
  );

  final qr = await _renderQr(qrUrl, 760);
  canvas.drawImage(qr, const Offset(120, 110), Paint());

  _paintText(
    canvas,
    'Table ${table.label}',
    x: 0,
    y: 900,
    maxWidth: width,
    fontSize: 56,
    weight: FontWeight.w700,
  );
  _paintText(
    canvas,
    table.detail,
    x: 0,
    y: 980,
    maxWidth: width,
    fontSize: 30,
    color: _mutedInk,
  );
  _paintText(
    canvas,
    'Scan to order from your table',
    x: 0,
    y: 1080,
    maxWidth: width,
    fontSize: 32,
    color: _mutedInk,
  );

  return _finishPicture(recorder, width.toInt(), height.toInt());
}

Future<Uint8List> _renderQrSheet(
  List<TableWithToken> tables,
  String baseUrl,
) async {
  const pageWidth = 1600.0;
  const margin = 80.0;
  const gap = 60.0;
  const cardWidth = 700.0;
  const cardHeight = 900.0;
  const headerHeight = 220.0;
  const columns = 2;

  final rows = (tables.length / columns).ceil();
  final pageHeight = headerHeight + rows * (cardHeight + gap) + margin;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    Rect.fromLTWH(0, 0, pageWidth, pageHeight),
    Paint()..color = Colors.white,
  );

  _paintText(
    canvas,
    'Mad Krapow — Table QR Codes',
    x: 0,
    y: 60,
    maxWidth: pageWidth,
    fontSize: 46,
    weight: FontWeight.w700,
  );

  for (var index = 0; index < tables.length; index++) {
    final table = tables[index];
    final column = index % columns;
    final row = index ~/ columns;
    final left = margin + column * (cardWidth + gap);
    final top = headerHeight + row * (cardHeight + gap);

    final cardRect = Rect.fromLTWH(left, top, cardWidth, cardHeight);
    canvas.drawRRect(
      RRect.fromRectAndRadius(cardRect, const Radius.circular(24)),
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.fill,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(cardRect, const Radius.circular(24)),
      Paint()
        ..color = const Color(0xFFD4D4D8)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    final qr = await _renderQr(
      tableQrUrl(table.qrToken, baseUrl),
      cardWidth - 120,
    );
    canvas.drawImage(qr, Offset(left + 60, top + 50), Paint());

    _paintText(
      canvas,
      table.label,
      x: left,
      y: top + cardWidth - 40,
      maxWidth: cardWidth,
      fontSize: 44,
      weight: FontWeight.w700,
    );
    _paintText(
      canvas,
      'Scan to order from your table',
      x: left,
      y: top + cardWidth + 20,
      maxWidth: cardWidth,
      fontSize: 26,
      color: _mutedInk,
    );
  }

  return _finishPicture(recorder, pageWidth.toInt(), pageHeight.ceil());
}

Future<ui.Image> _renderQr(String data, double size) async {
  final painter = QrPainter(
    data: data,
    version: QrVersions.auto,
    gapless: true,
    errorCorrectionLevel: QrErrorCorrectLevel.M,
    eyeStyle: const QrEyeStyle(
      eyeShape: QrEyeShape.square,
      color: _ink,
    ),
    dataModuleStyle: const QrDataModuleStyle(
      dataModuleShape: QrDataModuleShape.square,
      color: _ink,
    ),
  );
  final bytes = await painter.toImageData(size, format: ui.ImageByteFormat.png);
  if (bytes == null) {
    throw StateError('Could not render the QR code');
  }
  final codec = await ui.instantiateImageCodec(bytes.buffer.asUint8List());
  final frame = await codec.getNextFrame();
  return frame.image;
}

void _paintText(
  Canvas canvas,
  String text, {
  required double x,
  required double y,
  required double maxWidth,
  required double fontSize,
  FontWeight weight = FontWeight.normal,
  Color color = _ink,
}) {
  final painter = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(
        color: color,
        fontSize: fontSize,
        fontWeight: weight,
      ),
    ),
    textAlign: TextAlign.center,
    textDirection: TextDirection.ltr,
  )..layout(maxWidth: maxWidth);
  painter.paint(canvas, Offset(x, y));
}

Future<Uint8List> _finishPicture(
  ui.PictureRecorder recorder,
  int width,
  int height,
) async {
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  if (data == null) {
    throw StateError('Could not render the QR sheet');
  }
  return data.buffer.asUint8List();
}

Future<File> _writeTempFile(String name, Uint8List bytes) async {
  final directory = await getTemporaryDirectory();
  final file = File('${directory.path}/$name');
  await file.writeAsBytes(bytes, flush: true);
  return file;
}

/// Remove the shared PNG once the share sheet closes. The image contains live
/// table tokens, so it should not persist in the cache longer than necessary.
Future<void> _deleteTempFile(File file) async {
  try {
    if (await file.exists()) await file.delete();
  } catch (_) {
    // Cache cleanup is best-effort; never mask the share result.
  }
}

String _slug(String value) => value
    .replaceAll(RegExp('[^a-zA-Z0-9]+'), '-')
    .toLowerCase()
    .replaceAll(RegExp('^-+|-+\$'), '');
