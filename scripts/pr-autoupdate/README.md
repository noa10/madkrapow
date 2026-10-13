# PR Auto-Update

Scheduled bot that keeps open PRs current with `master` so CI always validates
the code that would actually land. Born from PR #399 landing 29 commits behind
master with green CI on the old base.

## What it does

Runs every 6 hours (and on demand via *Run workflow*) as
[.github/workflows/pr-autoupdate.yml](../../.github/workflows/pr-autoupdate.yml):

| PR state | Action |
| --- | --- |
| `BEHIND` + mergeable | `gh pr update-branch` — merges master into the branch; the push re-runs CI |
| Conflicted (`CONFLICTING` / `DIRTY`) | Left alone, listed under "Conflicts" in the job summary |
| Draft | Skipped |
| Fork head | Skipped (`update-branch` doesn't support forks) |
| `CLEAN` / `BLOCKED` / unknown | Skipped with a reason (see summary) |

The report lands in the workflow run's job summary; exit code is 1 only when an
update attempt itself failed (so GitHub emails you about real breakage —
conflicts and skips are expected states and don't fail the run).

## Setup (one time)

1. **Token (required for CI re-runs).** Pushes made with the repo's
   `GITHUB_TOKEN` do not trigger other workflows, so branch updates would not
   re-run CI. Create a classic PAT with `repo` scope (or a fine-grained token
   with Contents: read/write + Pull requests: read/write) and add it as the
   repository secret `AUTO_UPDATE_TOKEN`. Without it the bot still updates
   branches but says in the summary that CI won't re-run.
2. **Repo setting.** Settings → General → Pull Requests → enable **Allow
   updating pull request branches** (needed by the `update-branch` endpoint).

## Relation to dependabot-stale.yml

`dependabot-stale.yml` closes Dependabot PRs that stay conflicted for 14 days.
This bot prevents them from *becoming* conflicted in the first place by
updating them as master moves. Both can coexist: auto-update keeps PRs fresh;
the stale workflow is the last-resort cleanup.
