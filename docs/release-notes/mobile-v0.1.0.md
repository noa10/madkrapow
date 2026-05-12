# Mobile v0.1.0

_Released 2026-05-12 · Tag `mobile-v0.1.0` · versionCode 1000_

First minor bump since the initial v0.0.1 release. Focused on authentication, slug-based deep links, and an in-app updater so future APKs can roll out without another sideload.

## Highlights

- **Native Google Sign-In.** Customers can now sign in with Google directly from the mobile app instead of going through the web-view fallback. See `docs/google-sign-in-setup.md` for the OAuth client configuration.
- **In-app APK updater.** The app polls this repo's GitHub Releases every 6 hours (plus cold start and resume) and prompts testers to install newer `mobile-v*` APKs without opening the browser. Toggle behavior under **Profile → Settings → App Updates**. Full spec in `docs/android-release.md#in-app-updater-sideload-auto-update`.
- **Slug-based menu item URLs.** Menu items now resolve by slug (e.g. `/item/khao-pad-moo`) instead of UUID, matching the web app's canonical form. Deep links from web remain backward compatible through a DB backfill.

## Fixes

- Mobile widget tests now supply updater provider overrides so CI no longer flakes on missing Riverpod dependencies (`32464e2`).

## Commits (app-scoped)

- `2df9191` feat(auth): native Google Sign-In for mobile app
- `30ee2f7` feat(db): add slug column to menu_items with backfill migration
- `d7f3644` feat(updater): add in-app GitHub APK updater to mobile and merchant
- `013e84d` chore(updater): register new plugins for macOS and Windows targets
- `32464e2` fix(test): supply updater provider overrides in mobile widget test

## Upgrade notes

- **Existing testers on v0.0.1 should update manually one more time.** The in-app updater ships *inside* this release, so v0.0.1 cannot self-update to it. After installing v0.1.0 the updater takes over for subsequent releases.
- First launch on v0.1.0 triggers a one-time **What's new** screen summarizing this release body.
- No database migrations required on the client — slug data was backfilled server-side.
