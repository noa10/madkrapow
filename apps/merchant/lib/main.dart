import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config/env.dart';

/// Whether Firebase initialized successfully.
/// Used to guard FCM calls when config files are missing.
bool firebaseInitialized = false;

/// Top-level background message handler.
/// Required for FCM to work when the app is in the background/terminated.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: AppEnv.supabaseUrl,
    anonKey: AppEnv.supabaseAnonKey,
  );

  // Firebase init is wrapped in try-catch because google-services.json /
  // GoogleService-Info.plist may not be configured yet in dev builds.
  try {
    await Firebase.initializeApp();
    await FirebaseMessaging.instance.requestPermission();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    firebaseInitialized = true;
  } catch (_) {
    // Firebase not configured — FCM features will be unavailable
  }

  await Hive.initFlutter();

  runApp(const ProviderScope(child: MerchantApp()));
}
