import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OrderItemNotes } from './OrderItemNotes'

describe('OrderItemNotes', () => {
  it('renders each packed add-on or remark on its own line', () => {
    const html = renderToStaticMarkup(createElement(OrderItemNotes, {
      notes: 'Tak Pedas | 2x Extra egg | | Thai Holy Basil | No cutlery',
    }))

    expect(html.match(/<p\b/g)).toHaveLength(4)
    expect(html).toContain('Tak Pedas</p>')
    expect(html).toContain('2x Extra egg</p>')
    expect(html).toContain('Thai Holy Basil</p>')
    expect(html).toContain('No cutlery</p>')
    expect(html).not.toContain('|')
  })

  it('retains a single note and omits empty notes', () => {
    const html = renderToStaticMarkup(createElement(OrderItemNotes, { notes: 'No chilli' }))
    expect(html).toContain('<strong>Note:</strong> No chilli</p>')
    expect(renderToStaticMarkup(createElement(OrderItemNotes, { notes: null }))).toBe('')
    expect(renderToStaticMarkup(createElement(OrderItemNotes, { notes: ' |  | ' }))).toBe('')
  })
})
