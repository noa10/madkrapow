import 'package:envied/envied.dart';

part 'env.g.dart';

@Envied(obfuscate: true)
abstract class AppEnv {
  @EnviedField(varName: 'SUPABASE_URL')
  static final String supabaseUrl = _AppEnv.supabaseUrl;

  @EnviedField(varName: 'SUPABASE_ANON_KEY')
  static final String supabaseAnonKey = _AppEnv.supabaseAnonKey;

  @EnviedField(varName: 'WEB_API_URL', defaultValue: 'https://www.madkrapow.com')
  static final String webApiUrl = _AppEnv.webApiUrl;

  @EnviedField(varName: 'FCM_SENDER_ID')
  static final String fcmSenderId = _AppEnv.fcmSenderId;

  @EnviedField(varName: 'GOOGLE_WEB_CLIENT_ID', defaultValue: '')
  static final String googleWebClientId = _AppEnv.googleWebClientId;

  @EnviedField(varName: 'GOOGLE_IOS_CLIENT_ID', defaultValue: '')
  static final String googleIosClientId = _AppEnv.googleIosClientId;
}
