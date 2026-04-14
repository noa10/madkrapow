import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../../config/routes.dart';

class StripeCheckoutScreen extends StatefulWidget {
  const StripeCheckoutScreen({super.key, required this.checkoutUrl});

  final String checkoutUrl;

  @override
  State<StripeCheckoutScreen> createState() => _StripeCheckoutScreenState();
}

class _StripeCheckoutScreenState extends State<StripeCheckoutScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;
  bool _navigated = false;

  /// Checks if a URL is a Stripe success/cancel redirect by matching
  /// the path component. This is necessary because the Stripe session's
  /// success_url uses NEXT_PUBLIC_URL (e.g., http://localhost:3000) which
  /// may differ from the mobile app's WEB_API_URL (e.g., http://10.0.2.2:3000).
  bool _isSuccessUrl(String url) {
    try {
      final uri = Uri.parse(url);
      return uri.path == '/order/success';
    } catch (_) {
      return false;
    }
  }

  bool _isCancelUrl(String url) {
    try {
      final uri = Uri.parse(url);
      return uri.path == '/checkout';
    } catch (_) {
      return false;
    }
  }

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() => _isLoading = true),
          onPageFinished: (_) => setState(() => _isLoading = false),
          onNavigationRequest: (request) {
            final url = request.url;

            // Payment success — redirect to order detail
            if (_isSuccessUrl(url)) {
              if (!_navigated) {
                _navigated = true;
                final uri = Uri.parse(url);
                final orderId = uri.queryParameters['orderId'];
                if (orderId != null) {
                  _goToOrderDetail(orderId);
                } else {
                  _goToOrders();
                }
              }
              return NavigationDecision.prevent;
            }

            // Payment cancelled — go back to checkout
            if (_isCancelUrl(url)) {
              if (!_navigated) {
                _navigated = true;
                Navigator.of(context).pop();
              }
              return NavigationDecision.prevent;
            }

            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.checkoutUrl));
  }

  void _goToOrderDetail(String orderId) {
    if (!mounted) return;
    context.go('/orders/$orderId');
  }

  void _goToOrders() {
    if (!mounted) return;
    context.go(AppRoutes.orders);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_isLoading) const Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }
}
