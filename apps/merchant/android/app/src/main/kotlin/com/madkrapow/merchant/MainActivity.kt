package com.madkrapow.merchant

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private lateinit var receiptPrintBridge: ReceiptPrintBridge

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        receiptPrintBridge = ReceiptPrintBridge(this)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.madkrapow.merchant/receipt_print"
        ).setMethodCallHandler { call, result ->
            if (call.method == "printReceipt") {
                receiptPrintBridge.print(call, result)
            } else {
                result.notImplemented()
            }
        }
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

    override fun onDestroy() {
        if (::receiptPrintBridge.isInitialized) receiptPrintBridge.dispose()
        super.onDestroy()
    }
}
