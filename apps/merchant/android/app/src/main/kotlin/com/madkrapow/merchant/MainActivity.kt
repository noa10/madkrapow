package com.madkrapow.merchant

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.madkrapow.merchant/order_notifications"
        ).setMethodCallHandler { call, result ->
            if (call.method == "show") {
                OrderNotificationBridge.show(this, call, result)
            } else {
                result.notImplemented()
            }
        }
    }
}
