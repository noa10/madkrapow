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
