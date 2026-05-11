# Android Release Guide

This document covers releasing the **mobile** (`apps/mobile`) and **merchant** (`apps/merchant`) Android apps for the madkrapow monorepo.

Releases are driven by `.github/workflows/android-release.yml` and triggered by pushing an app-scoped tag (`mobile-v*` or `merchant-v*`). Each tag produces a **draft** GitHub Release containing a signed `.aab` and `.apk`. You publish the draft manually after reviewing it.

---

## Required GitHub Secrets

The release workflow needs 8 repository-scoped secrets. Populate them once using `gh secret set`:

| Secret | Source | Example |
|---|---|---|
| `ANDROID_KEYSTORE_MOBILE_BASE64` | `base64 -i apps/mobile/android/app/release.keystore` | (base64 blob) |
| `ANDROID_KEYSTORE_MERCHANT_BASE64` | `base64 -i apps/merchant/android/app/release.keystore` | (base64 blob) |
| `ANDROID_KEY_ALIAS_MOBILE` | `keytool -list` on the mobile keystore | `madkrapow_mobile` |
| `ANDROID_KEY_ALIAS_MERCHANT` | `keytool -list` on the merchant keystore | `madkrapow_merchant` |
| `ANDROID_KEYSTORE_PASSWORD_MOBILE` | The **store** password after rotation | (opaque string) |
| `ANDROID_KEYSTORE_PASSWORD_MERCHANT` | The **store** password after rotation | (opaque string) |
| `ANDROID_KEY_PASSWORD_MOBILE` | The **key** password after rotation | (opaque string) |
| `ANDROID_KEY_PASSWORD_MERCHANT` | The **key** password after rotation | (opaque string) |

Commands (run from repo root after rotating passwords — see next section):

```bash
gh secret set ANDROID_KEYSTORE_MOBILE_BASE64   < <(base64 -i apps/mobile/android/app/release.keystore)
gh secret set ANDROID_KEYSTORE_MERCHANT_BASE64 < <(base64 -i apps/merchant/android/app/release.keystore)

gh secret set ANDROID_KEY_ALIAS_MOBILE            --body "madkrapow_mobile"
gh secret set ANDROID_KEY_ALIAS_MERCHANT          --body "madkrapow_merchant"

gh secret set ANDROID_KEYSTORE_PASSWORD_MOBILE    --body "<new-store-pw-for-mobile>"
gh secret set ANDROID_KEYSTORE_PASSWORD_MERCHANT  --body "<new-store-pw-for-merchant>"
gh secret set ANDROID_KEY_PASSWORD_MOBILE         --body "<new-key-pw-for-mobile>"
gh secret set ANDROID_KEY_PASSWORD_MERCHANT       --body "<new-key-pw-for-merchant>"
```

Verify they are populated:

```bash
gh secret list | grep -E 'ANDROID_(KEYSTORE|KEY)_'
```

You should see all 8 entries.

---

## Rotate passwords

The existing keystores ship with the development password `madkrapow123`. Rotate both the **store** password and the **key** password before populating Secrets:

```bash
# Mobile
cd apps/mobile/android/app
keytool -storepasswd -keystore release.keystore -storepass madkrapow123 -new "<NEW_STORE_PW>"
keytool -keypasswd   -keystore release.keystore -alias madkrapow_mobile \
        -keypass madkrapow123 -new "<NEW_KEY_PW>" -storepass "<NEW_STORE_PW>"

# Merchant — repeat with its alias
cd ../../../merchant/android/app
keytool -storepasswd -keystore release.keystore -storepass madkrapow123 -new "<NEW_STORE_PW>"
keytool -keypasswd   -keystore release.keystore -alias madkrapow_merchant \
        -keypass madkrapow123 -new "<NEW_KEY_PW>" -storepass "<NEW_STORE_PW>"
```

Store the new passwords in your password manager. Verify rotation worked:

```bash
keytool -list -v -keystore release.keystore -storepass madkrapow123
# Expected: "keystore password was incorrect"
keytool -list -v -keystore release.keystore -storepass "<NEW_STORE_PW>"
# Expected: alias listed
```

Then base64-encode and upload the keystore bytes (see the `gh secret set` commands above).

---

## Generate a new keystore

If you need a **new** keystore (e.g. key compromise, or you want to replace the identity before Play Store launch), generate one with `keytool`:

```bash
keytool -genkey -v \
  -keystore release.keystore \
  -alias madkrapow_mobile \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "<NEW_STORE_PW>" \
  -keypass   "<NEW_KEY_PW>"
```

Repeat with `-alias madkrapow_merchant` for the merchant app.

**Warning:** Once an app is on the Play Store, you can only update it with APKs signed by the original key (or with Play App Signing). Regenerating the keystore after launch locks you out of updating the listing. Only regenerate pre-launch.

---

## Cut a release

Releases are app-scoped. The tag drives both the target app and the version. `pubspec.yaml` is informational only — CI does not read its version field.

```bash
# Mobile release
git tag mobile-v0.0.1
git push origin mobile-v0.0.1

# Merchant release
git tag merchant-v0.0.1
git push origin merchant-v0.0.1
```

Tag format: `<app>-v<major>.<minor>.<patch>[-prerelease]`. Examples:

| Tag | Valid? | Notes |
|---|---|---|
| `mobile-v1.2.3` | yes | Standard release |
| `merchant-v0.1.0` | yes | Standard release |
| `mobile-v1.2.3-rc1` | yes | Pre-release suffix allowed |
| `v1.0.0` | **no** | Missing app prefix; workflow fails at tag-parse |
| `mobile-v1.2` | **no** | Missing patch version |
| `mobile-v0.0.0` | **no** | `versionCode` would be 0 (Play Store requires >= 1) |

Monitor the run:

```bash
gh run watch $(gh run list --workflow=android-release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

When the workflow finishes, inspect the draft release:

```bash
gh release view mobile-v0.0.1
```

You should see:
- `Status: Draft`
- `Assets:` `mobile-v0.0.1.aab`, `mobile-v0.0.1.apk`
- Release notes body with `## Features` / `## Fixes` sections (or `_No user-facing changes_` on a first release)

### Verifying signatures locally

Android uses two different signature schemes, so each artifact needs a different tool:

```bash
# AAB: uses legacy JAR signing (v1)
jarsigner -verify -verbose -certs mobile-v0.0.1.aab
# expect: jar verified

# APK: uses APK Signature Scheme v2/v3 (not JAR)
# apksigner ships with Android build-tools (part of the Android SDK)
apksigner verify --verbose mobile-v0.0.1.apk
# expect: Verifies
```

The release workflow runs both verifications automatically before creating the draft — a release will fail if either check doesn't pass.

To publish, visit the GitHub UI and click **Publish release**, or from the CLI:

```bash
gh release edit mobile-v0.0.1 --draft=false
```

---

## Retry a failed release

If a release run fails (network, runner, transient), you cannot re-run the workflow on the same tag because tag pushes are immutable triggers. Instead, re-tag with the next patch:

```bash
git tag mobile-v0.0.2
git push origin mobile-v0.0.2
```

If a draft release was partially created, delete it first:

```bash
gh release delete mobile-v0.0.1 --yes
git push origin --delete mobile-v0.0.1
```

Then push the next patch tag.

---

## Local developer setup

Local signed builds use the same `apps/<app>/android/app/key.properties` convention the release workflow materializes from Secrets. Gradle reads this file automatically — you do not need to change `build.gradle.kts`.

1. Place the keystore at `apps/<app>/android/app/release.keystore` (already gitignored).
2. Create `apps/<app>/android/app/key.properties` (already gitignored) with:
   ```properties
   storeFile=release.keystore
   storePassword=<local-store-pw>
   keyAlias=madkrapow_mobile
   keyPassword=<local-key-pw>
   ```
3. Build: `flutter build appbundle --release` from `apps/<app>/`.

If `key.properties` is absent, the signing config is skipped and the build fails on release mode — use `flutter build apk --debug` for day-to-day work.

---

## Never remove these gitignore lines

Both `apps/mobile/android/.gitignore` and `apps/merchant/android/.gitignore` contain these three patterns (lines 12-13 in each file):

```gitignore
key.properties
**/*.keystore
**/*.jks
```

**Do not remove them.** They are the last line of defense against accidentally committing signing material.

CI enforces this: the `gitignore-guard` job in `.github/workflows/android-ci.yml` fails every PR that removes any of these three lines. If you see that check fail, restore the patterns.

---

## `pubspec.yaml` version is informational only

Each app's `pubspec.yaml` declares `version: 1.0.0+1`. The release workflow **does not read** this value. The released version and `versionCode` are both derived from the git tag:

- `versionName` = `<major>.<minor>.<patch>[-pre]` from the tag
- `versionCode` = `major * 1_000_000 + minor * 1_000 + patch`

Examples:
- `mobile-v1.2.3` → `versionName=1.2.3`, `versionCode=1002003`
- `merchant-v0.0.1` → `versionName=0.0.1`, `versionCode=1`
- `mobile-v10.0.0` → `versionName=10.0.0`, `versionCode=10000000`

You may bump `pubspec.yaml` to match the latest tag for IDE/tooling clarity, but it is not required and CI will not enforce it.

---

## Post-release audit

After the first real release, spot-check the workflow log for any leaked secret values:

```bash
RUN_ID=$(gh run list --workflow=android-release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN_ID" --log | grep -E '(madkrapow123|storePassword=|keyPassword=)'
# Expected: no output
```

Any hit indicates a regression in the masking logic — file an issue immediately.

---

## Reference

- CI workflow: `.github/workflows/android-ci.yml` (analyze + test + debug-APK smoke, path-filtered matrix)
- Release workflow: `.github/workflows/android-release.yml` (signed AAB + APK + draft Release)
- Consensus plan: `.omc/plans/android-ci-release-consensus-plan.md`
- Deep interview spec: `.omc/specs/deep-interview-android-ci-release.md`

---

## In-app updater (sideload auto-update)

Both apps ship with a self-contained APK updater that polls this repo's GitHub Releases every 6 hours (plus on every cold start and resume) and downloads/installs new APKs **without going through the Play Store**. This section explains how testers interact with it.

### How it finds the right release

| App | Release tag prefix | Example |
|---|---|---|
| `apps/mobile` | `mobile-v` | `mobile-v1.2.3` |
| `apps/merchant` | `merchant-v` | `merchant-v1.2.3` |

The updater scans `/repos/noa10/madkrapow/releases`, picks the highest-versioned release whose `tag_name` starts with the prefix for that app, then reads `assets[0].browser_download_url` to find the APK. Version comparison is semver-aware (`1.10.0 > 1.9.9`).

### What testers see

**Per-device toggles** live under:

- Mobile app: **Profile → Settings → App Updates**
- Merchant app: **More → Settings → App Updates** (admin role required to open Settings)

Available controls:

- **Auto-update on Wi-Fi** — default **ON**. When a new release is found and the device is on Wi-Fi, the APK downloads silently (flutter_downloader shows a persistent progress notification) and then the system installer prompts once the file lands.
- **Auto-update on mobile data** — default **OFF**. Same behavior but over cellular.
- **Check for updates now** — force a check regardless of the 6-hour debounce. Shows the current version, last-checked time, any skipped version, and surfaces the manual dialog when an update is found.

**Manual mode dialog** (either toggle is off, or neither connectivity condition matches):

- New version + changelog (release body)
- Download size
- Actions: **Update now**, **Later**, **Skip this version**

Skipping a version persists until the user clears it from Settings or a newer release appears. "Later" re-prompts after 24 hours.

### Android permissions prompted at install time

- `REQUEST_INSTALL_PACKAGES` — required on Android 8+; the first time a tester taps **Update now**, Android asks "Allow from this source?" — they must grant it once per device. The in-app updater launches this system prompt via `permission_handler`.
- `POST_NOTIFICATIONS` (Android 13+) — used by flutter_downloader's progress notification. If denied, downloads still work; the notification just won't appear.
- `FOREGROUND_SERVICE_DATA_SYNC` — declared so Android 14+ allows flutter_downloader to keep downloading if the user backgrounds the app.

### Supported Android versions

Android 10 (API 29) through Android 15 (API 35). The updater tests for `Platform.isAndroid` before doing any network or file work, so iOS/desktop/web builds still compile and run normally — they just never detect an update.

### GitHub rate limiting

Unauthenticated requests share a 60/hr budget per IP. With 4 auto-checks per day (every 6h) this is never an issue for individual testers, but if a CI environment ever needs to check, set a `GITHUB_TOKEN` build-time define:

```bash
flutter build apk --release --dart-define=GITHUB_TOKEN=ghp_xxx...
```

Leaving `GITHUB_TOKEN` empty (the default) falls back to anonymous access.

### Testing the updater end-to-end

1. Install a build with a low version (e.g. `pubspec.yaml: version: 0.0.1+1`).
2. Cut a real release tag at a higher version: `git tag mobile-v9.9.9 && git push origin mobile-v9.9.9`.
3. Wait for the release workflow to finish and **publish** the draft (the updater only sees non-draft releases).
4. Open the app, tap **Check for updates now**.
5. Expect the manual dialog with the release notes from the tag. Tap **Update now** → grant install permission → the system installer takes over.
6. On first launch of the new version, the **What's new** screen appears once, showing the release body.

### Failure modes (none crash the app)

| Condition | Behavior |
|---|---|
| No internet | Check logs a warning, Settings shows "Could not reach GitHub" |
| No release matches the tag prefix | Shows "You're on the latest version." |
| Download fails mid-stream or size mismatches release metadata | Downloaded file is discarded, controller resets to idle |
| User denies `REQUEST_INSTALL_PACKAGES` | Settings shows "Could not launch installer" |
| GitHub rate limit hit (403 with `x-ratelimit-remaining: 0`) | Logged, manual check surfaces the error message |

### Source layout

Shared under `lib/core/services/update/` in both apps (files are byte-identical; each app configures `UpdaterConfig.appType` / `tagPrefix` in its `main.dart`):

- `github_updater.dart` — HTTP + download + install orchestration
- `update_controller.dart` — state machine feeding the UI
- `update_settings_service.dart` — SharedPreferences-backed toggles + cache
- `update_providers.dart` — Riverpod wiring
- `update_lifecycle_observer.dart` — WidgetsBindingObserver that triggers checks
- `app_updates_panel.dart` — Settings UI
- `update_dialog.dart` / `whats_new_screen.dart` — user-facing screens
