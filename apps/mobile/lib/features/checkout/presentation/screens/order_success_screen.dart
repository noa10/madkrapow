import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../config/routes.dart';
import '../../../orders/data/order_repository.dart';

class OrderSuccessScreen extends ConsumerStatefulWidget {
  const OrderSuccessScreen({super.key, this.orderId});

  final String? orderId;

  @override
  ConsumerState<OrderSuccessScreen> createState() => _OrderSuccessScreenState();
}

class _OrderSuccessScreenState extends ConsumerState<OrderSuccessScreen> {
  _PaymentStatus _status = _PaymentStatus.confirming;
  Timer? _pollTimer;
  int _attempts = 0;
  static const _maxAttempts = 7; // ~21 seconds

  @override
  void initState() {
    super.initState();
    if (widget.orderId != null) {
      _startPolling();
    } else {
      _status = _PaymentStatus.confirmed;
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (!mounted) return;
      _attempts++;

      try {
        final details = await ref
            .read(orderRepositoryProvider)
            .fetchOrderDetails(widget.orderId!);

        if (details.order.status == 'paid' ||
            details.order.status == 'accepted' ||
            details.order.status == 'preparing') {
          setState(() => _status = _PaymentStatus.confirmed);
          _pollTimer?.cancel();
        } else if (_attempts >= _maxAttempts) {
          setState(() => _status = _PaymentStatus.timedOut);
          _pollTimer?.cancel();
        }
      } catch (_) {
        if (_attempts >= _maxAttempts) {
          setState(() => _status = _PaymentStatus.timedOut);
          _pollTimer?.cancel();
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _statusIcon(theme),
                const SizedBox(height: 24),
                Text(
                  _statusTitle,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _statusMessage,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 32),
                if (widget.orderId != null)
                  FilledButton(
                    onPressed: () => context.go('/orders/${widget.orderId!}'),
                    child: const Text('View Order'),
                  ),
                if (widget.orderId != null) const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => context.go(AppRoutes.orders),
                  child: const Text('View My Orders'),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => context.go(AppRoutes.home),
                  child: const Text('Back to Menu'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _statusIcon(ThemeData theme) {
    switch (_status) {
      case _PaymentStatus.confirming:
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: CircularProgressIndicator(
            color: theme.colorScheme.primary,
            strokeWidth: 4,
          ),
        );
      case _PaymentStatus.confirmed:
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: Colors.green.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.check_circle, color: Colors.green, size: 48),
        );
      case _PaymentStatus.timedOut:
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: Colors.orange.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.schedule, color: Colors.orange, size: 48),
        );
    }
  }

  String get _statusTitle {
    switch (_status) {
      case _PaymentStatus.confirming:
        return 'Confirming Payment';
      case _PaymentStatus.confirmed:
        return 'Payment Confirmed!';
      case _PaymentStatus.timedOut:
        return 'Payment Received';
    }
  }

  String get _statusMessage {
    switch (_status) {
      case _PaymentStatus.confirming:
        return 'We\'re verifying your payment. This usually takes a few seconds.';
      case _PaymentStatus.confirmed:
        return 'Your order has been placed successfully. '
            'You\'ll receive updates as your order progresses.';
      case _PaymentStatus.timedOut:
        return 'Your payment was received but is still being processed. '
            'Check your orders for updates.';
    }
  }
}

enum _PaymentStatus { confirming, confirmed, timedOut }
