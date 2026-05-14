// Generator: reads order_status.json and writes lib/order_status.g.dart.
// Run with: dart run packages/madkrapow_orders/tool/generate.dart
//   (from repo root) OR  dart run tool/generate.dart  (from package dir).

import 'dart:convert';
import 'dart:io';

void main(List<String> args) {
  final pkgDir = _packageDir();
  final jsonFile = File('${pkgDir.path}/order_status.json');
  if (!jsonFile.existsSync()) {
    stderr.writeln('FATAL: missing ${jsonFile.path}');
    exit(2);
  }
  final spec = jsonDecode(jsonFile.readAsStringSync()) as Map<String, dynamic>;

  final statuses = (spec['statuses'] as List).cast<String>();
  final terminal = (spec['terminal'] as List).cast<String>();
  final cancellable = (spec['cancellable'] as List).cast<String>();
  final flowSteps = (spec['flowSteps'] as List).cast<String>();
  final adminFlowSteps = (spec['adminFlowSteps'] as List).cast<String>();
  final forwardTransitions =
      (spec['forwardTransitions'] as Map).cast<String, dynamic>();
  final adminTransitions =
      (spec['adminTransitions'] as Map).cast<String, dynamic>();
  final kitchenTransitions =
      (spec['kitchenTransitions'] as Map).cast<String, dynamic>();
  final customerLabels =
      (spec['customerLabels'] as Map).cast<String, String>();
  final adminLabels = (spec['adminLabels'] as Map).cast<String, String>();
  final stepLabels = (spec['stepLabels'] as Map).cast<String, String>();
  final colorRoles = (spec['colorRoles'] as Map).cast<String, String>();
  final notifyStatuses = (spec['notifyStatuses'] as List).cast<String>();
  final dispatchMessages =
      (spec['dispatchMessages'] as Map).cast<String, dynamic>();

  final buf = StringBuffer();
  buf.writeln('// GENERATED FILE — DO NOT EDIT BY HAND.');
  buf.writeln('// Source: packages/madkrapow_orders/order_status.json');
  buf.writeln(
      '// Regenerate: dart run packages/madkrapow_orders/tool/generate.dart');
  buf.writeln();
  buf.writeln('// ignore_for_file: type=lint');
  buf.writeln();
  buf.writeln('/// Canonical list of orders.status values.');
  buf.writeln('const List<String> kOrderStatusValues = ${_dartList(statuses)};');
  buf.writeln();
  buf.writeln('const List<String> kTerminalStatuses = ${_dartList(terminal)};');
  buf.writeln(
      'const List<String> kCancellableStatuses = ${_dartList(cancellable)};');
  buf.writeln('const List<String> kFlowSteps = ${_dartList(flowSteps)};');
  buf.writeln(
      'const List<String> kAdminFlowSteps = ${_dartList(adminFlowSteps)};');
  buf.writeln('const List<String> kNotifyStatuses = ${_dartList(notifyStatuses)};');
  buf.writeln();
  buf.writeln(
      'const Map<String, List<String>> kForwardTransitions = ${_dartMapOfStringList(forwardTransitions)};');
  buf.writeln(
      'const Map<String, List<String>> kAdminTransitions = ${_dartMapOfStringList(adminTransitions)};');
  buf.writeln(
      'const Map<String, List<String>> kKitchenTransitions = ${_dartMapOfStringList(kitchenTransitions)};');
  buf.writeln();
  buf.writeln(
      'const Map<String, String> kCustomerLabels = ${_dartMapOfString(customerLabels)};');
  buf.writeln(
      'const Map<String, String> kAdminLabels = ${_dartMapOfString(adminLabels)};');
  buf.writeln(
      'const Map<String, String> kStepLabels = ${_dartMapOfString(stepLabels)};');
  buf.writeln(
      'const Map<String, String> kColorRoles = ${_dartMapOfString(colorRoles)};');
  buf.writeln();
  buf.writeln('class DispatchBannerCopy {');
  buf.writeln('  final String title;');
  buf.writeln('  final String body;');
  buf.writeln('  final String customerBody;');
  buf.writeln('  final String severity;');
  buf.writeln(
      '  const DispatchBannerCopy({required this.title, required this.body, required this.customerBody, required this.severity});');
  buf.writeln('}');
  buf.writeln();
  buf.writeln('const Map<String, DispatchBannerCopy> kDispatchMessages = {');
  for (final entry in dispatchMessages.entries) {
    final v = (entry.value as Map).cast<String, dynamic>();
    buf.writeln(
        "  ${_dartString(entry.key)}: DispatchBannerCopy(title: ${_dartString(v['title'] as String)}, body: ${_dartString(v['body'] as String)}, customerBody: ${_dartString(v['customerBody'] as String)}, severity: ${_dartString(v['severity'] as String)}),");
  }
  buf.writeln('};');

  final out = File('${pkgDir.path}/lib/order_status.g.dart');
  out.writeAsStringSync(buf.toString());
  stdout.writeln('Wrote ${out.path}');
}

Directory _packageDir() {
  final cwd = Directory.current;
  if (File('${cwd.path}/order_status.json').existsSync()) return cwd;
  final fromRoot =
      Directory('${cwd.path}/packages/madkrapow_orders');
  if (File('${fromRoot.path}/order_status.json').existsSync()) return fromRoot;
  throw StateError(
      'Could not find order_status.json relative to ${cwd.path}. Run from repo root or package dir.');
}

String _dartString(String s) {
  final escaped =
      s.replaceAll(r'\', r'\\').replaceAll("'", r"\'").replaceAll('\n', r'\n');
  return "'$escaped'";
}

String _dartList(List<String> items) {
  return '[${items.map(_dartString).join(', ')}]';
}

String _dartMapOfString(Map<String, String> m) {
  final pairs =
      m.entries.map((e) => '${_dartString(e.key)}: ${_dartString(e.value)}');
  return '{${pairs.join(', ')}}';
}

String _dartMapOfStringList(Map<String, dynamic> m) {
  final pairs = m.entries.map((e) =>
      '${_dartString(e.key)}: ${_dartList((e.value as List).cast<String>())}');
  return '{${pairs.join(', ')}}';
}
