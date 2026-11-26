package com.madkrapow.merchant

import android.app.Activity
import android.content.Context
import android.content.MutableContextWrapper
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayInputStream

class ReceiptPrintBridge(private var activity: Activity?) {
    private val handler = Handler(Looper.getMainLooper())
    private val views = mutableMapOf<WebView, MutableContextWrapper>()
    private var pending: MethodChannel.Result? = null
    private var pendingView: WebView? = null
    private var timeout: Runnable? = null

    fun print(call: MethodCall, result: MethodChannel.Result) {
        val html = call.argument<String>("html")
        if (html.isNullOrBlank()) {
            result.error("invalid_receipt", "Receipt document is empty", null)
            return
        }
        if (pending != null) {
            result.error("busy", "A receipt is already being prepared", null)
            return
        }
        pending = result
        var view: WebView? = null
        try {
            val context = MutableContextWrapper(activity ?: throw IllegalStateException("Activity closed"))
            val webView = WebView(context)
            view = webView
            views[webView] = context
            pendingView = webView
            webView.settings.apply {
                javaScriptEnabled = false
                blockNetworkLoads = true
                allowFileAccess = false
                allowContentAccess = false
                domStorageEnabled = false
            }
            webView.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
                @Suppress("DEPRECATION")
                override fun shouldOverrideUrlLoading(view: WebView, url: String) = true
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse = blockedResponse()
                @Suppress("DEPRECATION")
                override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse = blockedResponse()

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) fail(view, "Receipt could not be loaded")
                }

                override fun onPageFinished(view: WebView, url: String) {
                    if (pending == null || pendingView !== view) return
                    try {
                        val manager = activity?.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                            ?: throw IllegalStateException("Print service unavailable")
                        val delegate = view.createPrintDocumentAdapter("Receipt")
                        manager.print("Receipt", object : PrintDocumentAdapter() {
                            override fun onStart() = delegate.onStart()
                            override fun onLayout(oldAttributes: PrintAttributes?, newAttributes: PrintAttributes?, cancellationSignal: CancellationSignal?, callback: LayoutResultCallback?, extras: android.os.Bundle?) {
                                delegate.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras)
                            }
                            override fun onWrite(pages: Array<out PageRange>?, destination: ParcelFileDescriptor?, cancellationSignal: CancellationSignal?, callback: WriteResultCallback?) {
                                delegate.onWrite(pages, destination, cancellationSignal, callback)
                            }
                            override fun onFinish() {
                                try { delegate.onFinish() } finally { handler.post { release(view) } }
                            }
                        }, null)
                        timeout?.let(handler::removeCallbacks)
                        timeout = null
                        pending?.success(null)
                        pending = null
                        pendingView = null
                    } catch (_: Exception) {
                        fail(view, "Could not open the print dialog")
                    }
                }
            }
            timeout = Runnable { fail(webView, "Receipt preparation timed out") }.also {
                handler.postDelayed(it, 15000)
            }
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        } catch (_: Exception) {
            timeout?.let(handler::removeCallbacks)
            timeout = null
            view?.let { release(it) }
            pending?.error("print_error", "Could not prepare receipt", null)
            pending = null
            pendingView = null
        }
    }

    private fun blockedResponse() = WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream(ByteArray(0)))

    private fun fail(view: WebView, message: String) {
        if (pending == null || pendingView !== view) return
        timeout?.let(handler::removeCallbacks)
        timeout = null
        pending?.error("print_error", message, null)
        pending = null
        pendingView = null
        release(view)
    }

    private fun release(view: WebView) {
        if (views.remove(view) != null) {
            view.stopLoading()
            view.destroy()
        }
    }

    fun dispose() {
        timeout?.let(handler::removeCallbacks)
        timeout = null
        pending?.error("print_error", "Print screen closed", null)
        pending = null
        pendingView?.let { release(it) }
        pendingView = null
        // PrintManager can keep using an adapter after activity recreation.
        // Keep its WebView alive until onFinish without retaining the activity.
        val appContext = activity?.applicationContext
        if (appContext != null) views.values.forEach { it.baseContext = appContext }
        activity = null
    }
}
