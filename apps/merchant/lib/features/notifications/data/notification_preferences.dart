/// Per-device order-alert preferences shared by the settings UI, the
/// foreground notifier and the worker (through the mirrored database columns).
class NotificationPreferences {
  const NotificationPreferences({
    this.orderAlerts = true,
    this.sound = true,
    this.vibration = true,
    this.repeatUntilViewed = true,
    this.alertSound = AlertSound.krapow,
  });

  final bool orderAlerts;
  final bool sound;
  final bool vibration;
  final bool repeatUntilViewed;
  final AlertSound alertSound;

  static const defaults = NotificationPreferences();

  NotificationPreferences copyWith({
    bool? orderAlerts,
    bool? sound,
    bool? vibration,
    bool? repeatUntilViewed,
    AlertSound? alertSound,
  }) {
    return NotificationPreferences(
      orderAlerts: orderAlerts ?? this.orderAlerts,
      sound: sound ?? this.sound,
      vibration: vibration ?? this.vibration,
      repeatUntilViewed: repeatUntilViewed ?? this.repeatUntilViewed,
      alertSound: alertSound ?? this.alertSound,
    );
  }

  /// The Android channel used by both the worker and foreground local alerts.
  /// Keep these ids in sync with `channelFor` in notify-admin/worker.mjs.
  String get channelId {
    if (sound && alertSound != AlertSound.system) {
      return vibration
          ? 'merchant_orders_${alertSound.name}'
          : 'merchant_orders_${alertSound.name}_quiet';
    }
    if (sound && vibration) return 'merchant_orders';
    if (sound) return 'merchant_orders_sound';
    if (vibration) return 'merchant_orders_vibrate';
    return 'merchant_orders_silent';
  }

  @override
  bool operator ==(Object other) {
    return other is NotificationPreferences &&
        other.orderAlerts == orderAlerts &&
        other.sound == sound &&
        other.vibration == vibration &&
        other.repeatUntilViewed == repeatUntilViewed &&
        other.alertSound == alertSound;
  }

  @override
  int get hashCode =>
      Object.hash(orderAlerts, sound, vibration, repeatUntilViewed, alertSound);
}

/// The order-alert sound choices. The names are the wire values stored in the
/// database (`fcm_tokens.alert_sound`) and sent to the worker, so they must
/// match the CHECK constraint and `channelFor` in notify-admin/worker.mjs.
enum AlertSound {
  krapow('Krapow chime', 'Rising mallet notes with a bell ding.'),
  bell('Service bell', 'Classic double counter-bell ding.'),
  chime('Light chime', 'Soft two-tone chime.'),
  system('System default', "This device's standard notification sound.");

  const AlertSound(this.label, this.description);

  final String label;
  final String description;

  /// Unknown or missing values fall back to the shipped default.
  static AlertSound fromWire(String? value) =>
      AlertSound.values.firstWhere(
        (sound) => sound.name == value,
        orElse: () => AlertSound.krapow,
      );
}

/// Android channels are immutable after creation, so each sound/vibration
/// combination needs its own channel.
class OrderNotificationChannel {
  const OrderNotificationChannel(
    this.id,
    this.name,
    this.description, {
    required this.sound,
    required this.vibration,
    this.rawSound,
  });

  final String id;
  final String name;
  final String description;
  final bool sound;
  final bool vibration;

  /// Raw resource name under android res/raw (no extension) played by this
  /// channel, or null for the system default sound.
  final String? rawSound;
}

const orderNotificationChannels = <OrderNotificationChannel>[
  // Legacy sound/vibration channels. 'System default' still alerts through
  // these, and app versions before the alert-sound choice keep using them.
  OrderNotificationChannel(
    'merchant_orders',
    'New orders',
    'Alerts when a new order arrives',
    sound: true,
    vibration: true,
  ),
  OrderNotificationChannel(
    'merchant_orders_sound',
    'New orders (sound)',
    'Alerts with sound, without vibration',
    sound: true,
    vibration: false,
  ),
  OrderNotificationChannel(
    'merchant_orders_vibrate',
    'New orders (vibrate)',
    'Alerts with vibration, without sound',
    sound: false,
    vibration: true,
  ),
  OrderNotificationChannel(
    'merchant_orders_silent',
    'New orders (silent)',
    'Alerts without sound or vibration',
    sound: false,
    vibration: false,
  ),
  // Per-sound channels targeted by the worker for each custom alert sound.
  OrderNotificationChannel(
    'merchant_orders_krapow',
    'New orders (Krapow chime)',
    'Alerts with the Krapow chime and vibration',
    sound: true,
    vibration: true,
    rawSound: 'krapow_mallet',
  ),
  OrderNotificationChannel(
    'merchant_orders_krapow_quiet',
    'New orders (Krapow chime)',
    'Alerts with the Krapow chime, without vibration',
    sound: true,
    vibration: false,
    rawSound: 'krapow_mallet',
  ),
  OrderNotificationChannel(
    'merchant_orders_bell',
    'New orders (service bell)',
    'Alerts with the service bell and vibration',
    sound: true,
    vibration: true,
    rawSound: 'service_bell',
  ),
  OrderNotificationChannel(
    'merchant_orders_bell_quiet',
    'New orders (service bell)',
    'Alerts with the service bell, without vibration',
    sound: true,
    vibration: false,
    rawSound: 'service_bell',
  ),
  OrderNotificationChannel(
    'merchant_orders_chime',
    'New orders (light chime)',
    'Alerts with the light chime and vibration',
    sound: true,
    vibration: true,
    rawSound: 'light_chime',
  ),
  OrderNotificationChannel(
    'merchant_orders_chime_quiet',
    'New orders (light chime)',
    'Alerts with the light chime, without vibration',
    sound: true,
    vibration: false,
    rawSound: 'light_chime',
  ),
];
