# Merchant v0.1.0

_Released 2026-05-12 · Tag `merchant-v0.1.0` · versionCode 1000_

First minor bump since the initial v0.0.1 release. Focused on staff authentication, shared slug routing, and the in-app updater so store staff can pick up future builds without manually downloading APKs.

## Highlights

- **Native Google Sign-In.** Store staff can sign in with Google from the device instead of the web-view fallback. Admin-role checks remain enforced server-side. OAuth setup steps are in `docs/google-sign-in-setup.md`.
- **In-app APK updater.** Polls this repo's GitHub Releases every 6 hours (plus cold start and resume) and prompts staff to install newer `merchant-v*` APKs. Toggle behavior under **More → Settings → App Updates** (admin role required). Full spec in `docs/android-release.md#in-app-updater-sideload-auto-update`.
- **Slug-aware menu routing.** Shared slug column on `menu_items` keeps the merchant admin view aligned with the customer-facing URLs already used by mobile and web.

## Fixes

- Merchant widget tests now stubbed correctly so CI's Dart analysis + test matrix stays green (`8b22845`).

## Commits (app-scoped)

- `b594788` feat(auth): native Google Sign-In for merchant app
- `30ee2f7` feat(db): add slug column to menu_items with backfill migration
- `d7f3644` feat(updater): add in-app GitHub APK updater to mobile and merchant
- `8b22845` fix(test): correct CI failures in merchant widget tests

## Upgrade notes

- **Existing staff on v0.0.1 must update manually one more time.** The in-app updater ships *inside* this release, so v0.0.1 cannot self-update to it. After installing v0.1.0 the updater takes over for subsequent releases.
- First launch on v0.1.0 shows a one-time **What's new** screen.
- No local database migrations required on the device — slug backfill was applied on the Supabase side.
- The stale `merchant-v0.0.2` draft (never published) remains on GitHub Releases and can be safely deleted; it predates this release branch.
