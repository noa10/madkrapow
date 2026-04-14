import 'package:envied/envied.dart';

part 'env.g.dart';

@Envied(obfuscate: true)
abstract class AppEnv {
  @EnviedField(varName: 'SUPABASE_URL')
  static final String supabaseUrl = _AppEnv.supabaseUrl;

  @EnviedField(varName: 'SUPABASE_ANON_KEY')
  static final String supabaseAnonKey = _AppEnv.supabaseAnonKey;

  @EnviedField(varName: 'WEB_API_URL', defaultValue: 'http://10.0.2.2:3000')
  static final String webApiUrl = _AppEnv.webApiUrl;

  @EnviedField(varName: 'STORE_LATITUDE', defaultValue: '3.1390')
  static final String storeLatitude = _AppEnv.storeLatitude;

  @EnviedField(varName: 'STORE_LONGITUDE', defaultValue: '101.6869')
  static final String storeLongitude = _AppEnv.storeLongitude;

  @EnviedField(
    varName: 'STORE_ADDRESS',
    defaultValue: '123 Thai Food Street, Kuala Lumpur, Malaysia',
  )
  static final String storeAddress = _AppEnv.storeAddress;
}
