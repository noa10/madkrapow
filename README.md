# Mad Krapow

A food delivery web application built with Next.js, Supabase, and Stripe.

## Getting Started

See the project documentation in `docs/` for setup and architecture details.

## Android Releases

Mobile (`apps/mobile`) and merchant (`apps/merchant`) Android apps are released via `.github/workflows/android-release.yml`, triggered by app-scoped tags (`mobile-v*`, `merchant-v*`). See [`docs/android-release.md`](docs/android-release.md) for the secrets setup, keystore rotation, and release procedure.

## Dependency Management

Dependencies are managed automatically via [Dependabot](https://docs.github.com/en/code-security/dependabot).

### How It Works

1. **Weekly PRs:** Dependabot opens PRs for npm and GitHub Actions updates every week (limit: 20 open PRs).
2. **Auto-merge:** Patch (`1.0.x`) and minor (`1.x.0`) updates are auto-merged via GitHub Actions after CI passes.
3. **Manual review:** Major (`x.0.0`) updates require manual review. They are labeled `needs-manual-review`.
4. **Stale cleanup:** Conflicted PRs are auto-commented after detection and closed after 14 days of inactivity.

### Grouped Updates

Related packages are grouped into single PRs to reduce noise:
- `@typescript-eslint/*` + `typescript-eslint`
- `@sentry/*`
- `supabase` + `@supabase/*`

### Manual Override

To merge a major update manually:
```bash
gh pr merge <PR_NUMBER> --squash
```

To prevent a package from being updated:
1. Add it to the `ignore` list in `.github/dependabot.yml`.
2. See [Dependabot docs](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file) for syntax.

### Rollback

If a merged dependency update causes issues:
```bash
git revert <MERGE_COMMIT_SHA>
```
