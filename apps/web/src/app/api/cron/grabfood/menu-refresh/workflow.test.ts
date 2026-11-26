import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const workflow = await readFile(new URL('../../../../../../../../.github/workflows/grabfood-menu-refresh.yml', import.meta.url), 'utf8')

describe('GrabFood menu refresh workflow', () => {
  it('never follows redirects so credentials are not forwarded', () => {
    expect(workflow).not.toMatch(/curl[^\n]*-L\b/)
    expect(workflow).not.toMatch(/--location/)
    expect(workflow).toMatch(/--fail-with-body/)
  })
  it('fails unless the handler reports a successful refresh decision', () => {
    expect(workflow).toMatch(/\.notified/)
    expect(workflow).toMatch(/\.notified == true or \.skipped == true/)
  })
  it('surfaces a disabled integration instead of treating it as an idle queue', () => {
    expect(workflow).toMatch(/::warning::/)
    expect(workflow).toMatch(/reason/)
  })
})
