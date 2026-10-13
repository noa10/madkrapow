import { describe, it, expect } from 'vitest'
import { classifyPrs, runAutoupdate, buildSummary, makeGh, enrichWithBehindness } from './pr-autoupdate.mjs'

function pr(overrides = {}) {
  return {
    number: 1,
    title: 'Test PR',
    headRefName: 'feature/test',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'BEHIND',
    headRepositoryOwner: { login: 'noa10' },
    ...overrides,
  }
}

describe('classifyPrs', () => {
  it('selects mergeable BEHIND PRs as updatable', () => {
    const result = classifyPrs([pr()], { repoOwner: 'noa10' })
    expect(result.updatable.map((p) => p.number)).toEqual([1])
    expect(result.conflicts).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it('skips drafts', () => {
    const result = classifyPrs([pr({ isDraft: true })], { repoOwner: 'noa10' })
    expect(result.updatable).toHaveLength(0)
    expect(result.skipped[0].reason).toBe('draft PR')
  })

  it('routes CONFLICTING and DIRTY PRs to conflicts instead of attempting updates', () => {
    const result = classifyPrs(
      [pr({ mergeable: 'CONFLICTING' }), pr({ number: 2, mergeStateStatus: 'DIRTY' })],
      { repoOwner: 'noa10' }
    )
    expect(result.updatable).toHaveLength(0)
    expect(result.conflicts.map((p) => p.number)).toEqual([1, 2])
  })

  it('skips PRs up to date with their base', () => {
    const result = classifyPrs([pr({ mergeStateStatus: 'CLEAN' })], { repoOwner: 'noa10' })
    expect(result.updatable).toHaveLength(0)
    expect(result.skipped[0].reason).toBe('up to date with base')
  })

  it('skips PRs whose mergeability is still computing', () => {
    const result = classifyPrs([pr({ mergeable: 'UNKNOWN' })], { repoOwner: 'noa10' })
    expect(result.updatable).toHaveLength(0)
    expect(result.skipped[0].reason).toContain('still computing')
  })

  it('skips fork PRs (update-branch does not support them)', () => {
    const result = classifyPrs([pr({ headRepositoryOwner: { login: 'contributor' } })], {
      repoOwner: 'noa10',
    })
    expect(result.updatable).toHaveLength(0)
    expect(result.skipped[0].reason).toContain('fork')
  })

  it('skips other merge states with an explanatory reason', () => {
    const result = classifyPrs([pr({ mergeStateStatus: 'BLOCKED' })], { repoOwner: 'noa10' })
    expect(result.skipped[0].reason).toContain('BLOCKED')
  })

  it('handles an empty PR list', () => {
    const result = classifyPrs([], { repoOwner: 'noa10' })
    expect(result).toEqual({ updatable: [], conflicts: [], skipped: [] })
  })

  // Regression: this repo has no branch protection, so GitHub never reports
  // mergeStateStatus === 'BEHIND'. Behind PRs report CLEAN or UNSTABLE (PR #399
  // reported CLEAN while 29 commits behind). Behindness must come from the
  // compare API, otherwise the bot silently updates nothing.
  it('updates PRs behind per the compare API even when mergeStateStatus is CLEAN/UNSTABLE', () => {
    const result = classifyPrs(
      [
        pr({ number: 20, mergeStateStatus: 'CLEAN', behindBy: 29 }),
        pr({ number: 21, mergeStateStatus: 'UNSTABLE', behindBy: 4 }),
      ],
      { repoOwner: 'noa10' }
    )
    expect(result.updatable.map((p) => p.number)).toEqual([20, 21])
    expect(result.skipped).toHaveLength(0)
  })

  it('treats a compare API behindBy of 0 as up to date, overriding a stale BEHIND status', () => {
    const result = classifyPrs([pr({ mergeStateStatus: 'BEHIND', behindBy: 0 })], { repoOwner: 'noa10' })
    expect(result.updatable).toHaveLength(0)
    expect(result.skipped[0].reason).toBe('up to date with base')
  })

  it('never updates a CONFLICTING PR even if the compare call reported it behind', () => {
    const result = classifyPrs([pr({ mergeable: 'CONFLICTING', behindBy: 3 })], { repoOwner: 'noa10' })
    expect(result.updatable).toHaveLength(0)
    expect(result.conflicts).toHaveLength(1)
  })

  it('falls back to mergeStateStatus when behindness is unknown', () => {
    const behind = classifyPrs([pr({ mergeStateStatus: 'BEHIND', behindBy: undefined })], {
      repoOwner: 'noa10',
    })
    expect(behind.updatable).toHaveLength(1)

    const unknown = classifyPrs([pr({ mergeStateStatus: 'BLOCKED', behindBy: undefined })], {
      repoOwner: 'noa10',
    })
    expect(unknown.updatable).toHaveLength(0)
    expect(unknown.skipped[0].reason).toContain('behindness unknown')
  })
})

describe('enrichWithBehindness', () => {
  const prs = [
    pr({ number: 30 }),
    pr({ number: 31, isDraft: true }),
    pr({ number: 32, mergeable: 'CONFLICTING' }),
    pr({ number: 33, headRepositoryOwner: { login: 'contributor' } }),
    pr({ number: 34, mergeStateStatus: 'CLEAN' }),
  ]

  it('only queries the compare API for PRs that could be updatable', async () => {
    const asked = []
    const gh = {
      countBehindBy: async (number) => {
        asked.push(number)
        return number === 30 ? 5 : 0
      },
    }

    const enriched = await enrichWithBehindness({
      gh,
      prs,
      baseBranch: 'master',
      repoOwner: 'noa10',
    })

    expect(asked).toEqual([30, 34])
    expect(enriched.find((p) => p.number === 30).behindBy).toBe(5)
    expect(enriched.find((p) => p.number === 34).behindBy).toBe(0)
    // Skipped PRs must not carry a behindBy value at all.
    expect(enriched.find((p) => p.number === 31).behindBy).toBeUndefined()
    expect(enriched.find((p) => p.number === 33).behindBy).toBeUndefined()
  })

  it('leaves behindBy undefined when the compare call fails, so classification falls back', async () => {
    const gh = {
      countBehindBy: async () => {
        throw new Error('HTTP 404')
      },
    }

    const enriched = await enrichWithBehindness({
      gh,
      prs: [pr({ number: 30, mergeStateStatus: 'BEHIND' })],
      baseBranch: 'master',
      repoOwner: 'noa10',
    })

    expect(enriched[0].behindBy).toBeUndefined()
    const result = classifyPrs(enriched, { repoOwner: 'noa10' })
    expect(result.updatable).toHaveLength(1)
  })
})

describe('runAutoupdate', () => {
  it('updates only the updatable PRs and reports the rest untouched', async () => {
    const calls = []
    const gh = {
      updateBranch: async (number) => {
        calls.push(number)
      },
    }
    const report = await runAutoupdate({
      gh,
      prs: [
        pr({ number: 10, mergeStateStatus: 'BEHIND' }),
        pr({ number: 11, mergeStateStatus: 'CLEAN' }),
        pr({ number: 12, mergeable: 'CONFLICTING' }),
        pr({ number: 13, isDraft: true }),
      ],
      repoOwner: 'noa10',
    })

    expect(calls).toEqual([10])
    expect(report.updated.map((p) => p.number)).toEqual([10])
    expect(report.conflicts.map((p) => p.number)).toEqual([12])
    expect(report.skipped).toHaveLength(2)
  })

  it('records failures per PR and keeps updating the rest', async () => {
    const gh = {
      updateBranch: async (number) => {
        if (number === 10) throw new Error('HTTP 422: not allowed')
      },
    }
    const report = await runAutoupdate({
      gh,
      prs: [pr({ number: 10 }), pr({ number: 11 })],
      repoOwner: 'noa10',
    })

    expect(report.updated.map((p) => p.number)).toEqual([11])
    expect(report.failed).toEqual([
      { pr: expect.objectContaining({ number: 10 }), error: expect.stringContaining('422') },
    ])
  })

  it('dry run reports updatable PRs without calling update-branch', async () => {
    const calls = []
    const gh = {
      updateBranch: async (number) => {
        calls.push(number)
      },
    }
    const report = await runAutoupdate({
      gh,
      prs: [pr({ number: 10 }), pr({ number: 11 })],
      repoOwner: 'noa10',
      dryRun: true,
    })

    expect(calls).toEqual([])
    expect(report.updated.map((p) => p.number)).toEqual([10, 11])
    expect(report.failed).toEqual([])
    expect(report.dryRun).toBe(true)
  })
})

describe('buildSummary', () => {
  const report = {
    updated: [pr({ number: 10, title: 'Feature A' })],
    conflicts: [pr({ number: 12, title: 'Conflicted' })],
    skipped: [
      { pr: pr({ number: 11, mergeStateStatus: 'CLEAN' }), reason: 'up to date with base' },
    ],
    failed: [{ pr: pr({ number: 13, title: 'Broken' }), error: 'HTTP 500' }],
  }

  it('renders counts and sections', () => {
    const summary = buildSummary(report, { ciRetrigger: true })
    expect(summary).toContain('| Updated (base merged in, CI re-runs) | 1 |')
    expect(summary).toContain('- #10 Feature A')
    expect(summary).toContain('### Conflicts — manual attention')
    expect(summary).toContain('- #13 Broken — HTTP 500')
    expect(summary).toContain('<details><summary>Skipped PRs</summary>')
  })

  it('warns when CI will not re-trigger (GITHUB_TOKEN fallback)', () => {
    const summary = buildSummary({ updated: [], failed: [], conflicts: [], skipped: [] }, {
      ciRetrigger: false,
    })
    expect(summary).toContain('AUTO_UPDATE_TOKEN')
  })

  it('labels a dry run so it cannot be mistaken for a real update', () => {
    const summary = buildSummary(
      { updated: [pr()], failed: [], conflicts: [], skipped: [], dryRun: true },
      { ciRetrigger: true }
    )
    expect(summary).toContain('Dry run')
    expect(summary).not.toContain('AUTO_UPDATE_TOKEN')
  })
})

describe('makeGh', () => {
  it('builds the right gh commands', async () => {
    const calls = []
    const exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      if (args[0] === 'pr' && args[1] === 'list') {
        return { stdout: JSON.stringify([pr()]), stderr: '' }
      }
      return { stdout: '', stderr: '' }
    }
    const gh = makeGh({ exec, repo: 'noa10/madkrapow' })

    const prs = await gh.listOpenPrs()
    await gh.updateBranch(42)

    expect(calls[0]).toEqual([
      'gh', 'pr', 'list', '--repo', 'noa10/madkrapow', '--state', 'open',
      '--limit', '200', '--json',
      'number,title,headRefName,isDraft,mergeable,mergeStateStatus,headRepositoryOwner',
    ])
    expect(calls[1]).toEqual(['gh', 'pr', 'update-branch', '--repo', 'noa10/madkrapow', '42'])
    expect(prs).toHaveLength(1)
  })

  it('reads behindness from the compare API', async () => {
    const calls = []
    const exec = async (cmd, args) => {
      calls.push([cmd, ...args])
      const joined = args.join(' ')
      if (joined.includes('--json') && joined.includes('headRefName')) {
        return { stdout: 'feature/test', stderr: '' }
      }
      if (args[0] === 'api') return { stdout: '29\n', stderr: '' }
      return { stdout: '', stderr: '' }
    }
    const gh = makeGh({ exec, repo: 'noa10/madkrapow' })

    expect(await gh.countBehindBy(7, 'master')).toBe(29)
    expect(calls[1]).toEqual([
      'gh', 'api', 'repos/noa10/madkrapow/compare/master...feature/test', '--jq', '.behind_by',
    ])
  })

  it('returns undefined (not NaN) when the compare output is not a number', async () => {
    const exec = async (cmd, args) => {
      const joined = args.join(' ')
      if (joined.includes('--json') && joined.includes('headRefName')) {
        return { stdout: 'feature/test', stderr: '' }
      }
      if (args[0] === 'api') return { stdout: '', stderr: '' }
      return { stdout: '', stderr: '' }
    }
    const gh = makeGh({ exec, repo: 'noa10/madkrapow' })

    expect(await gh.countBehindBy(7, 'master')).toBeUndefined()
  })
})
