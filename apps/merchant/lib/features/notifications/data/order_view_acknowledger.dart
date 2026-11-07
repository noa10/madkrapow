import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'device_identity.dart';
import 'order_notification.dart';

typedef RpcCall =
    Future<dynamic> Function(String function, Map<String, dynamic> params);

/// Acknowledges that this installation opened an order, stopping repeats for
/// this device while other devices continue.
class OrderViewAcknowledger {
  OrderViewAcknowledger(SupabaseClient supabase, DeviceIdentity identity)
    : this.withRpc(
        (function, params) => supabase.rpc(function, params: params),
        identity,
      );

  @visibleForTesting
  OrderViewAcknowledger.withRpc(this._rpc, this._identity);

  final RpcCall _rpc;
  final DeviceIdentity _identity;

  /// Returns true only when the server recorded the view for this device.
  /// A network failure leaves repeats active for a later retry.
  Future<bool> acknowledge(String orderId) async {
    if (!OrderNotification.isValidOrderId(orderId)) return false;
    final deviceId = await _identity.id;
    final result = await _rpc('acknowledge_merchant_order_view', {
      'p_device_id': deviceId,
      'p_order_id': orderId,
    });
    return result == true;
  }
}
