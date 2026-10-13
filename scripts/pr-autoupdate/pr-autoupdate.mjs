#!/usr/bin/env node
/**
 * PR Auto-Update — keeps open PRs current with their base branch.
 *
 * Motivation: PR #399 sat open while master moved 29 commits; green CI on the
 * old base proved nothing about the code that landed. This bot updates every
 * open, non-draft, same-repo PR that is BEHIND its base (via
 * `gh pr update-branch`, which merges the base in and re-triggers CI), and
 * reports conflicted PRs instead of touching them.
 *
 * Run inside Actions (schedule + workflow_dispatch, see
 * .github/workflows/pr-autoupdate.yml). Summary is written to
 * $GITHUB_STEP_SUMMARY and stdout. Exit 1 only when an update attempt failed;
 * conflicts/skips are expected states, not failures.
 *
 * Token note: pushes made with the repository's GITHUB_TOKEN do NOT re-trigger
 * CI. Prefer the AUTO_UPDATE_TOKEN secret (a PAT) so updated branches get a
 * fresh CI run; the bot falls back to GITHUB_TOKEN and says so in the summary.
 */

import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)

const BASE_BRANCH = 'master'

/**
 * Classify open PRs into updatable / conflicts / skipped.
 * Pure — fully covered by tests; the CLI just executes the plan.
 */
export function classifyPrs(prs, { repoOwner } = {}) {
  const updatable = []
  const conflicts = []
  const skipped = []

  for (const pr of prs ?? []) {
    if (pr.isDraft) {
      skipped.push({ pr, reason: 'draft PR' })
      continue
    }
    if (repoOwner && pr.headRepositoryOwner?.login && pr.headRepositoryOwner.login !== repoOwner) {
      skipped.push({ pr, reason: `fork (${pr.headRepositoryOwner.login}) — update-branch unsupported` })
      continue
    }
    if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
      conflicts.push(pr)
      continue
    }
    if (pr.mergeable === 'UNKNOWN') {
      skipped.push({ pr, reason: 'GitHub is still computing mergeability' })
      continue
    }
    if (pr.mergeStateStatus === 'BEHIND' && pr.mergeable === 'MERGEABLE') {
      updatable.push(pr)
      continue
    }
    if (pr.mergeStateStatus === 'CLEAN') {
      skipped.push({ pr, reason: 'up to date with base' })
      continue
    }
    skipped.push({ pr, reason: `merge state ${pr.mergeStateStatus ?? 'UNKNOWN'} (${pr.mergeable ?? '?'})` })
  }

  return { updatable, conflicts, skipped }
}

/**
 * Attempt update-branch for every updatable PR; failures are recorded and do
 * not stop the run.
 */
export async function runAutoupdate({ gh, prs, repoOwner, baseBranch = BASE_BRANCH }) {
  const { updatable, conflicts, skipped } = classifyPrs(prs, { repoOwner })
  const updated = []
  const failed = []

  for (const pr of updatable) {
    try {
      await gh.updateBranch(pr.number, baseBranch)
      updated.push(pr)
    } catch (err) {
      failed.push({ pr, error: String(err.message ?? err) })
    }
  }

  return { updated, failed, conflicts, skipped }
}

function prLabel(pr) {
  return `#${pr.number} ${pr.title ?? pr.headRefName ?? ''}`.trim()
}

/** Markdown job summary. */
export function buildSummary(report, { ciRetrigger }) {
  const lines = []
  lines.push('## PR Auto-Update report')
  lines.push('')
  if (!ciRetrigger) {
    lines.push(
      '> ⚠️ Running with `GITHUB_TOKEN`: branches are updated, but GitHub does **not** re-trigger CI on those pushes. Add an `AUTO_UPDATE_TOKEN` secret (PAT) for fresh CI runs.'
    )
    lines.push('')
  }
  lines.push(`| Outcome | Count |`)
  lines.push(`| --- | --- |`)
  lines.push(`| Updated (base merged in, CI re-runs) | ${report.updated.length} |`)
  lines.push(`| Conflicted (needs manual rebase) | ${report.conflicts.length} |`)
  lines.push(`| Skipped | ${report.skipped.length} |`)
  lines.push(`| Failed update attempts | ${report.failed.length} |`)
  lines.push('')

  if (report.updated.length > 0) {
    lines.push('### Updated')
    lines.push('')
    for (const pr of report.updated) lines.push(`- ${prLabel(pr)}`)
    lines.push('')
  }
  if (report.conflicts.length > 0) {
    lines.push('### Conflicts — manual attention')
    lines.push('')
    for (const pr of report.conflicts) lines.push(`- ${prLabel(pr)}`)
    lines.push('')
  }
  if (report.failed.length > 0) {
    lines.push('### Failed update attempts')
    lines.push('')
    for (const { pr, error } of report.failed) lines.push(`- ${prLabel(pr)} — ${error}`)
    lines.push('')
  }
  if (report.skipped.length > 0) {
    lines.push('<details><summary>Skipped PRs</summary>')
    lines.push('')
    for (const { pr, reason } of report.skipped) lines.push(`- ${prLabel(pr)} — ${reason}`)
    lines.push('')
    lines.push('</details>')
  }
  return lines.join('\n')
}

/**
 * Real gh-backed implementation. Injectable exec for tests.
 */
export function makeGh({ exec = execFile, repo } = {}) {
  const repository = repo ?? process.env.GITHUB_REPOSITORY
  return {
    async listOpenPrs() {
      const { stdout } = await exec('gh', [
        'pr', 'list',
        '--repo', repository,
        '--state', 'open',
        '--limit', '200',
        '--json', 'number,title,headRefName,isDraft,mergeable,mergeStateStatus,headRepositoryOwner',
      ])
      return JSON.parse(stdout)
    },
    async updateBranch(number) {
      await exec('gh', ['pr', 'update-branch', '--repo', repository, String(number)])
    },
  }
}

async function main() {
  const gh = makeGh()
  const repoOwner = (process.env.GITHUB_REPOSITORY ?? '').split('/')[0]
  const prs = await gh.listOpenPrs()
  const report = await runAutoupdate({ gh, prs, repoOwner })

  const usingPat = Boolean(process.env.AUTO_UPDATE_TOKEN)
  const summary = buildSummary(report, { ciRetrigger: usingPat })
  console.log(summary)

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(summaryPath, `${summary}\n`)
  }

  if (report.failed.length > 0) {
    process.exitCode = 1
  }
}

// Auto-run when executed directly.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
