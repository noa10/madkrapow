package com.madkrapow.merchant

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.Locale

/** Shares FCM's (order tag, ID zero), with a distinct tap intent per order. */
internal object OrderNotificationBridge {
    @SuppressLint("MissingPermission") // Permission is requested by FcmRepository.
    fun show(context: Context, call: MethodCall, result: MethodChannel.Result) {
        val orderId = call.argument<String>("orderId")?.lowercase(Locale.ROOT)
        val tag = call.argument<String>("tag")
        val channelId = call.argument<String>("channelId")
        val payload = call.argument<String>("payload")
        if (orderId == null || !orderId.matches(Regex("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) ||
            tag != "merchant-order-$orderId" || channelId == null || payload == null
        ) {
            result.error("INVALID_ORDER_NOTIFICATION", "Invalid order notification.", null)
            return
        }
        try {
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: throw IllegalStateException("No launch activity")
            intent.action = "SELECT_NOTIFICATION" // The local plugin handles the tap payload.
            // Intent matching ignores extras but includes categories. This
            // isolates each order's tap without introducing a Flutter deep link.
            intent.addCategory("com.madkrapow.merchant.ORDER.$orderId")
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            intent.putExtra("notificationId", 0)
            intent.putExtra("notificationTag", tag)
            intent.putExtra("payload", payload)
            val tap = PendingIntent.getActivity(
                context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.drawable.ic_order_notification)
                .setContentTitle(call.argument<String>("title"))
                .setContentText(call.argument<String>("body"))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setPriority(NotificationCompat.PRIORITY_HIGH)

            // Android 8+ uses the pre-created channel. These also preserve the
            // selected sound/vibration on older supported Android versions.
            if (call.argument<Boolean>("playSound") == true) {
                val rawSound = call.argument<String>("rawSound")
                notification.setSound(
                    if (rawSound == null) RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                    else Uri.parse("android.resource://${context.packageName}/raw/$rawSound")
                )
            }
            if (call.argument<Boolean>("enableVibration") == true) {
                notification.setVibrate(longArrayOf(0, 250, 250, 250))
            }
            NotificationManagerCompat.from(context).notify(tag, 0, notification.build())
            result.success(null)
        } catch (_: Exception) {
            result.error("ORDER_NOTIFICATION_FAILED", "Could not display order notification.", null)
        }
    }
}
