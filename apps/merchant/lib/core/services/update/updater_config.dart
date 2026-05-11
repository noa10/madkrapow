/// Per-app configuration for the in-app GitHub APK updater.
class UpdaterConfig {
  const UpdaterConfig({
    required this.appType,
    required this.tagPrefix,
    required this.repoOwner,
    required this.repoName,
    this.githubToken,
  });

  final String appType;
  final String tagPrefix;
  final String repoOwner;
  final String repoName;
  final String? githubToken;

  Uri get releasesEndpoint => Uri.parse(
        'https://api.github.com/repos/$repoOwner/$repoName/releases',
      );
}
