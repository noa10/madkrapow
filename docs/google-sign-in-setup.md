# Google Sign-In (native) — setup guide

Both Flutter apps (`apps/mobile`, `apps/merchant`) authenticate Google users through the native picker (`google_sign_in`) and exchange the returned id token with Supabase via `signInWithIdToken`. No browser redirect is used.

This document captures the one-time Google Cloud, Supabase, Android and iOS wiring required on top of the code changes.

---

## 1. Google Cloud — OAuth 2.0 Clients

Create **three** OAuth 2.0 clients in the same Google Cloud project
(APIs & Services → Credentials → Create credentials → OAuth client ID):

| # | Application type | Name suggestion | Used for |
|---|------------------|-----------------|----------|
| 1 | **Web application** | `madkrapow-supabase-web` | Supabase provider config + `serverClientId` for both apps |
| 2 | **Android** | `madkrapow-mobile-android` and `madkrapow-merchant-android` (one per app) | Android builds |
| 3 | **iOS** | `madkrapow-mobile-ios` and `madkrapow-merchant-ios` (one per app) | iOS builds |

### Scopes (OAuth consent screen)

Add these scopes under the OAuth consent screen → **Scopes**:

- `openid`
- `./auth/userinfo.email`  (alias: `email`)
- `./auth/userinfo.profile` (alias: `profile`)

### Android client parameters

Use the applicationId from `android/app/build.gradle.kts`:

- mobile: `com.madkrapow.madkrapow_mobile`
- merchant: `com.madkrapow.merchant`

Get the debug SHA-1 (one per developer machine):

```bash
keytool -list -v -alias androiddebugkey \
  -keystore ~/.android/debug.keystore \
  -storepass android -keypass android \
  | grep "SHA1:"
```

Get the release SHA-1 (from `android/app/key.properties` → `storeFile`):

```bash
keytool -list -v \
  -keystore <path-to-release.jks> \
  -alias <keyAlias> \
  | grep "SHA1:"
```

Paste every SHA-1 you want to accept (debug + release, per developer) into the Android OAuth client. Repeat for the merchant Android client.

### iOS client parameters

- Bundle ID: read from `ios/Runner.xcodeproj/project.pbxproj` → `PRODUCT_BUNDLE_IDENTIFIER`
  - mobile default: `com.madkrapow.mobile` (adjust to your project's actual value)
  - merchant default: `com.madkrapow.merchant`

After creating the iOS client, Google Cloud shows a `REVERSED_CLIENT_ID` (format `com.googleusercontent.apps.XXXXXXXX-YYYYYYYY`). You need it in step 4.

---

## 2. Supabase Dashboard — enable Google provider

1. Open Supabase Dashboard → **Authentication → Providers → Google**.
2. Enable the provider.
3. Paste the **Web client ID** (from step 1 #1) into **Client ID (for OAuth)**.
4. Paste the **Web client secret** (same client) into **Client Secret**.
5. In **Authorized Client IDs** (comma-separated), add the same Web client ID **first**, followed by the iOS and Android client IDs. Example:
   ```
   WEB_ID.apps.googleusercontent.com,IOS_MOBILE_ID.apps.googleusercontent.com,IOS_MERCHANT_ID.apps.googleusercontent.com
   ```
   (Android clients do not need to be listed — Android tokens are minted by the Web/Server client because we pass `serverClientId` to `GoogleSignIn`.)
6. **Skip nonce check** can stay **off** (we do not pass a nonce; the plugin-minted id token is consumed directly).
7. Save.

---

## 3. `.env` — per-app configuration

Both apps read Google client IDs through `envied`. Update each `.env` file:

**`apps/mobile/.env`** and **`apps/merchant/.env`**

```env
GOOGLE_WEB_CLIENT_ID=<the Web client ID — same value pasted into Supabase>
GOOGLE_IOS_CLIENT_ID=<the iOS client ID for THIS app>
```

Then regenerate the envied bindings:

```bash
# mobile
cd apps/mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs

# merchant
cd ../merchant
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

> The Android `GoogleSignIn` client uses `serverClientId` (the Web ID), so there is no separate `GOOGLE_ANDROID_CLIENT_ID` variable — the Android OAuth client is matched at runtime by package name + SHA-1 registered in Google Cloud.

---

## 4. iOS — REVERSED_CLIENT_ID in `Info.plist`

Both `apps/mobile/ios/Runner/Info.plist` and `apps/merchant/ios/Runner/Info.plist` already have a placeholder URL scheme under `CFBundleURLTypes`:

```xml
<string>REPLACE_WITH_REVERSED_CLIENT_ID</string>
```

Replace each placeholder with the app-specific `REVERSED_CLIENT_ID` from step 1 (iOS clients):

- mobile: the reversed id from `madkrapow-mobile-ios`
- merchant: the reversed id from `madkrapow-merchant-ios`

Format: `com.googleusercontent.apps.XXXXXXXX-YYYYYYYY`. No other iOS config is required — `google_sign_in` reads the scheme directly.

---

## 5. Verification — what "works" looks like

After the above:

- Tap **Continue with Google** → the in-app account picker appears (no Safari, no Chrome Custom Tab).
- Pick an account → app lands on the home screen (mobile) or the merchant dashboard (merchant).
- Hit **Cancel** in the picker → no error, user stays on the sign-in screen.
- Sign out → the next **Continue with Google** tap re-shows the account picker (Supabase + google_sign_in both cleared).
- Kill and relaunch the app → the session persists (Supabase session in secure storage).

If the Android build fails with `ApiException: 10` (DEVELOPER_ERROR), double-check that:
- the debug SHA-1 of the current machine is registered in the Android OAuth client,
- the package name matches `applicationId`, and
- `GOOGLE_WEB_CLIENT_ID` in `.env` is the Web client (not the Android client).

If Supabase returns `invalid_grant` / `bad_jwt` on the `signInWithIdToken` call, the Web Client ID listed in Supabase's **Authorized Client IDs** does not match the `serverClientId` the plugin used.
