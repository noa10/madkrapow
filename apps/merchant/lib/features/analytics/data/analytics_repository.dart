import '../../orders/data/merchant_api_client.dart';
import 'analytics_models.dart';

/// Fetches analytics data from the admin API.
class AnalyticsRepository {
  final MerchantApiClient _apiClient;

  AnalyticsRepository(this._apiClient);

  Future<AnalyticsData> fetchAnalytics({
    String range = '7d',
    String? from,
    String? to,
  }) async {
    final queryParams = <String, String>{'range': range};
    if (from != null) queryParams['from'] = from;
    if (to != null) queryParams['to'] = to;

    final response = await _apiClient.get('/admin/analytics', queryParams);
    return AnalyticsData.fromJson(response);
  }
}
