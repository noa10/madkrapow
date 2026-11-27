import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusTabs } from './StatusTabs'

function render(activeTab: 'preparing' | 'ready' | 'upcoming' | 'history') {
  return renderToStaticMarkup(
    createElement(StatusTabs, {
      activeTab,
      onTabChange: () => {},
      counts: { preparing: 3, ready: 0, upcoming: null, history: 12 },
    })
  )
}

describe('StatusTabs', () => {
  it('lays the four tabs out as equal full-width columns', () => {
    const html = render('preparing')

    expect(html.match(/role="tab"/g)).toHaveLength(4)
    expect(html).toContain('grid-cols-4')
    expect(html).not.toContain('overflow-x-auto')
  })

  it('marks only the active tab as selected', () => {
    const html = render('ready')
    const buttons = html.split('<button').slice(1)
    const selected = buttons.filter((button) => button.includes('aria-selected="true"'))

    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(selected).toHaveLength(1)
    expect(selected[0]).toContain('Ready')
    expect(selected[0]).not.toContain('Preparing')
  })

  it('shows counts only once they are known', () => {
    const html = render('preparing')

    expect(html).toContain('>3</span>')
    expect(html).toContain('>0</span>')
    expect(html).toContain('>12</span>')
    // `upcoming` is still loading — it must render no badge at all.
    expect(html.match(/tabular-nums/g)).toHaveLength(3)
  })
})
