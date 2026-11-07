import 'dart:async';
import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/constants/roles.dart';
import '../../../core/providers/supabase_provider.dart';
import '../../auth/providers/admin_auth_providers.dart';
import '../../orders/providers/admin_order_providers.dart';
import '../../orders/providers/kitchen_providers.dart';
import '../data/local_order_notifications.dart';
import '../data/notification_preferences.dart';
import '../data/order_notification.dart';
import '../providers/notification_providers.dart';

typedef _HeldForegroundAlert = ({
  OrderNotification notification,
  RemoteNotification? message,
});

/// Keeps FCM listeners at the app root across sign-ins and route changes.
class OrderNotificationHandler extends ConsumerStatefulWidget {
  const OrderNotificationHandler({
    super.key,
    required this.child,
    required this.router,
    required this.navigatorKey,
    required this.firebaseReady,
    required this.localNotifications,
    this.foregroundMessages,
    this.openedMessages,
    this.initialMessage,
  });

  final Widget child;
  final GoRouter router;
  final GlobalKey<NavigatorState> navigatorKey;
  final bool firebaseReady;
  final LocalOrderNotifications? localNotifications;
  final Stream<RemoteMessage>? foregroundMessages;
  final Stream<RemoteMessage>? openedMessages;
  final Future<RemoteMessage?> Function()? initialMessage;

  @override
  ConsumerState<OrderNotificationHandler> createState() =>
      _OrderNotificationHandlerState();
}

class _OrderNotificationHandlerState
    extends ConsumerState<OrderNotificationHandler>
    with WidgetsBindingObserver {
  final _taps = NotificationTapQueue();
  final _foregroundEvents = NotificationEventDeduplicator();
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;
  StreamSubscription<String>? _localTapSubscription;
  ProviderSubscription<AsyncValue<AuthState>>? _authSubscription;
  String? _previousUserId;
  bool _drainScheduled = false;
  Timer? _routerRetry;
  int _routerRetryCount = 0;
  Map<String, _HeldForegroundAlert> _pendingForeground = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (!widget.firebaseReady) return;

    _authSubscription = ref.listenManual<AsyncValue<AuthState>>(
      authStateProvider,
      (_, next) {
        if (next is AsyncError<AuthState>) _pendingForeground = const {};
        if (next is! AsyncData<AuthState>) return;
        final user = next.value.session?.user;
        final rawRole = user?.appMetadata['role'];
        final isStaff =
            rawRole is String && StaffRoleExtension.fromString(rawRole) != null;
        final userId = isStaff ? user?.id : null;
        if (userId == null) _pendingForeground = const {};
        if (_previousUserId != null && _previousUserId != userId) {
          _taps.clear();
          _foregroundEvents.clear();
          ref.read(viewedOrderRegistryProvider).clear();
          _pendingForeground = const {};
          _routerRetry?.cancel();
          _routerRetry = null;
          _routerRetryCount = 0;
          if (userId == null) {
            // Session expiry or remote revocation bypasses the explicit
            // sign-out path. Invalidate this device so it stops receiving the
            // previous user's order alerts.
            unawaited(ref.read(fcmRepositoryProvider).invalidate());
          }
        }
        _previousUserId = userId;
        ref.read(fcmRepositoryProvider).updateUser(userId);
        _scheduleTap();
      },
      fireImmediately: true,
    );

    _foregroundSubscription =
        (widget.foregroundMessages ?? FirebaseMessaging.onMessage).listen(
          _onForeground,
          onError: (Object _) => debugPrint('FCM foreground listener failed.'),
        );
    _openedSubscription =
        (widget.openedMessages ?? FirebaseMessaging.onMessageOpenedApp).listen(
          (message) => _queueTap(message.data),
          onError: (Object _) => debugPrint('FCM tap listener failed.'),
        );
    _localTapSubscription = widget.localNotifications?.taps.listen(
      _queueLocalTap,
    );
    final localInitial = widget.localNotifications?.takeInitialPayload();
    if (localInitial != null) _queueLocalTap(localInitial);
    unawaited(_readInitialMessage());
  }

  Future<void> _readInitialMessage() async {
    try {
      final message =
          await (widget.initialMessage ??
              FirebaseMessaging.instance.getInitialMessage)();
      if (mounted && message != null) _queueTap(message.data);
    } catch (_) {
      debugPrint('Could not read the initial FCM notification.');
    }
  }

  void _onForeground(RemoteMessage message) {
    if (!mounted) return;
    final notification = OrderNotification.fromData(message.data);
    if (notification == null) return;
    if (notification.repeatNumber == 0) _refreshOrders();
    _presentForeground(notification, message.notification);
  }

  void _presentForeground(
    OrderNotification notification,
    RemoteNotification? message,
  ) {
    final local = widget.localNotifications;
    if (local == null) return;
    final preferences = ref.read(notificationPreferencesControllerProvider);
    if (!preferences.orderAlerts) return;
    if (ref.read(viewedOrderRegistryProvider).contains(notification.orderId)) {
      return;
    }
    if (ref.read(currentUserProvider) == null ||
        ref.read(staffRoleProvider) == null) {
      // FCM does not replay foreground messages after session restoration.
      // Keep each distinct event; coalesce its repeats to the latest alert.
      // A known signed-out/non-staff session must not queue for a later user.
      if (ref.read(authStateProvider) is AsyncLoading<AuthState>) {
        final pending = _pendingForeground[notification.eventId];
        if (pending == null ||
            notification.repeatNumber > pending.notification.repeatNumber) {
          _pendingForeground = {
            ..._pendingForeground,
            notification.eventId: (
              notification: notification,
              message: message,
            ),
          };
        }
      }
      return;
    }
    if (!_foregroundEvents.accept(notification.dedupeKey)) return;
    unawaited(_showForeground(local, notification, message, preferences));
  }

  Future<void> _showForeground(
    LocalOrderNotifications local,
    OrderNotification notification,
    RemoteNotification? message,
    NotificationPreferences preferences,
  ) async {
    try {
      await local.show(notification, message, preferences);
    } catch (_) {
      debugPrint('Could not display the foreground order notification.');
    }
  }

  void _queueLocalTap(String payload) {
    try {
      final decoded = jsonDecode(payload);
      if (decoded is Map<String, dynamic>) _queueTap(decoded);
    } on FormatException {
      // Ignore malformed external notification payloads.
    }
  }

  void _queueTap(Map<String, dynamic> data) {
    if (!mounted) return;
    _taps.add(data);
    _routerRetryCount = 0;
    _scheduleTap();
  }

  void _scheduleTap() {
    if (_drainScheduled || !mounted) return;
    _drainScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _drainScheduled = false;
      if (!mounted) return;
      final ready =
          ref.read(currentUserProvider) != null &&
          ref.read(staffRoleProvider) != null;
      if (ready && _pendingForeground.isNotEmpty) {
        final pending = _pendingForeground.values.toList(growable: false);
        _pendingForeground = const {};
        for (final alert in pending) {
          _presentForeground(alert.notification, alert.message);
        }
      }
      final routerReady = widget.navigatorKey.currentState?.mounted ?? false;
      final notification = _taps.takeIfReady(
        authReady: ready,
        routerReady: routerReady,
      );
      if (notification != null) {
        _routerRetryCount = 0;
        widget.router.go('/orders/${notification.orderId}');
      } else if (ready && !routerReady && _taps.hasPending) {
        // The auth stream can settle before the router has mounted its
        // navigator; keep the tap until a later frame can actually route it.
        // Bound the wait so a navigator that never mounts cannot spin.
        if (_routerRetryCount < 50) {
          _routerRetryCount++;
          _routerRetry ??= Timer(const Duration(milliseconds: 100), () {
            _routerRetry = null;
            _scheduleTap();
          });
        }
      }
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  void _refreshOrders() {
    ref.invalidate(adminOrdersProvider);
    ref.invalidate(kitchenOrderCardsProvider);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !mounted) return;
    if (ref.read(currentUserProvider) != null &&
        ref.read(staffRoleProvider) != null) {
      // Realtime cannot replay events missed while Android suspended the app.
      _refreshOrders();
      if (widget.firebaseReady) ref.read(fcmRepositoryProvider).retry();
    }
    _scheduleTap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _authSubscription?.close();
    _routerRetry?.cancel();
    unawaited(_foregroundSubscription?.cancel());
    unawaited(_openedSubscription?.cancel());
    unawaited(_localTapSubscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
