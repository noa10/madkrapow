import { describe, it, expect } from 'vitest'
import { classifyPrs, runAutoupdate, buildSummary, makeGh } from './pr-autoupdate.mjs'

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
})
